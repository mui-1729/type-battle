import type { AckResponse, RoomState, TypingFinish, TypingProgress } from "@type-battle/shared";
import {
  advanceProgress,
  advanceRomajiProgress,
  buildRomajiTypingPlan,
  calculateAccuracy,
  calculateWpm,
  createEmptyProgress,
  getPromptsByCategory,
  getRomajiTypingUnitIndex,
  pickPrompt,
  rankPlayers,
} from "@type-battle/shared";
import { isValidRoomCode, normalizeNickname, validateNickname } from "@type-battle/shared";
import type {
  BotDifficulty,
  DeviceKind,
  MatchResult,
  MatchRule,
  MatchStatus,
  PlayerState,
  Prompt,
  PromptCategory
} from "@type-battle/shared";
import type {
  CloudflareClientMessageType,
  CloudflareServerEventEnvelope,
  CloudflareServerEventType,
  CloudflareServerMessage
} from "@type-battle/shared/cloudflare-events";
import type { RoomEngineHooks } from "@type-battle/shared/room-engine";
import { readCloudflareClientIp } from "./client-ip.js";
import { normalizeRoomCode, resolveRoomRoute } from "./room-routing.js";
import { RateLimiter } from "./rate-limiter.js";
import {
  isCloudflareClientMessageType,
  isWebSocketUpgrade,
  parseAccessoryPayload,
  parseBotDifficultyPayload,
  parseClientMessage,
  parseCreateRoomPayload,
  parseJoinRoomPayload,
  parseMatchRulePayload,
  parsePromptCategoryPayload,
  parseReactionPayload,
  parseReadyPayload,
  parseRoomCodePayload,
  parseTypingPayload,
  isValidTypingPayloadValues,
  MAX_WEB_SOCKET_MESSAGE_BYTES,
  getUtf8ByteLength,
} from "./room-protocol.js";
import {
  GATEWAY_ROOM_RATE_LIMIT_PATH,
  type RoomRateLimitAction,
  type RoomRateLimitInput,
  type RoomRateLimitResult
} from "./realtime-gateway.js";

