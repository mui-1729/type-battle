import type { AckResponse, RoomState } from "@type-battle/shared";
import {
  advanceBot,
  createRoom,
  checkExpiredTimeAttackMatches,
  checkForForfeits,
  cleanupExpiredRooms,
  getRoom,
  explicitLeaveBySocket,
  joinRoom,
  leaveBySocket,
  markPlaying,
  rematch,
  restoreRoomState,
  rooms,
  setBotDifficulty,
  setMatchRule,
  setPromptCategory,
  setReady,
  setRoomEngineHooks,
  startDailyPractice,
  startMatch,
  startPractice,
  updateProgress,
  finishTyping
} from "@type-battle/shared/room-engine";
import type { RoomEngineHooks } from "@type-battle/shared/room-engine";
import { normalizeNickname, validateNickname } from "@type-battle/shared";
import type {
  BotDifficulty,
  DeviceKind,
  MatchRule,
  PromptCategory
} from "@type-battle/shared";
import type {
  CloudflareClientMessageType,
  CloudflareServerEventEnvelope,
  CloudflareServerEventType,
  CloudflareServerMessage
} from "@type-battle/shared/cloudflare-events";
import { CLOUDFLARE_CLIENT_MESSAGE_TYPES } from "@type-battle/shared/cloudflare-events";
import { normalizeRoomCode, resolveRoomRoute } from "./room-routing.js";
import { RateLimiter } from "./rate-limiter.js";

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
};

type ParsedClientMessage = {
  id: string;
  type: string;
  payload: unknown;
};

type CreateRoomPayload = {
  nickname: string;
  guestId: string;
  sessionId: string;
  deviceKind?: DeviceKind;
};

type JoinRoomPayload = CreateRoomPayload & {
  roomCode: string;
};

type RoomCodePayload = {
  roomCode: string;
};

type ReadyPayload = RoomCodePayload & {
  ready: boolean;
};

type PromptCategoryPayload = RoomCodePayload & {
  category: PromptCategory;
};

type BotDifficultyPayload = RoomCodePayload & {
  difficulty: BotDifficulty;
};

type MatchRulePayload = RoomCodePayload & {
  rule: MatchRule;
};

type TypingPayload = RoomCodePayload & {
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
};

type PracticePayload = {
  nickname: string;
  category: PromptCategory;
};

type DailyPracticePayload = {
  nickname: string;
};

type RoomRateLimitAction = "create" | "join";

type RoomRateLimitInput = {
  action: RoomRateLimitAction;
  clientIp: string;
  guestId: string;
};

type RoomRateLimitResult = { ok: true } | { ok: false; error: string };

type PersistedRoomSnapshot = {
  room: RoomState;
  playerSessions?: Record<string, string>;
  disconnectedAt?: Record<string, number>;
};

type InternalRoomRecord = (typeof rooms) extends Map<string, infer T> ? T : never;
type GuestSessionStorageRecord = Parameters<NonNullable<RoomEngineHooks["recordGuestSession"]>>[0] & {
  createdAt: string;
  lastSeenAt: string;
};
type MatchResultStorageRecord = Parameters<NonNullable<RoomEngineHooks["recordMatchResult"]>>[0] & {
  createdAt: string;
};

const OPEN_STATE = 1;
const ROOM_STORAGE_PREFIX = "room:";
const GUEST_SESSION_STORAGE_PREFIX = "guest-session:";
const MATCH_RESULT_STORAGE_PREFIX = "match-result:";
const BOT_TICK_MS = 500;
const ROOM_TTL_MS = 60_000;
const DISCONNECT_GRACE_MS = 30_000;
const ROOM_PERSIST_DEBOUNCE_MS = 1_000;
const MAINTENANCE_ALARM_FALLBACK_MS = 5_000;
const INVALID_MESSAGE_ERROR = "リクエストの形式が正しくありません。";

type GatewayTimers = {
  countdown?: ReturnType<typeof setTimeout>;
  bot?: ReturnType<typeof setInterval>;
  persist?: ReturnType<typeof setTimeout>;
};

export class RealtimeGatewayDurableObject {
  private readonly sockets = new Map<string, CloudflareSocketLike>();
  private readonly socketStates = new Map<string, SocketState>();
  private readonly roomSockets = new Map<string, Set<string>>();
  private readonly playerSessionsByRoom = new Map<string, Map<string, string>>();
  private readonly timers = new Map<string, GatewayTimers>();
  private readonly persistedRoomCodes = new Set<string>();
  private readonly roomCreateIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  private readonly roomCreateGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
  private readonly roomJoinIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 100 });
  private readonly roomJoinGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  private readonly progressLimiter = new RateLimiter({ windowMs: 1000, max: 30 });
  private maintenanceFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  readonly ready: Promise<void>;

  constructor(private readonly state: DurableObjectState) {
    setRoomEngineHooks({
      recordGuestSession: (input) => {
        void this.persistGuestSessionRecord(input);
      },
      recordMatchResult: (input) => {
        void this.persistMatchResultRecord(input);
      }
    });
    this.ready = this.state.blockConcurrencyWhile(async () => {
      await this.restoreRooms();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    const url = new URL(request.url);
    const route = resolveRoomRoute(url.pathname);

    if (route?.action === "state") {
      return this.handleStateRequest(request, route.roomCode);
    }

    if (isWebSocketUpgrade(request)) {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      const currentRooms = [...rooms.values()].length;
      const activeSockets = this.sockets.size;

      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-worker",
        rooms: currentRooms,
        sockets: activeSockets
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.runMaintenance();
    await this.scheduleMaintenanceAlarm();
  }

  async checkRoomRequestRateLimit(input: RoomRateLimitInput): Promise<RoomRateLimitResult> {
    const clientIp = normalizeClientIp(input.clientIp);
    const guestId = input.guestId.trim();

    if (!guestId) {
      return { ok: false, error: INVALID_MESSAGE_ERROR };
    }

    if (input.action === "create") {
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

  attachSocket(socket: CloudflareSocketLike, options: AttachSocketOptions = {}): string {
    const socketId = crypto.randomUUID();
    this.sockets.set(socketId, socket);
    this.socketStates.set(socketId, {
      socketId,
      clientIp: normalizeClientIp(options.clientIp)
    });
    socket.accept();

    socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(socketId, event.data);
    });

    socket.addEventListener("close", () => {
      void this.handleSocketClose(socketId);
    });

    return socketId;
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.attachSocket(server as unknown as CloudflareSocketLike, {
      clientIp: readClientIp(request.headers)
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private async handleSocketMessage(socketId: string, rawMessage: unknown): Promise<void> {
    if (typeof rawMessage !== "string") {
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
        await this.handlePracticeStart(socketId, message.id, message.payload);
        return;
      case "client:practice:dailyStart":
        await this.handleDailyPracticeStart(socketId, message.id, message.payload);
        return;
      default:
        return;
    }
  }

  private async handleSocketClose(socketId: string): Promise<void> {
    const roomCode = this.socketStates.get(socketId)?.roomCode;
    this.detachSocket(socketId);

    const room = leaveBySocket(socketId);

    if (room) {
      this.broadcastRoomState(room);
      void this.persistRoom(room.roomCode);
      return;
    }

    if (roomCode) {
      void this.persistRoom(roomCode);
    }
  }

  private async handleCreateRoom(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseCreateRoomPayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:room:create", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const clientIp = this.socketStates.get(socketId)?.clientIp ?? "unknown";
    if (!this.roomCreateIpLimiter.isAllowed(clientIp)) {
      this.sendAck(socketId, messageId, "client:room:create", {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)"
      });
      return;
    }

    if (!this.roomCreateGuestLimiter.isAllowed(parsedPayload.guestId)) {
      this.sendAck(socketId, messageId, "client:room:create", {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
      });
      return;
    }

    const error = validateNickname(parsedPayload.nickname);

    if (error) {
      this.sendAck(socketId, messageId, "client:room:create", { ok: false, error });
      return;
    }

    const result = createRoom({
      nickname: normalizeNickname(parsedPayload.nickname),
      guestId: parsedPayload.guestId,
      socketId,
      ...(parsedPayload.sessionId ? { sessionId: parsedPayload.sessionId } : {}),
      ...(parsedPayload.deviceKind ? { deviceKind: parsedPayload.deviceKind } : {})
    });

    this.setSocketRoom(socketId, result.room.roomCode, result.playerId);
    this.recordPlayerSession(result.room.roomCode, result.playerId, parsedPayload.sessionId);
    this.sendAck(socketId, messageId, "client:room:create", {
      ok: true,
      data: {
        roomCode: result.room.roomCode,
        playerId: result.playerId,
        room: result.room
      }
    });
    this.broadcastRoomState(result.room);
    void this.persistRoom(result.room.roomCode);
  }

  private async handleJoinRoom(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseJoinRoomPayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const clientIp = this.socketStates.get(socketId)?.clientIp ?? "unknown";
    if (!this.roomJoinIpLimiter.isAllowed(clientIp)) {
      this.sendAck(socketId, messageId, "client:room:join", {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)"
      });
      return;
    }

    if (!this.roomJoinGuestLimiter.isAllowed(parsedPayload.guestId)) {
      this.sendAck(socketId, messageId, "client:room:join", {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
      });
      return;
    }

    const error = validateNickname(parsedPayload.nickname);

    if (error) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error });
      return;
    }

    const sessionError = this.validateExistingPlayerSession(parsedPayload.roomCode, parsedPayload.guestId, parsedPayload.sessionId);

    if (sessionError) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error: sessionError });
      return;
    }

    const result = joinRoom({
      roomCode: parsedPayload.roomCode,
      nickname: normalizeNickname(parsedPayload.nickname),
      guestId: parsedPayload.guestId,
      socketId,
      ...(parsedPayload.sessionId ? { sessionId: parsedPayload.sessionId } : {}),
      ...(parsedPayload.deviceKind ? { deviceKind: parsedPayload.deviceKind } : {})
    });

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:join", { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode, result.playerId);
    this.recordPlayerSession(result.room.roomCode, result.playerId, parsedPayload.sessionId);
    this.sendAck(socketId, messageId, "client:room:join", {
      ok: true,
      data: {
        playerId: result.playerId,
        room: result.room
      }
    });
    this.broadcastRoomState(result.room);
    void this.persistRoom(result.room.roomCode);
  }

  private async handleLeaveRoom(socketId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseRoomCodePayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    const roomCode = this.socketStates.get(socketId)?.roomCode ?? normalizeRoomCode(parsedPayload.roomCode);
    const room = explicitLeaveBySocket(socketId);
    this.detachSocketFromRoom(socketId);

    if (room) {
      this.broadcastRoomState(room);
      void this.persistRoom(room.roomCode);
      return;
    }

    void this.persistRoom(roomCode);
  }

  private async handleSetReady(socketId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseReadyPayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    const room = setReady(socketId, parsedPayload.roomCode, parsedPayload.ready);

    if (!room) {
      return;
    }

    this.setSocketRoom(socketId, room.roomCode);
    this.broadcastRoomState(room);
    void this.persistRoom(room.roomCode);
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

    const result = setPromptCategory(socketId, parsedPayload.roomCode, parsedPayload.category);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setPromptCategory", { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, messageId, "client:room:setPromptCategory", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    void this.persistRoom(result.room.roomCode);
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

    const result = setBotDifficulty(socketId, parsedPayload.roomCode, parsedPayload.difficulty);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setBotDifficulty", { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, messageId, "client:room:setBotDifficulty", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    void this.persistRoom(result.room.roomCode);
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

    const result = setMatchRule(socketId, parsedPayload.roomCode, parsedPayload.rule);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setMatchRule", { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, messageId, "client:room:setMatchRule", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    void this.persistRoom(result.room.roomCode);
  }

  private async handleStartMatch(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseRoomCodePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:match:start", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const result = startMatch(socketId, parsedPayload.roomCode);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:match:start", { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, messageId, "client:match:start", { ok: true, data: result.room });
    this.broadcastToRoom(result.room.roomCode, {
      id: crypto.randomUUID(),
      type: "server:match:countdown",
      payload: {
        room: result.room,
        serverStartAt: result.room.serverStartAt ?? Date.now()
      }
    });
    void this.persistRoom(result.room.roomCode);
    this.scheduleMatchStart(result.room.roomCode);
  }

  private async handleTypingProgress(
    socketId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parseTypingPayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    if (!this.progressLimiter.isAllowed(socketId)) {
      return;
    }

    const result = updateProgress(socketId, parsedPayload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.setSocketRoom(socketId, result.roomCode);
      this.broadcastRoomState(result);
      this.schedulePersistRoom(result.roomCode);
      return;
    }

    this.broadcastToRoom(result.roomCode, {
      id: crypto.randomUUID(),
      type: "server:match:result",
      payload: result
    });
    this.schedulePersistRoom(result.roomCode);
  }

  private async handleTypingFinish(
    socketId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parseTypingPayload(payload);

    if (!parsedPayload) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    const result = finishTyping(socketId, parsedPayload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.setSocketRoom(socketId, result.roomCode);
      this.broadcastRoomState(result);
      this.schedulePersistRoom(result.roomCode);
      return;
    }

    this.broadcastToRoom(result.roomCode, {
      id: crypto.randomUUID(),
      type: "server:match:result",
      payload: result
    });
    this.schedulePersistRoom(result.roomCode);
  }

  private async handleRematch(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseRoomCodePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:match:rematch", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const result = rematch(socketId, parsedPayload.roomCode);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:match:rematch", { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, messageId, "client:match:rematch", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    void this.persistRoom(result.room.roomCode);
  }

  private async handlePracticeStart(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parsePracticePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:practice:start", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const practice = startPractice(parsedPayload.nickname, parsedPayload.category);
    this.sendAck(socketId, messageId, "client:practice:start", { ok: true, data: practice });
  }

  private async handleDailyPracticeStart(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parseDailyPracticePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:practice:dailyStart", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const practice = startDailyPractice(parsedPayload.nickname);
    this.sendAck(socketId, messageId, "client:practice:dailyStart", { ok: true, data: practice });
  }

  private broadcastRoomState(room: RoomState): void {
    this.broadcastToRoom(room.roomCode, {
      id: crypto.randomUUID(),
      type: "server:room:state",
      payload: room
    });
  }

  private broadcastToRoom<TType extends CloudflareServerEventType>(
    roomCode: string,
    message: CloudflareServerEventEnvelope<TType>
  ): void {
    const socketIds = this.roomSockets.get(roomCode.toUpperCase());

    if (!socketIds) {
      return;
    }

    for (const socketId of [...socketIds]) {
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
      this.detachSocket(socketId);
      return;
    }

    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.detachSocket(socketId);
    }
  }

  private setSocketRoom(socketId: string, roomCode: string, playerId?: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const currentRoomCode = this.socketStates.get(socketId)?.roomCode;

    if (currentRoomCode && currentRoomCode !== normalizedRoomCode) {
      this.detachSocketFromRoom(socketId);
    }

    const socketState = this.socketStates.get(socketId) ?? { socketId, clientIp: "unknown" };
    socketState.roomCode = normalizedRoomCode;
    if (playerId) {
      socketState.playerId = playerId;
    }
    this.socketStates.set(socketId, socketState);

    const sockets = this.roomSockets.get(normalizedRoomCode) ?? new Set<string>();
    sockets.add(socketId);
    this.roomSockets.set(normalizedRoomCode, sockets);
  }

  private detachSocketFromRoom(socketId: string): void {
    const roomCode = this.socketStates.get(socketId)?.roomCode;

    if (!roomCode) {
      return;
    }

    const sockets = this.roomSockets.get(roomCode);
    sockets?.delete(socketId);

    if (sockets && sockets.size === 0) {
      this.roomSockets.delete(roomCode);
    }

    const state = this.socketStates.get(socketId);

    if (state) {
      delete state.roomCode;
      this.socketStates.set(socketId, state);
    }
  }

  private detachSocket(socketId: string): void {
    this.detachSocketFromRoom(socketId);
    this.sockets.delete(socketId);
    this.socketStates.delete(socketId);
  }

  private async persistRoom(roomCode: string): Promise<void> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    this.clearPersistTimer(normalizedRoomCode);
    const storageKey = `${ROOM_STORAGE_PREFIX}${normalizedRoomCode}`;
    const snapshot = this.createPersistedRoomSnapshot(normalizedRoomCode);

    try {
      if (!snapshot) {
        await this.state.storage.delete(storageKey);
        this.persistedRoomCodes.delete(normalizedRoomCode);
        this.playerSessionsByRoom.delete(normalizedRoomCode);
      } else {
        await this.state.storage.put(storageKey, snapshot);
        this.persistedRoomCodes.add(normalizedRoomCode);
      }
    } catch {
      // Persistence failures should not break live room handling.
    }

    await this.scheduleMaintenanceAlarm();
  }

  private createPersistedRoomSnapshot(roomCode: string): PersistedRoomSnapshot | null {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = getRoom(normalizedRoomCode);
    const internalRoom = rooms.get(normalizedRoomCode);

    if (!room || !internalRoom) {
      return null;
    }

    const disconnectedAt: Record<string, number> = {};

    for (const [playerId, player] of internalRoom.players.entries()) {
      if (player.disconnectedAt !== undefined) {
        disconnectedAt[playerId] = player.disconnectedAt;
      }
    }

    return {
      room,
      playerSessions: Object.fromEntries(this.playerSessionsByRoom.get(normalizedRoomCode) ?? []),
      disconnectedAt
    };
  }

  private schedulePersistRoom(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const timers = this.timers.get(normalizedRoomCode) ?? {};

    if (timers.persist) {
      clearTimeout(timers.persist);
    }

    timers.persist = setTimeout(() => {
      void this.persistRoom(normalizedRoomCode);
    }, ROOM_PERSIST_DEBOUNCE_MS);
    this.timers.set(normalizedRoomCode, timers);
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
    } catch {
      // Low-frequency persistence is best-effort and must not interrupt active rooms.
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
    } catch {
      // Match results should be durable when possible, but gameplay must continue on storage failure.
    }
  }

  private async restoreRooms(): Promise<void> {
    rooms.clear();
    this.persistedRoomCodes.clear();
    this.playerSessionsByRoom.clear();
    const storedRooms = await this.state.storage.list<unknown>({ prefix: ROOM_STORAGE_PREFIX });

    for (const [key, storedRoom] of storedRooms) {
      const roomCode = normalizeRoomCode(key.slice(ROOM_STORAGE_PREFIX.length));
      const snapshot = await parsePersistedRoomSnapshot(storedRoom, roomCode);

      if (!snapshot) {
        continue;
      }

      this.restorePersistedRoom(snapshot);
      this.persistedRoomCodes.add(roomCode);
      this.syncRestoredRoom(snapshot.room.roomCode);
    }

    await this.scheduleMaintenanceAlarm();
  }

  private restorePersistedRoom(snapshot: PersistedRoomSnapshot): void {
    const playerSessions = snapshot.playerSessions ?? {};
    const disconnectedAt = snapshot.disconnectedAt ?? {};

    restoreRoomStateIfValid(snapshot.room, playerSessions);

    const normalizedRoomCode = normalizeRoomCode(snapshot.room.roomCode);
    const internalRoom = rooms.get(normalizedRoomCode);

    if (internalRoom) {
      for (const [playerId, player] of internalRoom.players.entries()) {
        if (player.isBot) {
          continue;
        }

        const disconnectedAtValue = disconnectedAt[playerId];
        player.connected = false;
        player.ready = false;

        if (disconnectedAtValue !== undefined) {
          player.disconnectedAt = disconnectedAtValue;
        } else {
          player.disconnectedAt = Date.now();
        }
      }
    }

    this.playerSessionsByRoom.set(normalizedRoomCode, new Map(Object.entries(playerSessions)));
  }

  private async scheduleMaintenanceAlarm(): Promise<void> {
    const nextAlarmAt = this.getNextMaintenanceAlarmAt();

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
      void this.alarm();
    }, MAINTENANCE_ALARM_FALLBACK_MS);
  }

  private clearMaintenanceFallbackTimer(): void {
    if (!this.maintenanceFallbackTimer) {
      return;
    }

    clearTimeout(this.maintenanceFallbackTimer);
    this.maintenanceFallbackTimer = undefined;
  }

  private syncRestoredRoom(roomCode: string): void {
    const room = getRoom(roomCode);

    if (!room) {
      return;
    }

    if (room.status === "countdown" && room.serverStartAt) {
      this.scheduleMatchStart(room.roomCode);
      return;
    }

    if (room.status === "playing" && room.players.some((player) => player.isBot)) {
      this.scheduleBotProgress(room.roomCode);
      return;
    }

    this.clearRoomTimers(room.roomCode);
  }

  private scheduleMatchStart(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    this.clearRoomTimers(normalizedRoomCode);

    const room = getRoom(normalizedRoomCode);

    if (!room?.serverStartAt) {
      return;
    }

    const timers = this.timers.get(normalizedRoomCode) ?? {};
    timers.countdown = setTimeout(() => {
      const playingRoom = markPlaying(normalizedRoomCode);

      if (!playingRoom) {
        return;
      }

      this.broadcastToRoom(normalizedRoomCode, {
        id: crypto.randomUUID(),
        type: "server:match:started",
        payload: playingRoom
      });
      this.broadcastRoomState(playingRoom);
      void this.persistRoom(normalizedRoomCode);
      this.scheduleBotProgress(normalizedRoomCode);
    }, Math.max(room.serverStartAt - Date.now(), 0));
    this.timers.set(normalizedRoomCode, timers);
  }

  private scheduleBotProgress(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = getRoom(normalizedRoomCode);
    const hasBot = Boolean(room?.players.some((player) => player.isBot));

    if (!room || !hasBot) {
      return;
    }

    const timers = this.timers.get(normalizedRoomCode) ?? {};
    if (timers.bot) {
      clearInterval(timers.bot);
    }

    timers.bot = setInterval(() => {
      const outcome = advanceBot(normalizedRoomCode);

      if (!outcome) {
        const currentRoom = getRoom(normalizedRoomCode);

        if (!currentRoom || currentRoom.status !== "playing") {
          this.clearRoomTimers(normalizedRoomCode);
        }

        return;
      }

      if (outcome.type === "result") {
        this.broadcastToRoom(normalizedRoomCode, {
          id: crypto.randomUUID(),
          type: "server:match:result",
          payload: outcome.result
        });
        const currentRoom = getRoom(normalizedRoomCode);
        if (currentRoom) {
          this.broadcastRoomState(currentRoom);
        }
        void this.persistRoom(normalizedRoomCode);
        this.clearRoomTimers(normalizedRoomCode);
        return;
      }

      this.broadcastRoomState(outcome.room);
      this.schedulePersistRoom(normalizedRoomCode);
    }, BOT_TICK_MS);

    this.timers.set(normalizedRoomCode, timers);
  }

  private clearRoomTimers(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const timers = this.timers.get(normalizedRoomCode);

    if (!timers) {
      return;
    }

    if (timers.countdown) {
      clearTimeout(timers.countdown);
    }

    if (timers.bot) {
      clearInterval(timers.bot);
    }

    if (timers.persist) {
      clearTimeout(timers.persist);
    }

    this.timers.delete(normalizedRoomCode);
  }

  private clearPersistTimer(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const timers = this.timers.get(normalizedRoomCode);

    if (!timers?.persist) {
      return;
    }

    clearTimeout(timers.persist);
    delete timers.persist;
    this.timers.set(normalizedRoomCode, timers);
  }

  private async cleanupStaleRooms(): Promise<void> {
    const before = new Set(rooms.keys());
    cleanupExpiredRooms();

    for (const roomCode of before) {
      if (rooms.has(roomCode)) {
        continue;
      }

      this.clearRoomTimers(roomCode);
      await this.persistRoom(roomCode);
    }

    await this.scheduleMaintenanceAlarm();
  }

  private async handleForfeits(): Promise<void> {
    for (const room of checkForForfeits()) {
      this.broadcastRoomState(room);
      await this.persistRoom(room.roomCode);
    }

    await this.scheduleMaintenanceAlarm();
  }

  private async handleTimeAttackExpirations(): Promise<void> {
    for (const result of checkExpiredTimeAttackMatches()) {
      this.broadcastToRoom(result.roomCode, {
        id: crypto.randomUUID(),
        type: "server:match:result",
        payload: result
      });
      const currentRoom = getRoom(result.roomCode);
      if (currentRoom) {
        this.broadcastRoomState(currentRoom);
      }
      this.clearRoomTimers(result.roomCode);
      await this.persistRoom(result.roomCode);
    }

    await this.scheduleMaintenanceAlarm();
  }

  private async handleStateRequest(request: Request, roomCode: string): Promise<Response> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (request.method === "GET") {
      const room = getRoom(normalizedRoomCode);

      if (!room) {
        return new Response("Not found", { status: 404 });
      }

      return Response.json({
        ok: true,
        room
      });
    }

    if (request.method !== "POST" && request.method !== "PUT") {
      return new Response("Method not allowed", { status: 405 });
    }

    const snapshot = await parsePersistedRoomSnapshot(request, normalizedRoomCode);

    if (!snapshot) {
      return new Response("Invalid room state", { status: 400 });
    }

    this.restorePersistedRoom(snapshot);
    this.syncRestoredRoom(snapshot.room.roomCode);
    this.broadcastRoomState(snapshot.room);
    await this.persistRoom(snapshot.room.roomCode);
    await this.scheduleMaintenanceAlarm();

    return Response.json({
      ok: true,
      roomCode: snapshot.room.roomCode,
      connectedSockets: this.roomSockets.get(snapshot.room.roomCode)?.size ?? 0
    });
  }

  private async runMaintenance(): Promise<void> {
    await this.cleanupStaleRooms();
    await this.handleForfeits();
    await this.handleTimeAttackExpirations();
  }

  private getNextMaintenanceAlarmAt(): number | null {
    let nextAlarmAt: number | null = null;

    for (const room of rooms.values()) {
      const deadline = getRoomMaintenanceDeadline(room);

      if (deadline === null) {
        continue;
      }

      if (nextAlarmAt === null || deadline < nextAlarmAt) {
        nextAlarmAt = deadline;
      }
    }

    return nextAlarmAt;
  }

  private recordPlayerSession(roomCode: string, playerId: string, sessionId: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const sessions = this.playerSessionsByRoom.get(normalizedRoomCode) ?? new Map<string, string>();
    sessions.set(playerId, sessionId);
    this.playerSessionsByRoom.set(normalizedRoomCode, sessions);
  }

  private validateExistingPlayerSession(roomCode: string, guestId: string, sessionId: string): string | null {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = rooms.get(normalizedRoomCode);

    if (!room) {
      return null;
    }

    const existingPlayer = room.players.get(guestId);

    if (!existingPlayer) {
      return null;
    }

    const storedSession = this.playerSessionsByRoom.get(normalizedRoomCode)?.get(guestId);

    if (!storedSession) {
      return "このプレイヤーの認証情報がありません。";
    }

    if (storedSession !== sessionId) {
      return "このプレイヤーは別のセッションで使用されています。";
    }

    return null;
  }
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function restoreRoomStateIfValid(room: RoomState, playerSessions: Record<string, string> = {}): void {
  if (typeof room.roomCode !== "string") {
    return;
  }

  const normalizedRoom = normalizeRoomCode(room.roomCode);
  if (!normalizedRoom) {
    return;
  }

  restoreRoomState({
    ...room,
    roomCode: normalizedRoom
  }, playerSessions);
}