type CloudflareSocketLike = {
  readyState: number;
  accept(): void;
  addEventListener(type: "message", handler: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", handler: (event: CloseEvent) => void): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
};

type SocketState = {
  socketId: string;
  clientIp: string;
  playerId?: string;
  roomCode?: string;
};

type AttachSocketOptions = {
  clientIp?: string;
  roomCode?: string;
};

type PersistedRoomSnapshot = {
  schemaVersion?: number;
  room: RoomState;
  playerSessions?: Record<string, string>;
  disconnectedAt?: Record<string, number>;
  internal?: {
    round?: number;
    promptHistory?: string[];
    createdAt?: number;
    lastActivityAt?: number;
    finishedAt?: number;
    typingState?: Record<string, PersistedPlayerTypingState>;
  };
};

type PersistedPlayerTypingState = {
  typingProgressIndex?: number;
  pendingInput?: string;
  lastInputSequence?: number;
};

type RoomAuthorityEnv = {
  TIME_ATTACK_MS?: string | number;
  GATEWAY?: {
    getByName(name: string): {
      fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    };
  };
};

type InternalPlayer = PlayerState & {
  socketId: string;
  sessionId: string;
  disconnectedAt?: number;
  typingProgressIndex: number;
  pendingInput: string;
  lastInputSequence: number;
};

type InternalRoom = {
  roomCode: string;
  hostPlayerId: string;
  status: MatchStatus;
  matchRule: MatchRule;
  botDifficulty: BotDifficulty;
  promptCategory: PromptCategory;
  prompt?: Prompt;
  promptHistory: string[];
  serverStartAt?: number;
  matchEndsAt?: number;
  suddenDeath?: boolean;
  result?: MatchResult;
  players: Map<string, InternalPlayer>;
  createdAt: number;
  lastActivityAt: number;
  finishedAt?: number;
  round: number;
};

type GatewayTimers = {
  countdown?: ReturnType<typeof setTimeout> | undefined;
  bot?: ReturnType<typeof setInterval> | undefined;
  persist?: ReturnType<typeof setTimeout> | undefined;
};

type GuestSessionStorageRecord = Parameters<NonNullable<RoomEngineHooks["recordGuestSession"]>>[0] & {
  createdAt: string;
  lastSeenAt: string;
};

type MatchResultStorageRecord = Parameters<NonNullable<RoomEngineHooks["recordMatchResult"]>>[0] & {
  createdAt: string;
};

const OPEN_STATE = 1;
const ROOM_STORAGE_KEY = "room";
const RETENTION_ALARM_STORAGE_KEY = "retention-alarm-at";
const ROOM_SNAPSHOT_SCHEMA_VERSION = 2;
const GUEST_SESSION_STORAGE_PREFIX = "guest-session:";
const MATCH_RESULT_STORAGE_PREFIX = "match-result:";
const BOT_TICK_MS = 500;
const DEFAULT_TIME_ATTACK_MS = 60_000;
const WAITING_IDLE_TTL_MS = 60_000;
const ABANDONED_ROOM_TTL_MS = 60_000;
const FINISHED_RESULT_RETENTION_MS = 5 * 60_000;
const DISCONNECT_GRACE_MS = 30_000;
const ROOM_PERSIST_DEBOUNCE_MS = 1_000;
const MAINTENANCE_ALARM_FALLBACK_MS = 5_000;
const STALE_MAINTENANCE_ALARM_RETRY_MS = 60_000;
const INVALID_MESSAGE_ERROR = "リクエストの形式が正しくありません。";
const MAX_ROOM_SOCKETS = 16;
const UNJOINED_SOCKET_IDLE_MS = 30_000;
const GUEST_SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MATCH_RESULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PLAYERS = 2;
const COUNTDOWN_MS = 3_000;
const HP_BATTLE_MAX_HP = 100;
const HP_BATTLE_MISTAKE_DAMAGE = 1;
const HP_BATTLE_DURATION_MS = 90_000;
const MISTAKE_GUARD_STREAK = 20;
const MAX_MISTAKE_GUARDS = 3;
const BOT_PLAYER_ID = "bot_com_1";
const BOT_NICKNAME = "COM";

const DIFFICULTY_SETTINGS: Record<BotDifficulty, { charsPerTick: number; mistakeChance: number }> = {
  easy: { charsPerTick: 1, mistakeChance: 0.05 },
  normal: { charsPerTick: 2, mistakeChance: 0.02 },
  hard: { charsPerTick: 3, mistakeChance: 0.01 }
};

export class RoomAuthorityDurableObject {
  private readonly sockets = new Map<string, CloudflareSocketLike>();
  private readonly socketStates = new Map<string, SocketState>();
  private socketEventChain: Promise<void> = Promise.resolve();
  private readonly reactionTimestamps = new Map<string, number>();
  private readonly unjoinedSocketTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly playerSessions = new Map<string, string>();
  private readonly timers: GatewayTimers = {};
  private readonly roomCreateIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  private readonly roomCreateGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
  private readonly roomJoinIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 100 });
  private readonly roomJoinGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  private readonly progressLimiter = new RateLimiter({ windowMs: 1000, max: 120 });
  private readonly hooks: RoomEngineHooks;
  private maintenanceFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  private retentionAlarmAt: number | null | undefined;
  private lastFinalizedNotificationKey: string | null = null;
  private roomCode: string | null = null;
  private room: InternalRoom | null = null;
  readonly ready: Promise<void>;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: RoomAuthorityEnv = {}
  ) {
    this.hooks = {
      recordGuestSession: (input) => {
        this.runInBackground(this.persistGuestSessionRecord(input), "persist_guest_session_failed");
      },
      recordMatchResult: (input) => {
        this.runInBackground(this.persistMatchResultRecord(input), "persist_match_result_failed");
      }
    };
    this.ready = this.state.blockConcurrencyWhile(async () => {
      await this.restoreRoom();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    const url = new URL(request.url);
    const route = resolveRoomRoute(url.pathname);

    if (route?.roomCode) {
      this.ensureRoomCode(route.roomCode);
    }

    if (route?.action === "state") {
      return this.handleStateRequest(request, route.roomCode);
    }

    if (isWebSocketUpgrade(request)) {
      return this.handleWebSocketUpgrade(request, route?.action === "socket" ? route.roomCode : undefined);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-room-authority",
        roomCode: this.roomCode,
        room: this.room ? toPublicRoom(this.room) : null,
        sockets: this.sockets.size
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.enqueueRoomOperation("alarm", async () => {
      await this.runMaintenance();
      await this.scheduleMaintenanceAlarm();
    });
  }

  private async handleStateRequest(request: Request, roomCode: string): Promise<Response> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (request.method === "GET") {
      if (!this.room || normalizeRoomCode(this.room.roomCode) !== normalizedRoomCode) {
        return new Response("Not found", { status: 404 });
      }

      return Response.json({
        ok: true,
        room: toPublicRoom(this.room)
      });
    }

    if (request.method !== "POST" && request.method !== "PUT") {
      return new Response("Method not allowed", { status: 405 });
    }

    let parsed: unknown;

    try {
      parsed = await request.json();
    } catch {
      return new Response("Invalid room state", { status: 400 });
    }

    const snapshot = parsePersistedRoomSnapshotFromValue(parsed);

    if (!snapshot || normalizeRoomCode(snapshot.room.roomCode) !== normalizedRoomCode) {
      return new Response("Invalid room state", { status: 400 });
    }

    this.applyPersistedRoomSnapshot(snapshot);
    const restoredRoom = this.room;

    if (!restoredRoom) {
      return new Response("Invalid room state", { status: 400 });
    }

    this.broadcastRoomState(restoredRoom);
    await this.persistRoom(restoredRoom.roomCode);
    await this.scheduleMaintenanceAlarm();

    return Response.json({
      ok: true,
      roomCode: restoredRoom.roomCode,
      connectedSockets: this.sockets.size
    });
  }

  private async handleWebSocketUpgrade(request: Request, roomCode?: string): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.attachSocket(server as unknown as CloudflareSocketLike, {
      clientIp: readCloudflareClientIp(request.headers),
      ...(roomCode ? { roomCode } : {})
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  attachSocket(socket: CloudflareSocketLike, options: AttachSocketOptions = {}): string {
    const socketId = crypto.randomUUID();
    const roomCode = options.roomCode ? normalizeRoomCode(options.roomCode) : null;

    if (this.sockets.size >= MAX_ROOM_SOCKETS) {
      socket.accept();
      socket.close(1013, "Room connection limit exceeded.");
      return socketId;
    }

    if (roomCode) {
      this.ensureRoomCode(roomCode);
    }

    this.sockets.set(socketId, socket);
    this.socketStates.set(socketId, {
      socketId,
      clientIp: normalizeClientIp(options.clientIp),
      ...(roomCode ? { roomCode } : {})
    });
    socket.accept();

    socket.addEventListener("message", (event) => {
      this.enqueueSocketEvent(socketId, () => this.handleSocketMessage(socketId, event.data));
    });

    socket.addEventListener("close", () => {
      this.enqueueSocketEvent(socketId, () => this.handleSocketClose(socketId));
    });

    this.scheduleUnjoinedSocketTimeout(socketId);

    return socketId;
  }

  private enqueueSocketEvent(socketId: string, operation: () => void | Promise<void>): void {
    this.enqueueRoomOperation(socketId, operation);
    this.state.waitUntil(this.socketEventChain);
  }

  private enqueueRoomOperation(socketId: string, operation: () => void | Promise<void>): Promise<void> {
    const current = this.socketEventChain.then(operation);
    this.socketEventChain = current
      .catch((error: unknown) => {
        console.warn(JSON.stringify({
          event: "room_socket_event_failed",
          socketId,
          error: error instanceof Error ? error.message : String(error)
        }));
      });
    return current;
  }

  private runInBackground(operation: Promise<unknown>, event: string): void {
    this.state.waitUntil(operation.catch((error: unknown) => {
      console.warn(JSON.stringify({
        event,
        error: error instanceof Error ? error.message : String(error)
      }));
    }));
  }

  private async handleSocketMessage(socketId: string, rawMessage: unknown): Promise<void> {
    // A replacement connection can detach and close an older socket while
    // messages from that socket are still waiting in the shared event chain.
    // Never let those already-queued messages reclaim or mutate the room.
    if (!this.sockets.has(socketId) || !this.socketStates.has(socketId)) {
      return;
    }

    if (typeof rawMessage !== "string") {
      return;
    }

    if (getUtf8ByteLength(rawMessage) > MAX_WEB_SOCKET_MESSAGE_BYTES) {
      this.closeSocket(socketId, 1009, "Message too large.");
      return;
    }

    const message = parseClientMessage(rawMessage);

    if (!message) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    if (!isCloudflareClientMessageType(message.type)) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    switch (message.type) {
      case "client:room:create":
        await this.handleCreateRoom(socketId, message.id, message.payload);
        return;
      case "client:room:join":
        await this.handleJoinRoom(socketId, message.id, message.payload);
        return;
      case "client:room:leave":
        await this.handleLeaveRoom(socketId, message.payload);
        return;
      case "client:player:ready":
        await this.handleSetReady(socketId, message.payload);
        return;
      case "client:player:reaction":
        await this.handlePlayerReaction(socketId, message.id, message.payload);
        return;
      case "client:player:accessory":
        await this.handlePlayerAccessory(socketId, message.payload);
        return;
      case "client:room:setPromptCategory":
        await this.handleSetPromptCategory(socketId, message.id, message.payload);
        return;
      case "client:room:setBotDifficulty":
        await this.handleSetBotDifficulty(socketId, message.id, message.payload);
        return;
      case "client:room:setMatchRule":
        await this.handleSetMatchRule(socketId, message.id, message.payload);
        return;
      case "client:match:start":
        await this.handleStartMatch(socketId, message.id, message.payload);
        return;
      case "client:typing:progress":
        await this.handleTypingProgress(socketId, message.payload);
        return;
      case "client:typing:finish":
        await this.handleTypingFinish(socketId, message.payload);
        return;
      case "client:match:rematch":
        await this.handleRematch(socketId, message.id, message.payload);
        return;
      case "client:practice:start":
      case "client:practice:dailyStart":
        this.sendError(socketId, "Practice mode is handled by the gateway.");
        return;
      default:
        return;
    }
  }

  private async handleSocketClose(socketId: string): Promise<void> {
    await this.disconnectSocket(socketId);
  }

  private async disconnectSocket(socketId: string): Promise<void> {
    const roomCode = this.socketStates.get(socketId)?.roomCode ?? this.roomCode;
    const room = this.leaveBySocket(socketId);
    this.detachSocket(socketId);

    if (room) {
      this.broadcastRoomState(room);
      await this.persistRoom(room.roomCode);
      return;
    }

    if (roomCode) {
      await this.persistRoom(roomCode);
    }
  }

  private async handleCreateRoom(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseCreateRoomPayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:room:create", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const rateLimit = await this.checkRoomRequestRateLimit("create", socketId, parsedPayload.guestId);
    if (!rateLimit.ok) {
      this.sendAck(socketId, messageId, "client:room:create", { ok: false, error: rateLimit.error });
      return;
    }

    if (this.room) {
      this.sendAck(socketId, messageId, "client:room:create", {
        ok: false,
        error: "このルームは既に作成されています。"
      });
      return;
    }

    const error = validateNickname(parsedPayload.nickname);
    if (error) {
      this.sendAck(socketId, messageId, "client:room:create", { ok: false, error });
      return;
    }

    const room = createInitialRoom(
      this.roomCode ?? "UNKNOWN",
      normalizeNickname(parsedPayload.nickname),
      parsedPayload.guestId,
      socketId,
      parsedPayload.sessionId,
      parsedPayload.deviceKind
    );

    this.room = room;
    this.lastFinalizedNotificationKey = null;
    this.recordPlayerSession(room.roomCode, room.hostPlayerId, parsedPayload.sessionId);
    this.setSocketRoom(socketId, room.hostPlayerId);
    this.sendAck(socketId, messageId, "client:room:create", {
      ok: true,
      data: {
        roomCode: room.roomCode,
        playerId: room.hostPlayerId,
        room: toPublicRoom(room)
      }
    });
    this.broadcastRoomState(room);
    await this.persistRoom(room.roomCode);
  }

  private async handleJoinRoom(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseJoinRoomPayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const rateLimit = await this.checkRoomRequestRateLimit("join", socketId, parsedPayload.guestId);
    if (!rateLimit.ok) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error: rateLimit.error });
      return;
    }

    const error = validateNickname(parsedPayload.nickname);
    if (error) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error });
      return;
    }

    const sessionError = this.validateExistingPlayerSession(parsedPayload.guestId, parsedPayload.sessionId);
    if (sessionError) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error: sessionError });
      return;
    }

    const result = this.joinRoom({
      roomCode: parsedPayload.roomCode,
      nickname: normalizeNickname(parsedPayload.nickname),
      guestId: parsedPayload.guestId,
      socketId,
      sessionId: parsedPayload.sessionId,
      ...(parsedPayload.deviceKind ? { deviceKind: parsedPayload.deviceKind } : {})
    });

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error: result.error });
      return;
    }

    this.sendAck(socketId, messageId, "client:room:join", {
      ok: true,
      data: {
        playerId: result.playerId,
        room: toPublicRoom(this.room!)
      }
    });
    this.broadcastRoomState(this.room!);
    await this.persistRoom(this.room!.roomCode);
  }

  private async handleLeaveRoom(socketId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseRoomCodePayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    const roomCode = this.socketStates.get(socketId)?.roomCode ?? parsedPayload.roomCode;
    const room = this.explicitLeaveBySocket(socketId);
    this.detachSocketFromRoom(socketId);

    if (room) {
      if (room.status === "finished" && room.result) {
        this.notifyMatchFinalized(room.result);
      } else {
        this.broadcastRoomState(room);
        this.runInBackground(this.persistRoom(room.roomCode), "persist_room_failed");
      }
      return;
    }

    this.runInBackground(this.persistRoom(roomCode), "persist_room_failed");
  }

  private async handleSetReady(socketId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseReadyPayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    const room = this.setReady(socketId, parsedPayload.roomCode, parsedPayload.ready);

    if (!room) {
      return;
    }

    if (room.status === "countdown") {
      this.broadcastToAll({
        id: crypto.randomUUID(),
        type: "server:match:countdown",
        payload: { room, serverStartAt: room.serverStartAt ?? Date.now() }
      });
      this.scheduleMatchStart(room.roomCode);
    } else {
      this.broadcastRoomState(room);
    }
    this.runInBackground(this.persistRoom(room.roomCode), "persist_room_failed");
  }

  private async handlePlayerReaction(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseReactionPayload(payload);
    const socketState = this.socketStates.get(socketId);

    if (!parsedPayload || !socketState?.playerId || !socketState.roomCode) {
      this.sendAck(socketId, messageId, "client:player:reaction", { ok: false, error: INVALID_MESSAGE_ERROR });
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    if (normalizeRoomCode(parsedPayload.roomCode) !== normalizeRoomCode(socketState.roomCode)) {
      this.sendAck(socketId, messageId, "client:player:reaction", { ok: false, error: "ルームに参加していません。" });
      this.sendError(socketId, "ルームに参加していません。");
      return;
    }

    const now = Date.now();
    const previous = this.reactionTimestamps.get(socketState.playerId) ?? 0;
    if (now - previous < 3_000) {
      this.sendAck(socketId, messageId, "client:player:reaction", { ok: false, error: "リアクションは3秒に1回送信できます。" });
      return;
    }

    this.reactionTimestamps.set(socketState.playerId, now);
    this.broadcastToAll({
      id: crypto.randomUUID(),
      type: "server:player:reaction",
      payload: {
        playerId: socketState.playerId,
        reaction: parsedPayload.reaction
      }
    });
    this.sendAck(socketId, messageId, "client:player:reaction", { ok: true, data: null });
  }

  private async handlePlayerAccessory(socketId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseAccessoryPayload(payload);
    const context = parsedPayload ? this.getContext(socketId, parsedPayload.roomCode) : null;

    if (!parsedPayload || !context || (context.room.status !== "waiting" && context.room.status !== "finished")) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    context.player.accessoryIndex = parsedPayload.accessoryIndex;
    context.room.lastActivityAt = Date.now();
    this.broadcastRoomState(context.room);
    this.runInBackground(this.persistRoom(context.room.roomCode), "persist_room_failed");
  }

  private async handleSetPromptCategory(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parsePromptCategoryPayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:room:setPromptCategory", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const result = this.setPromptCategory(socketId, parsedPayload.roomCode, parsedPayload.category);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setPromptCategory", { ok: false, error: result.error });
      return;
    }

    this.sendAck(socketId, messageId, "client:room:setPromptCategory", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    this.runInBackground(this.persistRoom(result.room.roomCode), "persist_room_failed");
  }

  private async handleSetBotDifficulty(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parseBotDifficultyPayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:room:setBotDifficulty", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const result = this.setBotDifficulty(socketId, parsedPayload.roomCode, parsedPayload.difficulty);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setBotDifficulty", { ok: false, error: result.error });
      return;
    }

    this.sendAck(socketId, messageId, "client:room:setBotDifficulty", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    this.runInBackground(this.persistRoom(result.room.roomCode), "persist_room_failed");
  }

  private async handleSetMatchRule(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parseMatchRulePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:room:setMatchRule", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const result = this.setMatchRule(socketId, parsedPayload.roomCode, parsedPayload.rule);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setMatchRule", { ok: false, error: result.error });
      return;
    }

    this.sendAck(socketId, messageId, "client:room:setMatchRule", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    this.runInBackground(this.persistRoom(result.room.roomCode), "persist_room_failed");
  }

  private async handleStartMatch(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseRoomCodePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:match:start", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const result = this.startMatch(socketId, parsedPayload.roomCode);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:match:start", { ok: false, error: result.error });
      return;
    }

    this.sendAck(socketId, messageId, "client:match:start", { ok: true, data: result.room });
    this.broadcastToAll({
      id: crypto.randomUUID(),
      type: "server:match:countdown",
      payload: {
        room: result.room,
        serverStartAt: result.room.serverStartAt ?? Date.now()
      }
    });
    this.runInBackground(this.persistRoom(result.room.roomCode), "persist_room_failed");
    this.scheduleMatchStart(result.room.roomCode);
  }

  private async handleTypingProgress(socketId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseTypingPayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    if (!this.progressLimiter.isAllowed(socketId)) {
      return;
    }

    const result = this.updateProgress(socketId, parsedPayload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.broadcastRoomState(result);
      this.schedulePersistRoom(result.roomCode);
      return;
    }

    this.notifyMatchFinalized(result);
  }

  private async handleTypingFinish(socketId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseTypingPayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    const result = this.finishTyping(socketId, parsedPayload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.broadcastRoomState(result);
      this.schedulePersistRoom(result.roomCode);
      return;
    }

    this.notifyMatchFinalized(result);
  }

  private async handleRematch(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseRoomCodePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:match:rematch", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const result = this.rematch(socketId, parsedPayload.roomCode);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:match:rematch", { ok: false, error: result.error });
      return;
    }

    this.sendAck(socketId, messageId, "client:match:rematch", { ok: true, data: result.room });
    this.broadcastToAll({
      id: crypto.randomUUID(),
      type: "server:match:countdown",
      payload: {
        room: result.room,
        serverStartAt: result.room.serverStartAt ?? Date.now()
      }
    });
    this.runInBackground(this.persistRoom(result.room.roomCode), "persist_room_failed");
    this.scheduleMatchStart(result.room.roomCode);
  }

  private broadcastRoomState(room: InternalRoom | RoomState): void {
    const publicRoom = isInternalRoom(room) ? toPublicRoom(room) : room;
    this.broadcastToAll({
      id: crypto.randomUUID(),
      type: "server:room:state",
      payload: publicRoom
    });
  }

  private broadcastToAll<TType extends CloudflareServerEventType>(
    message: CloudflareServerEventEnvelope<TType>
  ): void {
    for (const [socketId, socketState] of this.socketStates.entries()) {
      if (!socketState.playerId) {
        continue;
      }

      this.sendMessage(socketId, message);
    }
  }

  private sendAck(
    socketId: string,
    replyTo: string,
    command: CloudflareClientMessageType,
    payload: AckResponse<unknown>
  ): void {
    this.sendMessage(socketId, {
      id: crypto.randomUUID(),
      type: "server:ack",
      replyTo,
      command,
      payload
    } as CloudflareServerMessage);
  }

  private sendError(socketId: string, message: string): void {
    this.sendMessage(socketId, {
      id: crypto.randomUUID(),
      type: "server:error",
      payload: { message }
    });
  }

  private sendMessage(socketId: string, message: CloudflareServerMessage): void {
    const socket = this.sockets.get(socketId);

    if (!socket || socket.readyState !== OPEN_STATE) {
      this.enqueueSocketEvent(socketId, () => this.disconnectSocket(socketId));
      return;
    }

    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.enqueueSocketEvent(socketId, () => this.disconnectSocket(socketId));
    }
  }

  private setSocketRoom(socketId: string, playerId?: string): void {
    const socketState = this.socketStates.get(socketId) ?? { socketId, clientIp: "unknown" };

    if (playerId) {
      socketState.playerId = playerId;
      this.clearUnjoinedSocketTimeout(socketId);
    }

    if (this.roomCode) {
      socketState.roomCode = this.roomCode;
    }

    this.socketStates.set(socketId, socketState);
  }

  private detachSocketFromRoom(socketId: string): void {
    const socketState = this.socketStates.get(socketId);
    if (!socketState) {
      return;
    }

    delete socketState.playerId;
    delete socketState.roomCode;
    this.socketStates.set(socketId, socketState);
    this.scheduleUnjoinedSocketTimeout(socketId);
  }

  private detachSocket(socketId: string): void {
    this.detachSocketFromRoom(socketId);
    this.clearUnjoinedSocketTimeout(socketId);
    this.sockets.delete(socketId);
    this.socketStates.delete(socketId);
  }

  private closeSocket(socketId: string, code = 1000, reason = "closed"): void {
    const socket = this.sockets.get(socketId);
    this.detachSocket(socketId);

    if (socket?.readyState === OPEN_STATE) {
      try {
        socket.close(code, reason);
      } catch {
        // The socket is already being removed; close failures do not affect room state.
      }
    }
  }

  private scheduleUnjoinedSocketTimeout(socketId: string): void {
    this.clearUnjoinedSocketTimeout(socketId);
    this.unjoinedSocketTimers.set(
      socketId,
      setTimeout(() => {
        const socketState = this.socketStates.get(socketId);
        if (socketState && !socketState.playerId) {
          this.closeSocket(socketId, 1008, "Join required.");
        }
      }, UNJOINED_SOCKET_IDLE_MS)
    );
  }

  private clearUnjoinedSocketTimeout(socketId: string): void {
    const timer = this.unjoinedSocketTimers.get(socketId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.unjoinedSocketTimers.delete(socketId);
  }

  private async persistRoom(roomCode: string): Promise<void> {
    this.clearPersistTimer();

    const room = this.room && normalizeRoomCode(this.room.roomCode) === normalizeRoomCode(roomCode) ? this.room : null;

    try {
      if (!room) {
        await this.state.storage.delete(ROOM_STORAGE_KEY);
      } else {
        await this.state.storage.put(ROOM_STORAGE_KEY, this.createPersistedRoomSnapshot(room));
      }
    } catch {
      // Persistence is best-effort for live gameplay.
    }

    await this.scheduleMaintenanceAlarm();
  }

  private async persistGuestSessionRecord(
    input: Parameters<NonNullable<RoomEngineHooks["recordGuestSession"]>>[0]
  ): Promise<void> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const storageKey = `${GUEST_SESSION_STORAGE_PREFIX}${roomCode}:${input.guestId}`;
    const now = new Date().toISOString();

    try {
      const existing = await this.state.storage.get<GuestSessionStorageRecord>(storageKey);
      await this.state.storage.put<GuestSessionStorageRecord>(storageKey, {
        ...input,
        roomCode,
        createdAt: existing?.createdAt ?? now,
        lastSeenAt: now
      });
      await this.refreshRetentionAlarmAt();
      await this.scheduleMaintenanceAlarm();
    } catch {
      // Guest-session persistence is best-effort and must not interrupt active rooms.
    }
  }

  private async persistMatchResultRecord(
    input: Parameters<NonNullable<RoomEngineHooks["recordMatchResult"]>>[0]
  ): Promise<void> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const storageKey = `${MATCH_RESULT_STORAGE_PREFIX}${roomCode}:${input.round}`;

    try {
      await this.state.storage.put<MatchResultStorageRecord>(storageKey, {
        ...input,
        roomCode,
        createdAt: new Date().toISOString()
      });
      await this.refreshRetentionAlarmAt();
      await this.scheduleMaintenanceAlarm();
    } catch {
      // Result persistence is best-effort; gameplay completion must still be emitted.
    }
  }

  private createPersistedRoomSnapshot(room: InternalRoom): PersistedRoomSnapshot {
    const disconnectedAt: Record<string, number> = {};
    const typingState: Record<string, PersistedPlayerTypingState> = {};

    for (const [playerId, player] of room.players.entries()) {
      if (player.disconnectedAt !== undefined) {
        disconnectedAt[playerId] = player.disconnectedAt;
      }

      typingState[playerId] = {
        typingProgressIndex: player.typingProgressIndex,
        pendingInput: player.pendingInput,
        lastInputSequence: player.lastInputSequence
      };
    }

    return {
      schemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      room: toPublicRoom(room),
      playerSessions: Object.fromEntries(this.playerSessions.entries()),
      disconnectedAt,
      internal: {
        round: room.round,
        promptHistory: [...room.promptHistory],
        createdAt: room.createdAt,
        lastActivityAt: room.lastActivityAt,
        ...(room.finishedAt !== undefined ? { finishedAt: room.finishedAt } : {}),
        typingState
      }
    };
  }

  private schedulePersistRoom(roomCode: string): void {
    void roomCode;

    if (this.timers.persist) {
      clearTimeout(this.timers.persist);
    }

    this.timers.persist = setTimeout(() => {
      this.runInBackground(
        this.persistRoom(this.room?.roomCode ?? this.roomCode ?? "UNKNOWN"),
        "persist_room_failed"
      );
    }, ROOM_PERSIST_DEBOUNCE_MS);
  }

  private async restoreRoom(): Promise<void> {
    this.room = null;
    this.playerSessions.clear();
    const storedRoom = await this.state.storage.get<unknown>(ROOM_STORAGE_KEY);
    const snapshot = parsePersistedRoomSnapshotFromValue(storedRoom);

    if (snapshot) {
      this.applyPersistedRoomSnapshot(snapshot);
    }

    await this.scheduleMaintenanceAlarm();
  }

  private applyPersistedRoomSnapshot(snapshot: PersistedRoomSnapshot): void {
    const playerSessions = snapshot.playerSessions ?? {};
    const disconnectedAt = snapshot.disconnectedAt ?? {};
    const room = createRoomStateFromSnapshot(
      snapshot.room,
      playerSessions,
      disconnectedAt,
      snapshot.internal,
      Date.now()
    );

    this.room = room;
    this.roomCode = room.roomCode;
    this.playerSessions.clear();

    for (const [playerId, sessionId] of Object.entries(playerSessions)) {
      this.playerSessions.set(playerId, sessionId);
    }

    this.syncRestoredRoom();
  }

  private syncRestoredRoom(): void {
    if (!this.room) {
      return;
    }

    if (this.room.status === "countdown" && this.room.serverStartAt) {
      this.scheduleMatchStart(this.room.roomCode);
      return;
    }

    if (this.room.status === "playing" && [...this.room.players.values()].some((player) => player.isBot)) {
      this.scheduleBotProgress(this.room.roomCode);
      return;
    }

    this.clearRoomTimers();
  }

  private scheduleMatchStart(roomCode: string): void {
    this.clearMatchTimers();

    const room = this.room;
    if (!room || normalizeRoomCode(room.roomCode) !== normalizeRoomCode(roomCode) || !room.serverStartAt) {
      return;
    }

    this.timers.countdown = setTimeout(() => {
      const playingRoom = this.markPlaying(roomCode);

      if (!playingRoom) {
        if (this.room) {
          this.broadcastRoomState(this.room);
          this.runInBackground(this.persistRoom(roomCode), "persist_room_failed");
        }
        return;
      }

      this.broadcastToAll({
        id: crypto.randomUUID(),
        type: "server:match:started",
        payload: playingRoom
      });
      this.broadcastRoomState(playingRoom);
      this.runInBackground(this.persistRoom(roomCode), "persist_room_failed");
      this.scheduleBotProgress(roomCode);
    }, Math.max(room.serverStartAt - Date.now(), 0));
  }

  private scheduleBotProgress(roomCode: string): void {
    const room = this.room;

    if (!room || normalizeRoomCode(room.roomCode) !== normalizeRoomCode(roomCode) || ![...room.players.values()].some((player) => player.isBot)) {
      return;
    }

    if (this.timers.bot) {
      clearInterval(this.timers.bot);
    }

    this.timers.bot = setInterval(() => {
      const outcome = this.advanceBot(roomCode);

      if (!outcome) {
        const currentRoom = this.room;

        if (!currentRoom || currentRoom.status !== "playing") {
          this.clearMatchTimers();
        }

        return;
      }

      if (outcome.type === "result") {
        this.notifyMatchFinalized(outcome.result);
        return;
      }

      this.broadcastRoomState(outcome.room);
      this.schedulePersistRoom(roomCode);
    }, BOT_TICK_MS);
  }

  private clearMatchTimers(): void {
    if (this.timers.countdown) {
      clearTimeout(this.timers.countdown);
    }

    if (this.timers.bot) {
      clearInterval(this.timers.bot);
    }

    this.timers.countdown = undefined;
    this.timers.bot = undefined;
  }

  private notifyMatchFinalized(result: MatchResult): void {
    this.clearMatchTimers();

    const room = this.room;
    const notificationKey = `${normalizeRoomCode(result.roomCode)}:${room?.round ?? "unknown"}`;

    if (room && normalizeRoomCode(room.roomCode) === normalizeRoomCode(result.roomCode)) {
      this.broadcastRoomState(room);
    }
    if (this.lastFinalizedNotificationKey !== notificationKey) {
      this.lastFinalizedNotificationKey = notificationKey;
      this.broadcastToAll({
        id: crypto.randomUUID(),
        type: "server:match:result",
        payload: result
      });
    }

    this.runInBackground(this.persistRoom(result.roomCode), "persist_room_failed");
  }

  private clearRoomTimers(): void {
    this.clearMatchTimers();
    this.clearPersistTimer();
  }

  private clearPersistTimer(): void {
    if (!this.timers.persist) {
      return;
    }

    clearTimeout(this.timers.persist);
    this.timers.persist = undefined;
  }

  private async cleanupStaleRoom(): Promise<void> {
    if (!this.room) {
      await this.state.storage.delete(ROOM_STORAGE_KEY);
      await this.scheduleMaintenanceAlarm();
      return;
    }

    if (shouldExpireRoom(this.room, Date.now())) {
      this.room = null;
      this.clearRoomTimers();
      await this.persistRoom(this.roomCode ?? "UNKNOWN");
    }

    await this.scheduleMaintenanceAlarm();
  }

  private async cleanupDisconnectedPlayers(): Promise<void> {
    const room = this.room;
    if (!room || (room.status !== "waiting" && room.status !== "finished")) {
      return;
    }

    const hasConnectedHuman = [...room.players.values()].some((player) => player.connected && !player.isBot);
    if (!hasConnectedHuman) {
      return;
    }

    const now = Date.now();
    if (
      room.status === "finished" &&
      now < (room.finishedAt ?? room.lastActivityAt) + FINISHED_RESULT_RETENTION_MS
    ) {
      return;
    }

    const expiredPlayers = [...room.players.values()].filter(
      (player) => !player.isBot && !player.connected && player.disconnectedAt !== undefined && now >= player.disconnectedAt + DISCONNECT_GRACE_MS
    );
    if (expiredPlayers.length === 0) {
      return;
    }

    for (const player of expiredPlayers) {
      room.players.delete(player.id);
      this.playerSessions.delete(player.id);
    }
    ensureConnectedHost(room);

    if (room.status === "finished") {
      room.status = "waiting";
      room.round += 1;
      delete room.prompt;
      delete room.result;
      delete room.serverStartAt;
      delete room.matchEndsAt;
      delete room.finishedAt;
      resetPlayers(room, true);
    }

    room.lastActivityAt = now;
    this.broadcastRoomState(room);
    await this.persistRoom(room.roomCode);
  }
  private async handleForfeits(): Promise<void> {
    if (!this.room || this.room.status !== "playing") {
      await this.scheduleMaintenanceAlarm();
      return;
    }

    let changed = false;

    for (const player of this.room.players.values()) {
      if (!player.connected && player.disconnectedAt) {
        const elapsed = Date.now() - player.disconnectedAt;
        if (elapsed >= DISCONNECT_GRACE_MS && !player.forfeited) {
          player.finishedAt = Date.now();
          delete player.finishTimeMs;
          player.finishStatus = "forfeited";
          player.forfeited = true;
          changed = true;
        }
      }
    }

    if (changed) {
      this.finalizeUnfinishedBots(this.room);
      const result = this.finalizeRoom(this.room);
      this.notifyMatchFinalized(result);
    }

    await this.scheduleMaintenanceAlarm();
  }

  private async handleTimeAttackExpirations(): Promise<void> {
    if (!this.room || this.room.status !== "playing" || (this.room.matchRule !== "timeAttack" && this.room.matchRule !== "hpBattle") || !this.room.matchEndsAt) {
      await this.scheduleMaintenanceAlarm();
      return;
    }

    if (Date.now() < this.room.matchEndsAt) {
      await this.scheduleMaintenanceAlarm();
      return;
    }

    if (this.room.matchRule === "hpBattle") {
      const players = [...this.room.players.values()];
      const leftHp = players[0]?.hp ?? 0;
      const rightHp = players[1]?.hp ?? 0;
      if (leftHp === rightHp) {
        this.room.suddenDeath = true;
        delete this.room.matchEndsAt;
        this.broadcastRoomState(this.room);
        await this.persistRoom(this.room.roomCode);
        await this.scheduleMaintenanceAlarm();
        return;
      }
    }

    this.finalizeUnfinishedBots(this.room);
    const result = this.finalizeRoom(this.room);
    this.notifyMatchFinalized(result);
    await this.scheduleMaintenanceAlarm();
  }

  private async runMaintenance(): Promise<void> {
    await this.cleanupStaleRoom();
    await this.cleanupDisconnectedPlayers();
    await this.handleForfeits();
    await this.handleTimeAttackExpirations();
    await this.cleanupRetentionRecords();
  }

  private async cleanupRetentionRecords(): Promise<void> {
    const now = Date.now();
    await this.cleanupRecordsByPrefix<GuestSessionStorageRecord>(
      GUEST_SESSION_STORAGE_PREFIX,
      (record) => Date.parse(record.lastSeenAt) + GUEST_SESSION_RETENTION_MS <= now
    );
    await this.cleanupRecordsByPrefix<MatchResultStorageRecord>(
      MATCH_RESULT_STORAGE_PREFIX,
      (record) => Date.parse(record.createdAt) + MATCH_RESULT_RETENTION_MS <= now
    );
    await this.refreshRetentionAlarmAt();
  }

  private async cleanupRecordsByPrefix<T>(prefix: string, shouldDelete: (record: T) => boolean): Promise<void> {
    try {
      const records = await this.state.storage.list<T>({ prefix });
      await Promise.all(
        [...records.entries()]
          .filter(([, record]) => shouldDelete(record))
          .map(([key]) => this.state.storage.delete(key))
      );
    } catch (error) {
      console.warn(JSON.stringify({
        event: "retention_cleanup_failed",
        prefix,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  private async getNextMaintenanceAlarmAt(): Promise<number | null> {
    const now = Date.now();
    let nextAlarmAt: number | null = null;

    const addDeadline = (deadline: number, backOffWhenStale = false): void => {
      if (!Number.isFinite(deadline)) {
        return;
      }
      const candidate = deadline <= now
        ? backOffWhenStale
          ? now + STALE_MAINTENANCE_ALARM_RETRY_MS
          : now
        : deadline;
      if (nextAlarmAt === null || candidate < nextAlarmAt) {
        nextAlarmAt = candidate;
      }
    };

    const retentionAlarmAt = await this.getRetentionAlarmAt();
    if (retentionAlarmAt !== null) {
      addDeadline(retentionAlarmAt, true);
    }

    if (!this.room) {
      return nextAlarmAt;
    }

    const expirationDeadline = getRoomExpirationDeadline(this.room);
    if (expirationDeadline !== null) {
      addDeadline(expirationDeadline);
    }

    const hasConnectedHuman = [...this.room.players.values()].some((player) => player.connected && !player.isBot);
    if (this.room.status === "playing" || hasConnectedHuman) {
      for (const player of this.room.players.values()) {
        if (player.connected || !player.disconnectedAt) {
          continue;
        }

        const disconnectDeadline = player.disconnectedAt + DISCONNECT_GRACE_MS;
        const cleanupDeadline = this.room.status === "finished"
          ? Math.max(
              disconnectDeadline,
              (this.room.finishedAt ?? this.room.lastActivityAt) + FINISHED_RESULT_RETENTION_MS
            )
          : disconnectDeadline;
        addDeadline(cleanupDeadline);
      }
    }

    if (this.room.status === "playing" && (this.room.matchRule === "timeAttack" || this.room.matchRule === "hpBattle") && this.room.matchEndsAt !== undefined) {
      addDeadline(this.room.matchEndsAt);
    }

    return nextAlarmAt;
  }

  private async getRetentionAlarmAt(): Promise<number | null> {
    if (this.retentionAlarmAt !== undefined) {
      return this.retentionAlarmAt;
    }

    try {
      const storedDeadline = await this.state.storage.get<number>(RETENTION_ALARM_STORAGE_KEY);
      if (typeof storedDeadline === "number" && Number.isFinite(storedDeadline)) {
        this.retentionAlarmAt = storedDeadline;
        return storedDeadline;
      }
    } catch (error) {
      console.warn(JSON.stringify({
        event: "retention_alarm_read_failed",
        error: error instanceof Error ? error.message : String(error)
      }));
      return Date.now() + STALE_MAINTENANCE_ALARM_RETRY_MS;
    }

    await this.refreshRetentionAlarmAt();
    return this.retentionAlarmAt === undefined
      ? Date.now() + STALE_MAINTENANCE_ALARM_RETRY_MS
      : this.retentionAlarmAt;
  }

  private async refreshRetentionAlarmAt(): Promise<void> {
    try {
      const [guestSessions, matchResults] = await Promise.all([
        this.state.storage.list<GuestSessionStorageRecord>({ prefix: GUEST_SESSION_STORAGE_PREFIX }),
        this.state.storage.list<MatchResultStorageRecord>({ prefix: MATCH_RESULT_STORAGE_PREFIX })
      ]);
      const deadlines = [
        ...[...guestSessions.values()].map((record) => Date.parse(record.lastSeenAt) + GUEST_SESSION_RETENTION_MS),
        ...[...matchResults.values()].map((record) => Date.parse(record.createdAt) + MATCH_RESULT_RETENTION_MS)
      ].filter(Number.isFinite);
      const nextDeadline = deadlines.length > 0 ? Math.min(...deadlines) : null;

      this.retentionAlarmAt = nextDeadline;
      if (nextDeadline === null) {
        await this.state.storage.delete(RETENTION_ALARM_STORAGE_KEY);
      } else {
        await this.state.storage.put(RETENTION_ALARM_STORAGE_KEY, nextDeadline);
      }
    } catch (error) {
      this.retentionAlarmAt = Date.now() + STALE_MAINTENANCE_ALARM_RETRY_MS;
      console.warn(JSON.stringify({
        event: "retention_alarm_refresh_failed",
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  private async scheduleMaintenanceAlarm(): Promise<void> {
    const nextAlarmAt = await this.getNextMaintenanceAlarmAt();

    try {
      if (nextAlarmAt === null) {
        await this.state.storage.deleteAlarm();
        this.clearMaintenanceFallbackTimer();
        return;
      }

      await this.state.storage.setAlarm(Math.max(nextAlarmAt, Date.now()));
      this.clearMaintenanceFallbackTimer();
    } catch {
      this.scheduleMaintenanceFallbackTimer();
    }
  }

  private scheduleMaintenanceFallbackTimer(): void {
    if (this.maintenanceFallbackTimer) {
      return;
    }

    this.maintenanceFallbackTimer = setTimeout(() => {
      this.maintenanceFallbackTimer = undefined;
      this.runInBackground(this.alarm(), "maintenance_alarm_failed");
    }, MAINTENANCE_ALARM_FALLBACK_MS);
  }

  private clearMaintenanceFallbackTimer(): void {
    if (!this.maintenanceFallbackTimer) {
      return;
    }

    clearTimeout(this.maintenanceFallbackTimer);
    this.maintenanceFallbackTimer = undefined;
  }

  private ensureRoomCode(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!this.roomCode) {
      this.roomCode = normalizedRoomCode;
      return;
    }

    if (this.roomCode !== normalizedRoomCode) {
      throw new Error(`roomCode mismatch: expected ${this.roomCode}, received ${normalizedRoomCode}`);
    }
  }

  private recordPlayerSession(roomCode: string, playerId: string, sessionId: string): void {
    this.playerSessions.set(playerId, sessionId);
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const nickname = this.room?.players.get(playerId)?.nickname ?? playerId;

    this.hooks.recordGuestSession?.({
      sessionId,
      guestId: playerId,
      nickname,
      roomCode: normalizedRoomCode
    });
  }

  private validateExistingPlayerSession(guestId: string, sessionId: string): string | null {
    if (!this.room) {
      return null;
    }

    const existingPlayer = this.room.players.get(guestId);
    if (!existingPlayer) {
      return null;
    }

    const storedSession = this.playerSessions.get(guestId);
    if (!storedSession) {
      return "このプレイヤーの認証情報がありません。";
    }

    if (storedSession !== sessionId) {
      return "このプレイヤーは別のセッションで使用されています。";
    }

    return null;
  }

  private async checkRoomRequestRateLimit(
    action: RoomRateLimitAction,
    socketId: string,
    guestId: string
  ): Promise<RoomRateLimitResult> {
    const clientIp = this.socketStates.get(socketId)?.clientIp ?? "unknown";
    const gateway = this.env.GATEWAY?.getByName("gateway");

    if (gateway) {
      try {
        const response = await gateway.fetch(
          new Request(`https://type-battle.internal${GATEWAY_ROOM_RATE_LIMIT_PATH}`, {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({ action, clientIp, guestId } satisfies RoomRateLimitInput)
          })
        );

        if (!response.ok) {
          return {
            ok: false,
            error: "リクエストを処理できませんでした。時間をおいて再試行してください。"
          };
        }

        const result = parseRoomRateLimitResult(await response.json());

        if (!result) {
          return {
            ok: false,
            error: "リクエストを処理できませんでした。時間をおいて再試行してください。"
          };
        }

        return result;
      } catch {
        return {
          ok: false,
          error: "リクエストを処理できませんでした。時間をおいて再試行してください。"
        };
      }
    }

    return this.checkLocalRoomRequestRateLimit(action, clientIp, guestId);
  }

  private checkLocalRoomRequestRateLimit(
    action: RoomRateLimitAction,
    clientIp: string,
    guestId: string
  ): RoomRateLimitResult {
    if (action === "create") {
      if (!this.roomCreateIpLimiter.isAllowed(clientIp)) {
        return {
          ok: false,
          error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)"
        };
      }

      if (!this.roomCreateGuestLimiter.isAllowed(guestId)) {
        return {
          ok: false,
          error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
        };
      }

      return { ok: true };
    }

    if (!this.roomJoinIpLimiter.isAllowed(clientIp)) {
      return {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)"
      };
    }

    if (!this.roomJoinGuestLimiter.isAllowed(guestId)) {
      return {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
      };
    }

    return { ok: true };
  }

  private joinRoom(input: {
    roomCode: string;
    nickname: string;
    guestId: string;
    socketId: string;
    sessionId?: string;
    deviceKind?: DeviceKind;
  }): { room: RoomState; playerId: string } | { error: string } {
    this.ensureRoomCode(input.roomCode);

    if (!this.room) {
      return { error: "ルームが見つかりません。" };
    }

    this.room.lastActivityAt = Date.now();
    const existing = this.room.players.get(input.guestId);

    if (existing) {
      if (existing.sessionId !== (input.sessionId ?? input.guestId)) {
        return { error: "このプレイヤーは別のセッションで使用されています。" };
      }

      const previousSocketId = existing.socketId;
      existing.socketId = input.socketId;
      existing.connected = true;
      delete existing.disconnectedAt;
      existing.nickname = normalizeNickname(input.nickname);
      existing.deviceKind = input.deviceKind ?? existing.deviceKind ?? "desktop";
      resetPlayerInputSession(existing);
      if (previousSocketId && previousSocketId !== input.socketId) {
        this.closeSocket(previousSocketId, 4000, "Rejoined from another socket.");
      }
      this.socketStates.set(input.socketId, {
        socketId: input.socketId,
        clientIp: this.socketStates.get(input.socketId)?.clientIp ?? "unknown",
        playerId: existing.id,
        roomCode: this.room.roomCode
      });
      ensureConnectedHost(this.room);
      this.recordPlayerSession(this.room.roomCode, existing.id, input.sessionId ?? input.guestId);
      return { room: toPublicRoom(this.room), playerId: existing.id };
    }

    if (this.room.status !== "waiting") {
      return { error: "試合中のルームには参加できません。" };
    }

    if (this.room.players.size >= MAX_PLAYERS) {
      return { error: "このルームは満員です。" };
    }

    const player = createPlayer(
      input.guestId,
      input.nickname,
      input.socketId,
      false,
      input.sessionId ?? input.guestId,
      input.deviceKind
    );
    this.room.players.set(player.id, player);
    this.socketStates.set(input.socketId, {
      socketId: input.socketId,
      clientIp: this.socketStates.get(input.socketId)?.clientIp ?? "unknown",
      playerId: player.id,
      roomCode: this.room.roomCode
    });
    ensureConnectedHost(this.room);
    this.recordPlayerSession(this.room.roomCode, player.id, input.sessionId ?? input.guestId);
    return { room: toPublicRoom(this.room), playerId: player.id };
  }

  private setReady(socketId: string, roomCode: string, ready: boolean): RoomState | null {
    if (!this.room || normalizeRoomCode(roomCode) !== normalizeRoomCode(this.room.roomCode)) {
      return null;
    }

    const record = this.socketStates.get(socketId);
    if (!record || (this.room.status !== "waiting" && this.room.status !== "finished")) {
      return null;
    }

    const player = this.room.players.get(record.playerId ?? "");
    if (!player) {
      return null;
    }

    player.ready = ready;

    if (this.room.status === "finished") {
      const humans = [...this.room.players.values()].filter((candidate) => !candidate.isBot);
      if (humans.length > 0 && humans.every((candidate) => candidate.ready && candidate.connected)) {
        const nextRound = this.room.round + 1;
        let prompt: Prompt;
        try {
          prompt = selectPromptForRoom(this.room, Date.now() + nextRound);
        } catch {
          return toPublicRoom(this.room);
        }

        if (this.room.players.size < MAX_PLAYERS) {
          addBotPlayer(this.room);
        }
        this.room.status = "countdown";
        this.room.round = nextRound;
        this.room.prompt = prompt;
        if (!this.room.promptHistory.includes(prompt.id)) {
          this.room.promptHistory.push(prompt.id);
        }
        this.room.serverStartAt = Date.now() + COUNTDOWN_MS;
        if (this.room.matchRule === "timeAttack") {
          this.room.matchEndsAt = this.room.serverStartAt + getTimeAttackDurationMs(this.env.TIME_ATTACK_MS);
        } else if (this.room.matchRule === "hpBattle") {
          this.room.matchEndsAt = this.room.serverStartAt + HP_BATTLE_DURATION_MS;
        } else {
          delete this.room.matchEndsAt;
        }
        this.room.suddenDeath = false;
        delete this.room.result;
        delete this.room.finishedAt;
        resetPlayers(this.room);
      }
    }

    this.room.lastActivityAt = Date.now();
    return toPublicRoom(this.room);
  }

  private setPromptCategory(socketId: string, roomCode: string, category: PromptCategory): { room: RoomState } | { error: string } {
    const context = this.getContext(socketId, roomCode);
    if (!context) {
      return { error: "ルームに参加していません。" };
    }

    if (context.player.id !== context.room.hostPlayerId) {
      return { error: "ホストだけが課題カテゴリを変更できます。" };
    }

    if (context.room.status !== "waiting" && context.room.status !== "finished") {
      return { error: "試合中は課題カテゴリを変更できません。" };
    }

    context.room.promptCategory = category;
    clearRoomReadyStates(context.room);
    context.room.lastActivityAt = Date.now();
    return { room: toPublicRoom(context.room) };
  }

  private setBotDifficulty(socketId: string, roomCode: string, difficulty: BotDifficulty): { room: RoomState } | { error: string } {
    const context = this.getContext(socketId, roomCode);
    if (!context) {
      return { error: "ルームに参加していません。" };
    }

    if (context.player.id !== context.room.hostPlayerId) {
      return { error: "ホストだけが COM 難易度を変更できます。" };
    }

    if (context.room.status !== "waiting" && context.room.status !== "finished") {
      return { error: "試合中は COM 難易度を変更できません。" };
    }

    context.room.botDifficulty = difficulty;
    const bot = context.room.players.get(BOT_PLAYER_ID);
    if (bot) {
      bot.nickname = formatBotNickname(difficulty);
    }
    clearRoomReadyStates(context.room);
    context.room.lastActivityAt = Date.now();
    return { room: toPublicRoom(context.room) };
  }

  private setMatchRule(socketId: string, roomCode: string, rule: MatchRule): { room: RoomState } | { error: string } {
    const context = this.getContext(socketId, roomCode);
    if (!context) {
      return { error: "ルームに参加していません。" };
    }

    if (context.player.id !== context.room.hostPlayerId) {
      return { error: "ホストだけがルールを変更できます。" };
    }

    if (context.room.status !== "waiting" && context.room.status !== "finished") {
      return { error: "試合中はルールを変更できません。" };
    }

    context.room.matchRule = rule;
    syncMatchRuleState(context.room);
    clearRoomReadyStates(context.room);
    context.room.lastActivityAt = Date.now();
    return { room: toPublicRoom(context.room) };
  }

  private startMatch(socketId: string, roomCode: string): { room: RoomState } | { error: string } {
    const context = this.getContext(socketId, roomCode);
    if (!context) {
      return { error: "ルームに参加していません。" };
    }

    if (context.player.id !== context.room.hostPlayerId) {
      return { error: "ホストだけが開始できます。" };
    }

    if (context.room.status !== "waiting") {
      return { error: "この試合はすでに開始しています。" };
    }

    const humanPlayers = [...context.room.players.values()].filter((player) => !player.isBot);
    if (humanPlayers.some((player) => !player.connected || !player.ready)) {
      return { error: "参加者全員が準備完了になるまで開始できません。" };
    }

    if (context.room.players.size < MAX_PLAYERS) {
      addBotPlayer(context.room);
    }

    if (![...context.room.players.values()].every((player) => player.connected || player.isBot)) {
      return { error: "切断中のプレイヤーがいます。" };
    }

    let prompt: Prompt;
    try {
      prompt = selectPromptForRoom(context.room, Date.now());
    } catch {
      return { error: "有効な課題文がありません。" };
    }

    context.room.status = "countdown";
    context.room.prompt = prompt;
    if (!context.room.promptHistory.includes(prompt.id)) {
      context.room.promptHistory.push(prompt.id);
    }
    context.room.serverStartAt = Date.now() + COUNTDOWN_MS;
    if (context.room.matchRule === "timeAttack") {
      context.room.matchEndsAt = context.room.serverStartAt + getTimeAttackDurationMs(this.env.TIME_ATTACK_MS);
    } else if (context.room.matchRule === "hpBattle") {
      context.room.matchEndsAt = context.room.serverStartAt + HP_BATTLE_DURATION_MS;
    } else {
      delete context.room.matchEndsAt;
    }
    context.room.suddenDeath = false;
    delete context.room.result;
    delete context.room.finishedAt;
    resetPlayers(context.room);
    context.room.lastActivityAt = Date.now();
    return { room: toPublicRoom(context.room) };
  }

  private markPlaying(roomCode: string): RoomState | null {
    if (!this.room || normalizeRoomCode(roomCode) !== normalizeRoomCode(this.room.roomCode) || this.room.status !== "countdown") {
      return null;
    }

    const humans = [...this.room.players.values()].filter((player) => !player.isBot);
    if (humans.length === 0 || humans.some((player) => !player.connected)) {
      abortCountdown(this.room);
      return null;
    }

    this.room.status = "playing";
    this.room.lastActivityAt = Date.now();
    return toPublicRoom(this.room);
  }

  private updateProgress(socketId: string, payload: TypingProgress): RoomState | MatchResult | null {
    if (!isValidTypingProgressPayload(payload)) {
      return null;
    }

    const context = this.getContext(socketId, payload.roomCode);
    if (!context || context.room.status !== "playing" || !context.room.prompt) {
      return null;
    }

    if (isTimeAttackExpired(context.room, Date.now())) {
      return this.finalizeRoom(context.room);
    }

    if (!applyTypingInput(context.player, context.room, payload)) {
      return null;
    }
    context.room.lastActivityAt = Date.now();

    const result = this.maybeFinalizeRoom(context.room);
    if (result) {
      return result;
    }

    return toPublicRoom(context.room);
  }

  private finishTyping(socketId: string, payload: TypingFinish): MatchResult | RoomState | null {
    if (!isValidTypingProgressPayload(payload)) {
      return null;
    }

    const context = this.getContext(socketId, payload.roomCode);
    if (!context || context.room.status !== "playing" || !context.room.prompt) {
      return null;
    }

    if (isTimeAttackExpired(context.room, Date.now())) {
      return this.finalizeRoom(context.room);
    }

    if (!applyTypingInput(context.player, context.room, payload)) {
      return null;
    }
    context.room.lastActivityAt = Date.now();

    if (context.room.matchRule === "timeAttack") {
      return toPublicRoom(context.room);
    }

    const promptLength = getTypingLength(context.room, context.player);
    if (context.player.progressIndex >= promptLength) {
      const now = Date.now();
      context.player.finishedAt = now;
      context.player.finishTimeMs = now - (context.room.serverStartAt ?? now);
      context.player.finishStatus = "finished";
    }

    const result = this.maybeFinalizeRoom(context.room);
    if (result) {
      return result;
    }

    if (areHumansFinished(context.room)) {
      finalizeUnfinishedBots(context.room);
      return this.finalizeRoom(context.room);
    }

    return toPublicRoom(context.room);
  }

  private rematch(socketId: string, roomCode: string): { room: RoomState } | { error: string } {
    const context = this.getContext(socketId, roomCode);
    if (!context) {
      return { error: "ルームに参加していません。" };
    }

    if (context.player.id !== context.room.hostPlayerId) {
      return { error: "ホストだけが再戦できます。" };
    }

    if (context.room.status !== "finished") {
      return { error: "終了した試合だけ再戦できます。" };
    }

    if ([...context.room.players.values()].some((player) => !player.isBot && !player.connected)) {
      return { error: "切断中のプレイヤーがいるため再戦できません。" };
    }

    if (context.room.players.size < MAX_PLAYERS) {
      addBotPlayer(context.room);
    }

    const nextRound = context.room.round + 1;
    let prompt: Prompt;
    try {
      prompt = selectPromptForRoom(context.room, Date.now() + nextRound);
    } catch {
      return { error: "有効な課題文がありません。" };
    }

    context.room.round = nextRound;
    context.room.status = "countdown";
    context.room.prompt = prompt;
    if (!context.room.promptHistory.includes(prompt.id)) {
      context.room.promptHistory.push(prompt.id);
    }
    context.room.serverStartAt = Date.now() + COUNTDOWN_MS;
    if (context.room.matchRule === "timeAttack") {
      context.room.matchEndsAt = context.room.serverStartAt + getTimeAttackDurationMs(this.env.TIME_ATTACK_MS);
    } else if (context.room.matchRule === "hpBattle") {
      context.room.matchEndsAt = context.room.serverStartAt + HP_BATTLE_DURATION_MS;
    } else {
      delete context.room.matchEndsAt;
    }
    context.room.suddenDeath = false;
    delete context.room.result;
    delete context.room.finishedAt;
    resetPlayers(context.room);
    context.room.lastActivityAt = Date.now();
    return { room: toPublicRoom(context.room) };
  }

  private leaveBySocket(socketId: string): RoomState | null {
    if (!this.room) {
      return null;
    }

    const record = this.socketStates.get(socketId);
    if (!record) {
      return null;
    }

    const room = this.room;
    const player = room.players.get(record.playerId ?? "");

    const countdownAborted = room.status === "countdown";
    if (player) {
      player.connected = false;
      player.ready = false;
      player.disconnectedAt = Date.now();
    }

    if (countdownAborted) {
      this.clearMatchTimers();
      abortCountdown(room);
      this.broadcastToAll({
        id: crypto.randomUUID(),
        type: "server:error",
        payload: { message: "相手が退出したため開始を中止しました。" }
      });
    }

    room.lastActivityAt = Date.now();

    if (record.playerId === room.hostPlayerId) {
      const nextHost = [...room.players.values()].find((p) => p.connected && !p.isBot)
        ?? [...room.players.values()].find((p) => !p.isBot);
      if (nextHost) {
        room.hostPlayerId = nextHost.id;
      }
    }

    return toPublicRoom(room);
  }

  private explicitLeaveBySocket(socketId: string): RoomState | null {
    if (!this.room) {
      return null;
    }

    const record = this.socketStates.get(socketId);
    if (!record) {
      return null;
    }

    const room = this.room;
    const player = room.players.get(record.playerId ?? "");

    if (!player) {
      return null;
    }

    if (room.status === "playing") {
      player.connected = false;
      player.ready = false;
      player.disconnectedAt = Date.now();
      player.finishedAt = Date.now();
      delete player.finishTimeMs;
      player.finishStatus = "forfeited";
      player.forfeited = true;
      room.lastActivityAt = Date.now();

      if (record.playerId === room.hostPlayerId) {
        const nextHost = [...room.players.values()].find((candidate) => candidate.id !== player.id && candidate.connected && !candidate.isBot)
          ?? [...room.players.values()].find((candidate) => candidate.id !== player.id && !candidate.isBot);
        if (nextHost) {
          room.hostPlayerId = nextHost.id;
        }
      }

      finalizeUnfinishedBots(room);
      this.finalizeRoom(room);
      return toPublicRoom(room);
    }

    if (room.status === "countdown") {
      return this.leaveBySocket(socketId);
    }

    room.players.delete(record.playerId ?? "");
    this.playerSessions.delete(player.id);
    room.lastActivityAt = Date.now();

    if (room.players.size === 0) {
      this.room = null;
      return null;
    }

    if (record.playerId === room.hostPlayerId) {
      const nextHost = [...room.players.values()].find((p) => p.connected && !p.isBot)
        ?? [...room.players.values()].find((p) => !p.isBot);
      if (nextHost) {
        room.hostPlayerId = nextHost.id;
      }
    }

    return toPublicRoom(room);
  }

  private getContext(socketId: string, roomCode: string): { room: InternalRoom; player: InternalPlayer } | null {
    if (!this.room || normalizeRoomCode(roomCode) !== normalizeRoomCode(this.room.roomCode)) {
      return null;
    }

    const record = this.socketStates.get(socketId);
    if (!record) {
      return null;
    }

    const player = this.room.players.get(record.playerId ?? "");
    if (!player) {
      return null;
    }

    return { room: this.room, player };
  }

  private advanceBot(roomCode: string): { type: "progress"; room: RoomState } | { type: "result"; result: MatchResult } | null {
    if (!this.room || normalizeRoomCode(roomCode) !== normalizeRoomCode(this.room.roomCode) || this.room.status !== "playing" || !this.room.prompt) {
      return null;
    }

    if (isTimeAttackExpired(this.room, Date.now())) {
      return { type: "result", result: this.finalizeRoom(this.room) };
    }

    const bot = [...this.room.players.values()].find((player) => player.isBot);
    if (!bot || (this.room.matchRule !== "timeAttack" && this.room.matchRule !== "hpBattle" && bot.progressIndex >= getTypingLength(this.room, bot))) {
      return null;
    }

    const settings = DIFFICULTY_SETTINGS[this.room.botDifficulty] ?? DIFFICULTY_SETTINGS.normal;
    const isMistake = Math.random() < settings.mistakeChance;
    const variance = Math.floor(Math.random() * 3) - 1;
    const speed = Math.max(1, settings.charsPerTick + variance);
    const charsToAdd = isMistake ? 0 : speed;

    applyBotProgress(bot, this.room, charsToAdd, speed, isMistake);

    const promptLength = getTypingLength(this.room, bot);
    if (this.room.matchRule !== "timeAttack" && bot.progressIndex >= promptLength) {
      bot.finishedAt = Date.now();
      bot.finishTimeMs = bot.finishedAt - (this.room.serverStartAt ?? bot.finishedAt);
      bot.finishStatus = "finished";
    }

    const result = this.maybeFinalizeRoom(this.room);
    if (result) {
      return { type: "result", result };
    }

    if ((this.room.matchRule === "race" && bot.progressIndex >= promptLength) || areHumansFinished(this.room)) {
      if (bot.progressIndex < promptLength) {
        finalizeUnfinishedBots(this.room);
      }
      return { type: "result", result: this.finalizeRoom(this.room) };
    }

    return { type: "progress", room: toPublicRoom(this.room) };
  }

  private areHumansFinished(room: InternalRoom): boolean {
    return areHumansFinished(room);
  }

  private finalizeUnfinishedBots(room: InternalRoom): void {
    finalizeUnfinishedBots(room);
  }

  private maybeFinalizeRoom(room: InternalRoom): MatchResult | null {
    if (room.matchRule === "timeAttack") {
      return null;
    }

    if (room.matchRule === "hpBattle") {
      const hasElimination = [...room.players.values()].some((player) => (player.hp ?? 1) <= 0);

      if (hasElimination) {
        return this.finalizeRoom(room);
      }
    }

    if (room.matchRule === "race" && [...room.players.values()].some((player) => player.finishStatus === "finished")) {
      finalizeUnfinishedRacePlayers(room);
      return this.finalizeRoom(room);
    }

    if (areHumansFinished(room)) {
      finalizeUnfinishedBots(room);
      return this.finalizeRoom(room);
    }

    return null;
  }

  private finalizeRoom(room: InternalRoom): MatchResult {
    if (room.status === "finished" && room.result) {
      return room.result;
    }

    const result = finalizeRoom(room);

    this.hooks.recordMatchResult?.({
      roomCode: room.roomCode,
      round: room.round,
      prompt: room.prompt ?? pickPrompt(),
      promptCategory: room.promptCategory,
      botDifficulty: room.botDifficulty,
      playerCount: room.players.size,
      hasBot: [...room.players.values()].some((player) => player.isBot),
      result
    });

    return result;
  }
}

function parseRoomRateLimitResult(value: unknown): RoomRateLimitResult | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null;
  }

  if (value.ok) {
    return { ok: true };
  }

  if (typeof value.error !== "string" || value.error.trim().length === 0) {
    return null;
  }

  return {
    ok: false,
    error: value.error
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInternalRoom(room: InternalRoom | RoomState): room is InternalRoom {
  return room.players instanceof Map;
}

function normalizeClientIp(value?: string): string {
  return value?.trim() || "unknown";
}

function createInitialRoom(
  roomCode: string,
  nickname: string,
  guestId: string,
  socketId: string,
  sessionId: string,
  deviceKind?: DeviceKind
): InternalRoom {
  const player = createPlayer(guestId, nickname, socketId, true, sessionId, deviceKind);

  return {
    roomCode: normalizeRoomCode(roomCode),
    hostPlayerId: player.id,
    status: "waiting",
    matchRule: "race",
    botDifficulty: "normal",
    promptCategory: "standard",
    promptHistory: [],
    players: new Map([[player.id, player]]),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    round: 1
  };
}

function createPlayer(
  id: string,
  nickname: string,
  socketId: string,
  isHost: boolean,
  sessionId: string,
  deviceKind: DeviceKind = "desktop"
): InternalPlayer {
  return {
    id,
    socketId,
    sessionId,
    nickname: normalizeNickname(nickname),
    connected: true,
    ready: false,
    isHost,
    isBot: false,
    deviceKind,
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    maxStreak: 0,
    currentStreak: 0,
    typingProgressIndex: 0,
    pendingInput: "",
    lastInputSequence: 0,
    wpm: 0,
    accuracy: 100
  };
}

function addBotPlayer(room: InternalRoom): void {
  if (room.players.has(BOT_PLAYER_ID)) {
    return;
  }

  const nickname = formatBotNickname(room.botDifficulty);

  room.players.set(BOT_PLAYER_ID, {
    id: BOT_PLAYER_ID,
    socketId: BOT_PLAYER_ID,
    nickname,
    connected: true,
    ready: true,
    isHost: false,
    isBot: true,
    sessionId: BOT_PLAYER_ID,
    deviceKind: "desktop",
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    maxStreak: 0,
    currentStreak: 0,
    typingProgressIndex: 0,
    pendingInput: "",
    lastInputSequence: 0,
    wpm: 0,
    accuracy: 100
  });
}

function formatBotNickname(difficulty: BotDifficulty): string {
  const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  return `${BOT_NICKNAME} (${difficultyLabel})`;
}

function selectPromptForRoom(room: InternalRoom, seed: number): Prompt {
  const prompts = getPromptsByCategory(room.promptCategory);
  const unseenPrompts = prompts.filter((prompt) => !room.promptHistory.includes(prompt.id));
  const pool = unseenPrompts.length > 0 ? unseenPrompts : prompts;

  if (pool.length === 0) {
    return pickPrompt(room.promptCategory, seed);
  }

  const index = Math.abs(seed) % pool.length;
  let selected = pool[index] ?? pool[0]!;

  if (room.prompt && pool.length > 1 && selected.id === room.prompt.id) {
    selected = pool[(index + 1) % pool.length]!;
  }

  return selected;
}

function resetPlayers(room: InternalRoom, preserveConnectionState = false): void {
  const maxHp = room.matchRule === "hpBattle" ? HP_BATTLE_MAX_HP : undefined;

  for (const player of room.players.values()) {
    player.ready = false;
    player.progressIndex = 0;
    player.correctCharacters = 0;
    player.totalTypedCharacters = 0;
    player.mistakes = 0;
    player.mistakeGuards = 0;
    player.maxStreak = 0;
    player.currentStreak = 0;
    player.typingProgressIndex = 0;
    player.pendingInput = "";
    player.lastInputSequence = 0;
    player.wpm = 0;
    player.accuracy = 100;
    if (maxHp !== undefined) {
      player.maxHp = maxHp;
      player.hp = maxHp;
    } else {
      delete player.maxHp;
      delete player.hp;
    }
    delete player.forfeited;
    delete player.finishStatus;
    if (!preserveConnectionState) {
      delete player.disconnectedAt;
    }
    delete player.finishedAt;
    delete player.finishTimeMs;
  }
}

function resetPlayerInputSession(player: InternalPlayer): void {
  player.lastInputSequence = 0;
}

function getTypingLength(room: InternalRoom, player: InternalPlayer | PlayerState): number {
  void player;
  const prompt = room.prompt ?? pickPrompt(room.promptCategory, Date.now() + room.round);
  return getPromptCanonicalLength(prompt);
}

function getTimeAttackDurationMs(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIME_ATTACK_MS;
}

function isTimeAttackExpired(room: InternalRoom, now: number): boolean {
  return room.matchRule === "timeAttack" && room.matchEndsAt !== undefined && now >= room.matchEndsAt;
}

function containsKana(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value);
}

function getRomajiProgressIndexForCanonicalProgress(
  plan: ReturnType<typeof buildRomajiTypingPlan>,
  canonicalProgressIndex: number,
  loop: boolean
): number {
  const canonicalLength = plan.units.reduce((total, unit) => total + Array.from(unit.hiragana).length, 0);
  if (!plan.guide || canonicalLength <= 0) {
    return 0;
  }

  const cycles = loop ? Math.floor(canonicalProgressIndex / canonicalLength) : 0;
  const cursor = loop ? modulo(canonicalProgressIndex, canonicalLength) : canonicalProgressIndex;
  let canonicalCursor = 0;
  let guideCursor = 0;

  for (const unit of plan.units) {
    const unitLength = Array.from(unit.hiragana).length;
    if (canonicalCursor + unitLength > cursor) {
      break;
    }
    canonicalCursor += unitLength;
    guideCursor += unit.guide.length;
  }

  return cycles * plan.guide.length + guideCursor;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function abortCountdown(room: InternalRoom): void {
  room.status = "waiting";
  delete room.prompt;
  delete room.serverStartAt;
  delete room.matchEndsAt;
  delete room.result;
  delete room.finishedAt;
  resetPlayers(room, true);
  room.lastActivityAt = Date.now();
}
function applyTypingInput(player: InternalPlayer, room: InternalRoom, payload: TypingProgress): boolean {
  if (!isValidTypingProgressPayload(payload) || payload.sequence <= player.lastInputSequence) {
    console.warn(JSON.stringify({
      event: "typing_progress_rejected",
      roomCode: room.roomCode,
      playerId: player.id,
      receivedSequence: payload.sequence,
      lastAcceptedSequence: player.lastInputSequence
    }));
    return false;
  }

  player.lastInputSequence = payload.sequence;

  if (!payload.input) {
    return true;
  }

  const promptLength = getTypingLength(room, player);
  if (promptLength <= 0 || !room.prompt) {
    return false;
  }

  const previousProgressIndex = player.progressIndex;
  const previousMistakes = player.mistakes;
  const now = Date.now();
  const startedAt = room.serverStartAt ?? now;
  const loopingMatch = room.matchRule === "timeAttack" || room.matchRule === "hpBattle";
  const kanaInput = containsKana(payload.input);
  let attackDamageDelta = 0;

  if (kanaInput) {
    for (const typedChar of Array.from(payload.input)) {
      const expectedIndex = loopingMatch ? modulo(player.progressIndex, promptLength) : player.progressIndex;
      const before = createProgressState(player);
      const after = advanceProgress(before, room.prompt.typing.hiragana[expectedIndex], typedChar);
      applyGuardedProgress(player, before, after);
      player.progressIndex = loopingMatch ? modulo(after.progressIndex, promptLength) : after.progressIndex;
      const completedCharacters = Math.max(after.progressIndex - before.progressIndex, 0);
      attackDamageDelta += completedCharacters;
    }

    const plan = buildRomajiTypingPlan(room.prompt.typing.hiragana);
    player.typingProgressIndex = getRomajiProgressIndexForCanonicalProgress(plan, player.progressIndex, loopingMatch);
  } else {
    const plan = buildRomajiTypingPlan(room.prompt.typing.hiragana);
    const guideLength = plan.guide.length;

    for (const typedChar of Array.from(payload.input)) {
      const cursor = loopingMatch && guideLength > 0
        ? modulo(player.typingProgressIndex, guideLength)
        : player.typingProgressIndex;
      const cycleBase = loopingMatch ? player.typingProgressIndex - cursor : 0;
      const before = createProgressState(player, cursor);
      const beforeUnitIndex = getRomajiTypingUnitIndex(plan, before.progressIndex);
      const after = advanceRomajiProgress(before, plan, typedChar);
      const completedUnit = after.progressIndex > before.progressIndex ? plan.units[beforeUnitIndex] : undefined;

      applyGuardedProgress(player, before, after);
      player.typingProgressIndex = cycleBase + after.progressIndex;

      if (completedUnit) {
        const canonicalDelta = Array.from(completedUnit.hiragana).length;
        player.progressIndex = loopingMatch
          ? modulo(player.progressIndex + canonicalDelta, promptLength)
          : clamp(player.progressIndex + canonicalDelta, 0, promptLength);
        attackDamageDelta += completedUnit.guide.length;
      }
    }
  }

  if (!loopingMatch) {
    player.progressIndex = clamp(player.progressIndex, 0, promptLength);
  }
  player.wpm = calculateWpm(player.correctCharacters, now - startedAt);
  player.accuracy = calculateAccuracy(player.correctCharacters, player.totalTypedCharacters);

  if (room.matchRule === "hpBattle") {
    const mistakeDelta = Math.max(player.mistakes - previousMistakes, 0);

    if (attackDamageDelta > 0) {
      for (const opponent of room.players.values()) {
        if (
          opponent.id === player.id ||
          opponent.hp === undefined ||
          opponent.hp <= 0
        ) {
          continue;
        }

        applyHpDamage(opponent, attackDamageDelta, room, now);
      }
    }

    if (mistakeDelta > 0) {
      applyHpDamage(player, mistakeDelta * HP_BATTLE_MISTAKE_DAMAGE, room, now);
    }
  }

  if (!loopingMatch && player.progressIndex >= promptLength && previousProgressIndex < promptLength) {
    player.finishedAt = now;
    player.finishTimeMs = now - startedAt;
    player.finishStatus = "finished";
  }

  return true;
}
function areHumansFinished(room: InternalRoom): boolean {
  if (room.matchRule === "timeAttack") {
    return false;
  }

  if (room.matchRule === "hpBattle") {
    return [...room.players.values()]
      .filter((p) => !p.isBot)
      .every((p) => p.finishStatus === "forfeited" || p.finishStatus === "eliminated" || (p.hp ?? 0) <= 0);
  }

  return [...room.players.values()]
    .filter((p) => !p.isBot)
    .every((p) => {
      if (p.finishStatus === "forfeited" || p.finishStatus === "eliminated") {
        return true;
      }

      if (room.matchRule === "hpBattle" && (p.hp ?? 0) <= 0) {
        return true;
      }

      return p.progressIndex >= getTypingLength(room, p);
    });
}

function finalizeUnfinishedBots(room: InternalRoom): void {
  for (const bot of [...room.players.values()].filter((p) => p.isBot)) {
    if (bot.progressIndex < getTypingLength(room, bot)) {
      bot.finishedAt = Date.now();
      delete bot.finishTimeMs;
      bot.finishStatus = "unfinished";
    }
  }
}

function finalizeUnfinishedRacePlayers(room: InternalRoom): void {
  for (const player of room.players.values()) {
    if (player.finishStatus === "finished" || player.progressIndex >= getTypingLength(room, player)) {
      continue;
    }
    player.finishedAt = Date.now();
    delete player.finishTimeMs;
    player.finishStatus = "unfinished";
  }
}

function applyBotProgress(
  bot: InternalPlayer,
  room: InternalRoom,
  charsToAdd: number,
  totalTypedDelta: number,
  isMistake: boolean
): void {
  const promptLength = getTypingLength(room, bot);
  const now = Date.now();
  const startedAt = room.serverStartAt ?? now;
  const loopingMatch = room.matchRule === "timeAttack" || room.matchRule === "hpBattle";
  const progressDelta = loopingMatch
    ? charsToAdd
    : Math.min(charsToAdd, Math.max(promptLength - bot.progressIndex, 0));

  bot.totalTypedCharacters += totalTypedDelta;

  if (isMistake) {
    if ((bot.mistakeGuards ?? 0) > 0) {
      bot.mistakeGuards = Math.max((bot.mistakeGuards ?? 0) - 1, 0);
    } else {
      bot.mistakes += totalTypedDelta;
      bot.currentStreak = 0;
      if (room.matchRule === "hpBattle") {
        applyHpDamage(bot, totalTypedDelta * HP_BATTLE_MISTAKE_DAMAGE, room, now);
      }
    }
  } else if (progressDelta > 0) {
    const previousStreak = bot.currentStreak;
    bot.progressIndex += progressDelta;
    bot.correctCharacters += progressDelta;
    bot.currentStreak += progressDelta;
    bot.maxStreak = Math.max(bot.maxStreak, bot.currentStreak);
    if (room.matchRule === "hpBattle") {
      bot.progressIndex = modulo(bot.progressIndex, promptLength);
      for (const opponent of room.players.values()) {
        if (opponent.id !== bot.id && opponent.hp !== undefined && opponent.hp > 0) {
          applyHpDamage(opponent, progressDelta, room, now);
        }
      }
    }
    const earned = Math.floor(bot.currentStreak / MISTAKE_GUARD_STREAK) - Math.floor(previousStreak / MISTAKE_GUARD_STREAK);
    bot.mistakeGuards = Math.min((bot.mistakeGuards ?? 0) + Math.max(earned, 0), MAX_MISTAKE_GUARDS);
  }

  bot.wpm = calculateWpm(bot.correctCharacters, now - startedAt);
  bot.accuracy = calculateAccuracy(bot.correctCharacters, bot.totalTypedCharacters);
}

function ensureConnectedHost(room: InternalRoom): void {
  const currentHost = room.players.get(room.hostPlayerId);

  if (currentHost?.connected && !currentHost.isBot) {
    return;
  }

  const nextHost = [...room.players.values()].find((player) => player.connected && !player.isBot)
    ?? [...room.players.values()].find((player) => !player.isBot);

  if (nextHost) {
    room.hostPlayerId = nextHost.id;
  }
}

function shouldExpireRoom(room: InternalRoom, now: number): boolean {
  const deadline = getRoomExpirationDeadline(room);
  return deadline !== null && now >= deadline;
}

function getRoomExpirationDeadline(room: InternalRoom): number | null {
  const hasConnectedHuman = [...room.players.values()].some((player) => player.connected && !player.isBot);
  const allHumansOffline = [...room.players.values()]
    .filter((player) => !player.isBot)
    .every((player) => !player.connected);

  if (room.status === "waiting") {
    return allHumansOffline ? room.lastActivityAt + WAITING_IDLE_TTL_MS : null;
  }

  if (room.status === "finished") {
    return hasConnectedHuman ? null : (room.finishedAt ?? room.lastActivityAt) + FINISHED_RESULT_RETENTION_MS;
  }

  if (allHumansOffline) {
    return room.lastActivityAt + ABANDONED_ROOM_TTL_MS;
  }

  return null;
}

function syncMatchRuleState(room: InternalRoom): void {
  delete room.matchEndsAt;
  room.suddenDeath = false;
}

function clearRoomReadyStates(room: InternalRoom): void {
  for (const player of room.players.values()) {
    player.ready = false;
  }
}

function applyHpDamage(player: InternalPlayer, damage: number, room: InternalRoom, now: number): void {
  if (damage <= 0 || player.hp === undefined || player.hp <= 0) {
    return;
  }

  const nextHp = Math.max(0, player.hp - (room.suddenDeath ? damage * 2 : damage));
  if (nextHp === player.hp) {
    return;
  }

  player.hp = nextHp;

  if (nextHp === 0) {
    player.finishedAt = now;
    delete player.finishTimeMs;
    player.finishStatus = "eliminated";
  }
}

function finalizeRoom(room: InternalRoom): MatchResult {
  room.status = "finished";
  room.finishedAt = Date.now();
  const result = toMatchResult(room);
  room.result = result;

  return result;
}

function toMatchResult(room: InternalRoom): MatchResult {
  const prompt = room.prompt ?? pickPrompt();
  return {
    roomCode: room.roomCode,
    prompt,
    matchRule: room.matchRule,
    players: rankPlayers(toPublicPlayers(room), (player) => getTypingLength(room, room.players.get(player.id)!), room.matchRule)
  };
}

function toPublicRoom(room: InternalRoom): RoomState {
  const publicRoom: RoomState = {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    matchRule: room.matchRule,
    botDifficulty: room.botDifficulty,
    promptCategory: room.promptCategory,
    players: toPublicPlayers(room),
    maxPlayers: MAX_PLAYERS,
    round: room.round,
    ...(room.suddenDeath ? { suddenDeath: true } : {})
  };

  if (room.prompt) {
    publicRoom.prompt = room.prompt;
  }

  if (room.serverStartAt) {
    publicRoom.serverStartAt = room.serverStartAt;
  }

  if (room.matchEndsAt) {
    publicRoom.matchEndsAt = room.matchEndsAt;
  }

  if (room.result) {
    publicRoom.result = room.result;
  }

  return publicRoom;
}

function toPublicPlayers(room: InternalRoom): PlayerState[] {
  return [...room.players.values()].map((player) => toPublicPlayer(player, room.hostPlayerId));
}

function toPublicPlayer(player: InternalPlayer, hostPlayerId: string): PlayerState {
  const publicPlayer: PlayerState = {
    id: player.id,
    nickname: player.nickname,
    connected: player.connected,
    ready: player.ready,
    isHost: player.id === hostPlayerId,
    isBot: player.isBot,
    progressIndex: player.progressIndex,
    ...(player.deviceKind === "desktop"
      ? { typingProgressIndex: player.typingProgressIndex, pendingInput: player.pendingInput }
      : {}),
    correctCharacters: player.correctCharacters,
    totalTypedCharacters: player.totalTypedCharacters,
    mistakes: player.mistakes,
    wpm: player.wpm,
    accuracy: player.accuracy,
    maxStreak: player.maxStreak,
    currentStreak: player.currentStreak,
    forfeited: player.forfeited
  };

  if (player.hp !== undefined) {
    publicPlayer.hp = player.hp;
  }

  if (player.deviceKind !== undefined) {
    publicPlayer.deviceKind = player.deviceKind;
  }

  if (player.mistakeGuards !== undefined) {
    publicPlayer.mistakeGuards = player.mistakeGuards;
  }

  if (player.accessoryIndex !== undefined) {
    publicPlayer.accessoryIndex = player.accessoryIndex;
  }

  if (player.maxHp !== undefined) {
    publicPlayer.maxHp = player.maxHp;
  }

  if (player.finishedAt !== undefined) {
    publicPlayer.finishedAt = player.finishedAt;
  }

  if (player.finishTimeMs !== undefined && Number.isFinite(player.finishTimeMs)) {
    publicPlayer.finishTimeMs = player.finishTimeMs;
  }

  if (player.finishStatus !== undefined) {
    publicPlayer.finishStatus = player.finishStatus;
  }

  return publicPlayer;
}

function createProgressState(player: InternalPlayer, progressIndex = player.progressIndex) {
  return {
    ...createEmptyProgress(),
    progressIndex,
    correctCharacters: player.correctCharacters,
    totalTypedCharacters: player.totalTypedCharacters,
    mistakes: player.mistakes,
    currentStreak: player.currentStreak,
    maxStreak: player.maxStreak,
    pendingInput: player.pendingInput
  };
}

function applyProgressState(player: InternalPlayer, progress: ReturnType<typeof createProgressState>): void {
  player.correctCharacters = progress.correctCharacters;
  player.totalTypedCharacters = progress.totalTypedCharacters;
  player.mistakes = progress.mistakes;
  player.currentStreak = progress.currentStreak;
  player.maxStreak = progress.maxStreak;
  player.pendingInput = progress.pendingInput;

}

function applyGuardedProgress(
  player: InternalPlayer,
  before: ReturnType<typeof createProgressState>,
  after: ReturnType<typeof createProgressState>
): void {
  const mistake = after.mistakes > before.mistakes;
  const guarded = mistake && (player.mistakeGuards ?? 0) > 0;

  if (guarded) {
    player.mistakeGuards = Math.max((player.mistakeGuards ?? 0) - 1, 0);
    after.mistakes = before.mistakes;
    after.currentStreak = before.currentStreak;
    after.maxStreak = before.maxStreak;
  }

  if (!guarded && after.currentStreak > 0) {
    const earned = Math.floor(after.currentStreak / MISTAKE_GUARD_STREAK) - Math.floor(before.currentStreak / MISTAKE_GUARD_STREAK);
    if (earned > 0) {
      player.mistakeGuards = Math.min((player.mistakeGuards ?? 0) + earned, MAX_MISTAKE_GUARDS);
    }
  }

  applyProgressState(player, after);
}

function getPromptCanonicalLength(prompt: Prompt): number {
  return Array.from(prompt.typing.hiragana).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function isValidTypingProgressPayload(payload: TypingProgress): boolean {
  return isValidTypingPayloadValues(payload.input, payload.sequence);
}

function createRoomStateFromSnapshot(
  room: RoomState,
  playerSessions: Record<string, string> = {},
  disconnectedAt: Record<string, number> = {},
  internal: PersistedRoomSnapshot["internal"] = {},
  restoreNow = Date.now()
): InternalRoom {
  const normalizedRoomCode = normalizeRoomCode(room.roomCode);
  const typingState = internal?.typingState ?? {};
  const restoredTypingPlan = room.prompt ? buildRomajiTypingPlan(room.prompt.typing.hiragana) : null;
  const loopingMatch = room.matchRule === "timeAttack" || room.matchRule === "hpBattle";
  const internalRoom: InternalRoom = {
    roomCode: normalizedRoomCode,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    matchRule: room.matchRule,
    botDifficulty: room.botDifficulty,
    promptCategory: room.promptCategory,
    promptHistory: internal?.promptHistory ?? (room.prompt ? [room.prompt.id] : []),
    players: new Map(
      room.players.map((player) => [
        player.id,
        {
          ...player,
          socketId: player.id,
          sessionId: playerSessions[player.id] ?? player.id,
          isHost: player.id === room.hostPlayerId,
          connected: player.isBot ? player.connected : false,
          ready: player.isBot ? player.ready : false,
          typingProgressIndex: typingState[player.id]?.typingProgressIndex ?? (
            restoredTypingPlan
              ? getRomajiProgressIndexForCanonicalProgress(
                  restoredTypingPlan,
                  Number.isFinite(player.progressIndex) ? player.progressIndex : 0,
                  loopingMatch
                )
              : 0
          ),
          pendingInput: typingState[player.id]?.pendingInput ?? "",
          lastInputSequence: typingState[player.id]?.lastInputSequence ?? 0,
          ...(!player.isBot
            ? { disconnectedAt: disconnectedAt[player.id] ?? restoreNow }
            : {})
        } as InternalPlayer
      ])
    ),
    createdAt: internal?.createdAt ?? Date.now(),
    lastActivityAt: internal?.lastActivityAt ?? Date.now(),
    round: internal?.round ?? 1,
    ...(room.prompt ? { prompt: room.prompt } : {}),
    ...(room.serverStartAt !== undefined ? { serverStartAt: room.serverStartAt } : {}),
    ...(room.matchEndsAt !== undefined ? { matchEndsAt: room.matchEndsAt } : {}),
    ...(room.suddenDeath ? { suddenDeath: true } : {}),
    ...(internal?.finishedAt !== undefined ? { finishedAt: internal.finishedAt } : {}),
    ...(room.result ? { result: room.result } : {})
  };

  ensureConnectedHost(internalRoom);
  return internalRoom;
}

function parsePersistedRoomSnapshotFromValue(value: unknown): PersistedRoomSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawRoom = "room" in value ? value.room : value;
  if (!isRecord(rawRoom) || typeof rawRoom.roomCode !== "string" || !isValidRoomCode(rawRoom.roomCode)) {
    return null;
  }

  const room = rawRoom as RoomState;
  const snapshot = value as PersistedRoomSnapshot;

  const internal = parseSnapshotInternal(snapshot.internal);
  return {
    schemaVersion: typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : 1,
    room,
    playerSessions: parseStringRecord(snapshot.playerSessions),
    disconnectedAt: parseNumberRecord(snapshot.disconnectedAt),
    ...(internal ? { internal } : {})
  };
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function parseNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
  );
}

function parseSnapshotInternal(value: unknown): PersistedRoomSnapshot["internal"] {
  if (!isRecord(value)) {
    return {};
  }

  const typingState: Record<string, PersistedPlayerTypingState> = {};
  if (isRecord(value.typingState)) {
    for (const [playerId, state] of Object.entries(value.typingState)) {
      if (!isRecord(state)) {
        continue;
      }

      typingState[playerId] = {
        ...(typeof state.typingProgressIndex === "number" && Number.isFinite(state.typingProgressIndex)
          ? { typingProgressIndex: state.typingProgressIndex }
          : {}),
        ...(typeof state.pendingInput === "string" ? { pendingInput: state.pendingInput } : {}),
        ...(typeof state.lastInputSequence === "number" && Number.isSafeInteger(state.lastInputSequence)
          ? { lastInputSequence: state.lastInputSequence }
          : {})
      };
    }
  }

  return {
    ...(typeof value.round === "number" && Number.isSafeInteger(value.round) && value.round > 0
      ? { round: value.round }
      : {}),
    ...(Array.isArray(value.promptHistory) && value.promptHistory.every((entry) => typeof entry === "string")
      ? { promptHistory: value.promptHistory }
      : {}),
    ...(typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? { createdAt: value.createdAt } : {}),
    ...(typeof value.lastActivityAt === "number" && Number.isFinite(value.lastActivityAt)
      ? { lastActivityAt: value.lastActivityAt }
      : {}),
    ...(typeof value.finishedAt === "number" && Number.isFinite(value.finishedAt) ? { finishedAt: value.finishedAt } : {}),
    ...(Object.keys(typingState).length > 0 ? { typingState } : {})
  };
}