async function parsePersistedRoomSnapshot(
  payloadOrRequest: unknown,
  expectedRoomCode: string
): Promise<PersistedRoomSnapshot | null> {
  if (payloadOrRequest instanceof Request) {
    let payload: unknown;

    try {
      payload = await payloadOrRequest.json();
    } catch {
      return null;
    }

    return parsePersistedRoomSnapshotValue(payload, expectedRoomCode);
  }

  return parsePersistedRoomSnapshotValue(payloadOrRequest, expectedRoomCode);
}

function parsePersistedRoomSnapshotValue(
  payload: unknown,
  expectedRoomCode: string
): PersistedRoomSnapshot | null {
  if (!isRecord(payload)) {
    return null;
  }

  const rawRoom = "room" in payload ? payload.room : payload;
  const room = parseRoomStateValue(rawRoom, expectedRoomCode);

  if (!room) {
    return null;
  }

  return {
    room,
    playerSessions: parseStringRecord("playerSessions" in payload ? payload.playerSessions : undefined),
    disconnectedAt: parseNumberRecord("disconnectedAt" in payload ? payload.disconnectedAt : undefined)
  };
}

function parseRoomStateValue(payload: unknown, expectedRoomCode: string): RoomState | null {
  if (!isRecord(payload) || typeof payload.roomCode !== "string") {
    return null;
  }

  const roomCode = normalizeRoomCode(payload.roomCode);

  if (roomCode !== expectedRoomCode) {
    return null;
  }

  return {
    ...(payload as RoomState),
    roomCode: expectedRoomCode
  };
}

function parseClientMessage(rawMessage: string): ParsedClientMessage | null {
  let message: unknown;

  try {
    message = JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(message)) {
    return null;
  }

  if (typeof message.id !== "string" || typeof message.type !== "string") {
    return null;
  }

  return {
    id: message.id,
    type: message.type,
    payload: message.payload
  };
}

function isCloudflareClientMessageType(type: string): type is CloudflareClientMessageType {
  return CLOUDFLARE_CLIENT_MESSAGE_TYPES.includes(type as CloudflareClientMessageType);
}

function parseCreateRoomPayload(payload: unknown): CreateRoomPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nickname = readString(payload.nickname);
  const guestId = readString(payload.guestId);
  const sessionId = readString(payload.sessionId);
  const deviceKind = readOptionalDeviceKind(payload.deviceKind);

  if (!nickname || !guestId || !sessionId) {
    return null;
  }

  return {
    nickname,
    guestId,
    sessionId,
    ...(deviceKind ? { deviceKind } : {})
  };
}

function parseJoinRoomPayload(payload: unknown): JoinRoomPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const basePayload = parseCreateRoomPayload(payload);
  const roomCode = readRoomCode(payload.roomCode);

  if (!basePayload || !roomCode) {
    return null;
  }

  return {
    ...basePayload,
    roomCode
  };
}

function parseRoomCodePayload(payload: unknown): RoomCodePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  if (!roomCode) {
    return null;
  }

  return { roomCode };
}

function parseReadyPayload(payload: unknown): ReadyPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const ready = readBoolean(payload.ready);

  if (!roomCode || ready === null) {
    return null;
  }

  return { roomCode, ready };
}

function parsePromptCategoryPayload(payload: unknown): PromptCategoryPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const category = readPromptCategory(payload.category);

  if (!roomCode || !category) {
    return null;
  }

  return { roomCode, category };
}

function parseBotDifficultyPayload(payload: unknown): BotDifficultyPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const difficulty = readBotDifficulty(payload.difficulty);

  if (!roomCode || !difficulty) {
    return null;
  }

  return { roomCode, difficulty };
}

function parseMatchRulePayload(payload: unknown): MatchRulePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const rule = readMatchRule(payload.rule);

  if (!roomCode || !rule) {
    return null;
  }

  return { roomCode, rule };
}

function parseTypingPayload(payload: unknown): TypingPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const progressIndex = readInteger(payload.progressIndex);
  const correctCharacters = readInteger(payload.correctCharacters);
  const totalTypedCharacters = readInteger(payload.totalTypedCharacters);
  const mistakes = readInteger(payload.mistakes);

  if (
    !roomCode ||
    progressIndex === null ||
    correctCharacters === null ||
    totalTypedCharacters === null ||
    mistakes === null ||
    correctCharacters > totalTypedCharacters ||
    mistakes > totalTypedCharacters ||
    progressIndex > totalTypedCharacters
  ) {
    return null;
  }

  return {
    roomCode,
    progressIndex,
    correctCharacters,
    totalTypedCharacters,
    mistakes
  };
}

function parsePracticePayload(payload: unknown): PracticePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nickname = readString(payload.nickname);
  const category = readPromptCategory(payload.category);

  if (!nickname || !category) {
    return null;
  }

  return {
    nickname,
    category
  };
}

function parseDailyPracticePayload(payload: unknown): DailyPracticePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nickname = readString(payload.nickname);

  if (!nickname) {
    return null;
  }

  return { nickname };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readRoomCode(value: unknown): string | null {
  const roomCode = readString(value);
  return roomCode ? normalizeRoomCode(roomCode) : null;
}

function readOptionalDeviceKind(value: unknown): DeviceKind | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === "mobile" || value === "desktop" ? value : undefined;
}

function readPromptCategory(value: unknown): PromptCategory | null {
  return value === "short" || value === "standard" || value === "long" ? value : null;
}

function readBotDifficulty(value: unknown): BotDifficulty | null {
  return value === "easy" || value === "normal" || value === "hard" ? value : null;
}

function readMatchRule(value: unknown): MatchRule | null {
  return value === "race" || value === "timeAttack" || value === "hpBattle" ? value : null;
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.length > 0) {
      result[key] = entry;
    }
  }

  return result;
}

function parseNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, number> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      result[key] = entry;
    }
  }

  return result;
}

function getRoomMaintenanceDeadline(room: InternalRoomRecord): number | null {
  const deadlines: number[] = [];

  if (room.status === "countdown" && room.serverStartAt !== undefined) {
    deadlines.push(room.serverStartAt);
  }

  if (room.status === "playing" && room.matchRule === "timeAttack" && room.matchEndsAt !== undefined) {
    deadlines.push(room.matchEndsAt);
  }

  if (room.status === "playing") {
    const disconnectedPlayers = [...room.players.values()].filter(
      (player) => !player.connected && player.disconnectedAt !== undefined
    );

    for (const player of disconnectedPlayers) {
      deadlines.push((player.disconnectedAt ?? Date.now()) + DISCONNECT_GRACE_MS);
    }
  }

  const isExpiredByTtl =
    room.status === "waiting" ||
    room.status === "finished" ||
    [...room.players.values()].every((player) => !player.connected);

  if (isExpiredByTtl) {
    deadlines.push(room.lastActivityAt + ROOM_TTL_MS);
  }

  if (deadlines.length === 0) {
    return null;
  }

  return Math.min(...deadlines);
}

function normalizeClientIp(clientIp: string | undefined): string {
  const trimmed = clientIp?.trim();
  return trimmed ? trimmed : "unknown";
}

function readClientIp(headers: Headers): string {
  const connectingIp = headers.get("cf-connecting-ip");

  if (connectingIp) {
    return connectingIp;
  }

  const forwardedFor = headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return "unknown";
}
