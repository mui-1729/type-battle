import type { AckResponse, RoomState, TypingFinish, TypingProgress } from "@type-battle/shared";
import {
  calculateAccuracy,
  calculateWpm,
  pickPrompt,
  PROMPTS,
  rankPlayers
} from "@type-battle/shared";
import { normalizeNickname, validateNickname } from "@type-battle/shared";
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
import { CLOUDFLARE_CLIENT_MESSAGE_TYPES } from "@type-battle/shared/cloudflare-events";
import type { RoomEngineHooks } from "@type-battle/shared/room-engine";
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

type PersistedRoomSnapshot = {
  room: RoomState;
  playerSessions?: Record<string, string>;
  disconnectedAt?: Record<string, number>;
};

type InternalPlayer = PlayerState & {
  socketId: string;
  sessionId: string;
  disconnectedAt?: number;
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
  result?: MatchResult;
  players: Map<string, InternalPlayer>;
  createdAt: number;
  lastActivityAt: number;
  round: number;
};

type GatewayTimers = {
  countdown?: ReturnType<typeof setTimeout> | undefined;
  bot?: ReturnType<typeof setInterval> | undefined;
  persist?: ReturnType<typeof setTimeout> | undefined;
};

const OPEN_STATE = 1;
const ROOM_STORAGE_KEY = "room";
const BOT_TICK_MS = 500;
const ROOM_TTL_MS = 60_000;
const DISCONNECT_GRACE_MS = 30_000;
const ROOM_PERSIST_DEBOUNCE_MS = 1_000;
const MAINTENANCE_ALARM_FALLBACK_MS = 5_000;
const INVALID_MESSAGE_ERROR = "リクエストの形式が正しくありません。";
const MAX_PLAYERS = 2;
const COUNTDOWN_MS = 3_000;
const HP_BATTLE_HP_PER_PROMPT_CHAR = 5;
const HP_BATTLE_MIN_HP = 50;
const HP_BATTLE_ATTACK_DAMAGE = 5;
const HP_BATTLE_MISTAKE_DAMAGE = 2;
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
  private readonly playerSessions = new Map<string, string>();
  private readonly timers: GatewayTimers = {};
  private readonly roomCreateIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  private readonly roomCreateGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
  private readonly roomJoinIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 100 });
  private readonly roomJoinGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  private readonly progressLimiter = new RateLimiter({ windowMs: 1000, max: 30 });
  private readonly hooks: RoomEngineHooks;
  private maintenanceFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  private roomCode: string | null = null;
  private room: InternalRoom | null = null;
  readonly ready: Promise<void>;

  constructor(private readonly state: DurableObjectState) {
    this.hooks = {};
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
      return this.handleWebSocketUpgrade(request);
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
    await this.runMaintenance();
    await this.scheduleMaintenanceAlarm();
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
    this.broadcastRoomState(snapshot.room);
    await this.persistRoom(snapshot.room.roomCode);
    await this.scheduleMaintenanceAlarm();

    return Response.json({
      ok: true,
      roomCode: snapshot.room.roomCode,
      connectedSockets: this.sockets.size
    });
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
      case "client:practice:dailyStart":
        this.sendError(socketId, "Practice mode is handled by the gateway.");
        return;
      default:
        return;
    }
  }

  private async handleSocketClose(socketId: string): Promise<void> {
    const roomCode = this.socketStates.get(socketId)?.roomCode ?? this.roomCode;
    this.detachSocket(socketId);

    const room = this.leaveBySocket(socketId);

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

    const room = this.setReady(socketId, parsedPayload.roomCode, parsedPayload.ready);

    if (!room) {
      return;
    }

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

    const result = this.setPromptCategory(socketId, parsedPayload.roomCode, parsedPayload.category);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setPromptCategory", { ok: false, error: result.error });
      return;
    }

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

    const result = this.setBotDifficulty(socketId, parsedPayload.roomCode, parsedPayload.difficulty);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setBotDifficulty", { ok: false, error: result.error });
      return;
    }

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

    const result = this.setMatchRule(socketId, parsedPayload.roomCode, parsedPayload.rule);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:room:setMatchRule", { ok: false, error: result.error });
      return;
    }

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
    void this.persistRoom(result.room.roomCode);
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

    this.broadcastToAll({
      id: crypto.randomUUID(),
      type: "server:match:result",
      payload: result
    });
    this.schedulePersistRoom(result.roomCode);
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

    this.broadcastToAll({
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

    const result = this.rematch(socketId, parsedPayload.roomCode);

    if ("error" in result) {
      this.sendAck(socketId, messageId, "client:match:rematch", { ok: false, error: result.error });
      return;
    }

    this.sendAck(socketId, messageId, "client:match:rematch", { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    void this.persistRoom(result.room.roomCode);
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
    for (const socketId of [...this.sockets.keys()]) {
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

  private setSocketRoom(socketId: string, playerId?: string): void {
    const socketState = this.socketStates.get(socketId) ?? { socketId, clientIp: "unknown" };

    if (playerId) {
      socketState.playerId = playerId;
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
  }

  private detachSocket(socketId: string): void {
    this.detachSocketFromRoom(socketId);
    this.sockets.delete(socketId);
    this.socketStates.delete(socketId);
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

  private createPersistedRoomSnapshot(room: InternalRoom): PersistedRoomSnapshot {
    const disconnectedAt: Record<string, number> = {};

    for (const [playerId, player] of room.players.entries()) {
      if (player.disconnectedAt !== undefined) {
        disconnectedAt[playerId] = player.disconnectedAt;
      }
    }

    return {
      room: toPublicRoom(room),
      playerSessions: Object.fromEntries(this.playerSessions.entries()),
      disconnectedAt
    };
  }

  private schedulePersistRoom(roomCode: string): void {
    void roomCode;

    if (this.timers.persist) {
      clearTimeout(this.timers.persist);
    }

    this.timers.persist = setTimeout(() => {
      void this.persistRoom(this.room?.roomCode ?? this.roomCode ?? "UNKNOWN");
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
    const room = createRoomStateFromSnapshot(snapshot.room, playerSessions, disconnectedAt);

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
    this.clearRoomTimers();

    const room = this.room;
    if (!room || normalizeRoomCode(room.roomCode) !== normalizeRoomCode(roomCode) || !room.serverStartAt) {
      return;
    }

    this.timers.countdown = setTimeout(() => {
      const playingRoom = this.markPlaying(roomCode);

      if (!playingRoom) {
        return;
      }

      this.broadcastToAll({
        id: crypto.randomUUID(),
        type: "server:match:started",
        payload: playingRoom
      });
      this.broadcastRoomState(playingRoom);
      void this.persistRoom(roomCode);
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
          this.clearRoomTimers();
        }

        return;
      }

      if (outcome.type === "result") {
        this.broadcastToAll({
          id: crypto.randomUUID(),
          type: "server:match:result",
          payload: outcome.result
        });
        const currentRoom = this.room;
        if (currentRoom) {
          this.broadcastRoomState(currentRoom);
        }
        void this.persistRoom(roomCode);
        this.clearRoomTimers();
        return;
      }

      this.broadcastRoomState(outcome.room);
      this.schedulePersistRoom(roomCode);
    }, BOT_TICK_MS);
  }

  private clearRoomTimers(): void {
    if (this.timers.countdown) {
      clearTimeout(this.timers.countdown);
    }

    if (this.timers.bot) {
      clearInterval(this.timers.bot);
    }

    if (this.timers.persist) {
      clearTimeout(this.timers.persist);
    }

    this.timers.countdown = undefined;
    this.timers.bot = undefined;
    this.timers.persist = undefined;
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

    if (
      (this.room.status === "waiting" && Date.now() - this.room.lastActivityAt > ROOM_TTL_MS) ||
      (this.room.status === "finished" && Date.now() - this.room.lastActivityAt > ROOM_TTL_MS) ||
      ([...this.room.players.values()].every((player) => !player.connected) && Date.now() - this.room.lastActivityAt > ROOM_TTL_MS)
    ) {
      this.room = null;
      this.clearRoomTimers();
      await this.persistRoom(this.roomCode ?? "UNKNOWN");
    }

    await this.scheduleMaintenanceAlarm();
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
        if (elapsed > DISCONNECT_GRACE_MS && !player.forfeited) {
          player.finishedAt = Date.now();
          player.finishTimeMs = Infinity;
          player.forfeited = true;
          changed = true;
        }
      }
    }

    if (changed) {
      if (this.areHumansFinished(this.room)) {
        this.finalizeUnfinishedBots(this.room);
        this.finalizeRoom(this.room);
      }

      this.broadcastRoomState(this.room);
      await this.persistRoom(this.room.roomCode);
    }

    await this.scheduleMaintenanceAlarm();
  }

  private async handleTimeAttackExpirations(): Promise<void> {
    if (!this.room || this.room.status !== "playing" || this.room.matchRule !== "timeAttack" || !this.room.matchEndsAt) {
      await this.scheduleMaintenanceAlarm();
      return;
    }

    if (Date.now() < this.room.matchEndsAt) {
      await this.scheduleMaintenanceAlarm();
      return;
    }

    this.finalizeUnfinishedBots(this.room);
    const result = this.finalizeRoom(this.room);
    this.broadcastToAll({
      id: crypto.randomUUID(),
      type: "server:match:result",
      payload: result
    });
    this.broadcastRoomState(this.room);
    this.clearRoomTimers();
    await this.persistRoom(this.room.roomCode);
    await this.scheduleMaintenanceAlarm();
  }

  private async runMaintenance(): Promise<void> {
    await this.cleanupStaleRoom();
    await this.handleForfeits();
    await this.handleTimeAttackExpirations();
  }

  private getNextMaintenanceAlarmAt(): number | null {
    if (!this.room) {
      return null;
    }

    const now = Date.now();
    let nextAlarmAt: number | null = null;

    if (this.room.status === "waiting" || this.room.status === "finished") {
      const deadline = this.room.lastActivityAt + ROOM_TTL_MS;
      nextAlarmAt = deadline > now ? deadline : now;
    }

    if (this.room.status === "playing") {
      for (const player of this.room.players.values()) {
        if (player.connected || !player.disconnectedAt) {
          continue;
        }

        const deadline = player.disconnectedAt + DISCONNECT_GRACE_MS;
        if (nextAlarmAt === null || deadline < nextAlarmAt) {
          nextAlarmAt = deadline;
        }
      }

      if (this.room.matchRule === "timeAttack" && this.room.matchEndsAt !== undefined) {
        const deadline = this.room.matchEndsAt;
        if (nextAlarmAt === null || deadline < nextAlarmAt) {
          nextAlarmAt = deadline;
        }
      }
    }

    return nextAlarmAt;
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
    void roomCode;
    this.playerSessions.set(playerId, sessionId);
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
      if (previousSocketId && previousSocketId !== input.socketId) {
        this.socketStates.delete(previousSocketId);
      }
      this.socketStates.set(input.socketId, {
        socketId: input.socketId,
        clientIp: this.socketStates.get(input.socketId)?.clientIp ?? "unknown",
        playerId: existing.id
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
      playerId: player.id
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
    if (!record || this.room.status !== "waiting") {
      return null;
    }

    const player = this.room.players.get(record.playerId ?? "");
    if (!player) {
      return null;
    }

    player.ready = ready;
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

    if (context.room.status !== "waiting") {
      return { error: "試合中は課題カテゴリを変更できません。" };
    }

    context.room.promptCategory = category;
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

    if (context.room.status !== "waiting") {
      return { error: "試合中は COM 難易度を変更できません。" };
    }

    context.room.botDifficulty = difficulty;
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

    if (context.room.players.size < MAX_PLAYERS) {
      addBotPlayer(context.room);
    }

    if (![...context.room.players.values()].every((player) => player.connected || player.isBot)) {
      return { error: "切断中のプレイヤーがいます。" };
    }

    context.room.status = "countdown";
    context.room.prompt = selectPromptForRoom(context.room, Date.now());
    if (!context.room.promptHistory.includes(context.room.prompt.id)) {
      context.room.promptHistory.push(context.room.prompt.id);
    }
    context.room.serverStartAt = Date.now() + COUNTDOWN_MS;
    if (context.room.matchRule === "timeAttack") {
      context.room.matchEndsAt = context.room.serverStartAt + 30_000;
    } else {
      delete context.room.matchEndsAt;
    }
    delete context.room.result;
    resetPlayers(context.room);
    context.room.lastActivityAt = Date.now();
    return { room: toPublicRoom(context.room) };
  }

  private markPlaying(roomCode: string): RoomState | null {
    if (!this.room || normalizeRoomCode(roomCode) !== normalizeRoomCode(this.room.roomCode) || this.room.status !== "countdown") {
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

    applyProgress(context.player, context.room, payload);
    context.room.lastActivityAt = Date.now();

    const result = maybeFinalizeRoom(context.room);
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

    applyProgress(context.player, context.room, payload);
    context.room.lastActivityAt = Date.now();

    const promptLength = getTypingLength(context.room, context.player);
    if (context.player.progressIndex >= promptLength) {
      const now = Date.now();
      context.player.finishedAt = now;
      context.player.finishTimeMs = now - (context.room.serverStartAt ?? now);
    }

    const result = maybeFinalizeRoom(context.room);
    if (result) {
      return result;
    }

    if (areHumansFinished(context.room)) {
      finalizeUnfinishedBots(context.room);
      return finalizeRoom(context.room);
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

    context.room.status = "waiting";
    context.room.round += 1;
    context.room.prompt = selectPromptForRoom(context.room, Date.now() + context.room.round);
    if (!context.room.promptHistory.includes(context.room.prompt.id)) {
      context.room.promptHistory.push(context.room.prompt.id);
    }
    delete context.room.serverStartAt;
    delete context.room.matchEndsAt;
    delete context.room.result;
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

    if (player) {
      player.connected = false;
      player.ready = false;
      player.disconnectedAt = Date.now();
    }

    room.lastActivityAt = Date.now();

    if (record.playerId === room.hostPlayerId) {
      const activePlayers = [...room.players.values()].filter((p) => p.connected || p.isBot);
      if (activePlayers.length === 0) {
        return toPublicRoom(room);
      }

      const nextHost = activePlayers.find((p) => !p.isBot) || activePlayers[0];
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

    if (room.status === "playing" || room.status === "countdown") {
      return this.leaveBySocket(socketId);
    }

    room.players.delete(record.playerId ?? "");
    room.lastActivityAt = Date.now();

    if (room.players.size === 0) {
      this.room = null;
      return null;
    }

    if (record.playerId === room.hostPlayerId) {
      const nextHost = [...room.players.values()].find((p) => !p.isBot) ?? [...room.players.values()][0];
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

    const bot = [...this.room.players.values()].find((player) => player.isBot);
    if (!bot || bot.progressIndex >= getTypingLength(this.room, bot)) {
      return null;
    }

    const settings = DIFFICULTY_SETTINGS[this.room.botDifficulty] ?? DIFFICULTY_SETTINGS.normal;
    const isMistake = Math.random() < settings.mistakeChance;
    const variance = Math.floor(Math.random() * 3) - 1;
    const speed = Math.max(1, settings.charsPerTick + variance);
    const charsToAdd = isMistake ? 0 : speed;

    applyProgress(bot, this.room, {
      roomCode: this.room.roomCode,
      progressIndex: bot.progressIndex + charsToAdd,
      correctCharacters: bot.correctCharacters + charsToAdd,
      totalTypedCharacters: bot.totalTypedCharacters + speed,
      mistakes: bot.mistakes + (isMistake ? speed : 0)
    });

    const promptLength = getTypingLength(this.room, bot);
    if (bot.progressIndex >= promptLength) {
      bot.finishedAt = Date.now();
      bot.finishTimeMs = bot.finishedAt - (this.room.serverStartAt ?? bot.finishedAt);
    }

    const result = maybeFinalizeRoom(this.room);
    if (result) {
      return { type: "result", result };
    }

    if ((this.room.matchRule === "race" && bot.progressIndex >= promptLength) || areHumansFinished(this.room)) {
      if (bot.progressIndex < promptLength) {
        finalizeUnfinishedBots(this.room);
      }
      return { type: "result", result: finalizeRoom(this.room) };
    }

    return { type: "progress", room: toPublicRoom(this.room) };
  }

  private areHumansFinished(room: InternalRoom): boolean {
    return areHumansFinished(room);
  }

  private finalizeUnfinishedBots(room: InternalRoom): void {
    finalizeUnfinishedBots(room);
  }

  private finalizeRoom(room: InternalRoom): MatchResult {
    return finalizeRoom(room);
  }
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function parseClientMessage(rawMessage: string): ParsedClientMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.type !== "string") {
    return null;
  }

  return {
    id: parsed.id,
    type: parsed.type,
    payload: parsed.payload
  };
}

function isCloudflareClientMessageType(type: string): type is CloudflareClientMessageType {
  return (CLOUDFLARE_CLIENT_MESSAGE_TYPES as readonly string[]).includes(type);
}

function parseCreateRoomPayload(payload: unknown): CreateRoomPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nickname = readString(payload.nickname);
  const guestId = readString(payload.guestId);
  const sessionId = readString(payload.sessionId);
  const deviceKind = parseDeviceKind(payload.deviceKind);

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
  const base = parseCreateRoomPayload(payload);
  if (!base || !isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  if (!roomCode) {
    return null;
  }

  return {
    ...base,
    roomCode
  };
}

function parseRoomCodePayload(payload: unknown): RoomCodePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  return roomCode ? { roomCode } : null;
}

function parseReadyPayload(payload: unknown): ReadyPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const ready = typeof payload.ready === "boolean" ? payload.ready : null;
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
  const category = parsePromptCategory(payload.category);
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
  const difficulty = parseBotDifficulty(payload.difficulty);
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
  const rule = parseMatchRule(payload.rule);
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
  if (
    !roomCode ||
    typeof payload.progressIndex !== "number" ||
    typeof payload.correctCharacters !== "number" ||
    typeof payload.totalTypedCharacters !== "number" ||
    typeof payload.mistakes !== "number"
  ) {
    return null;
  }

  return {
    roomCode,
    progressIndex: payload.progressIndex,
    correctCharacters: payload.correctCharacters,
    totalTypedCharacters: payload.totalTypedCharacters,
    mistakes: payload.mistakes
  };
}

function readRoomCode(value: unknown): string | null {
  const roomCode = readString(value);
  return roomCode ? normalizeRoomCode(roomCode) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseDeviceKind(value: unknown): DeviceKind | null {
  return value === "mobile" || value === "desktop" ? value : null;
}

function parsePromptCategory(value: unknown): PromptCategory | null {
  return value === "short" || value === "standard" || value === "long" ? value : null;
}

function parseBotDifficulty(value: unknown): BotDifficulty | null {
  return value === "easy" || value === "normal" || value === "hard" ? value : null;
}

function parseMatchRule(value: unknown): MatchRule | null {
  return value === "race" || value === "timeAttack" || value === "hpBattle" ? value : null;
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
    wpm: 0,
    accuracy: 100
  };
}

function addBotPlayer(room: InternalRoom): void {
  if (room.players.has(BOT_PLAYER_ID)) {
    return;
  }

  const difficultyLabel = room.botDifficulty.charAt(0).toUpperCase() + room.botDifficulty.slice(1);
  const nickname = `${BOT_NICKNAME} (${difficultyLabel})`;

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
    wpm: 0,
    accuracy: 100
  });
}

function selectPromptForRoom(room: InternalRoom, seed: number): Prompt {
  const prompts = PROMPTS.filter((prompt) => prompt.category === room.promptCategory);
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

function resetPlayers(room: InternalRoom): void {
  const promptLength = room.prompt?.text.length ?? 0;
  const maxHp = room.matchRule === "hpBattle" ? Math.max(HP_BATTLE_MIN_HP, promptLength * HP_BATTLE_HP_PER_PROMPT_CHAR) : undefined;

  for (const player of room.players.values()) {
    player.ready = false;
    player.progressIndex = 0;
    player.correctCharacters = 0;
    player.totalTypedCharacters = 0;
    player.mistakes = 0;
    player.maxStreak = 0;
    player.currentStreak = 0;
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
    delete player.disconnectedAt;
    delete player.finishedAt;
    delete player.finishTimeMs;
  }
}

function getTypingLength(room: InternalRoom, player: InternalPlayer): number {
  const prompt = room.prompt ?? pickPrompt(room.promptCategory, Date.now() + room.round);
  return (player.deviceKind === "mobile" ? prompt.typing.hiragana : prompt.typing.romaji).length;
}

function applyProgress(player: InternalPlayer, room: InternalRoom, payload: TypingProgress): void {
  const promptLength = getTypingLength(room, player);
  const previousProgressIndex = player.progressIndex;
  const previousCorrectCharacters = player.correctCharacters;
  const previousMistakes = player.mistakes;
  const nextIndex = clamp(payload.progressIndex, player.progressIndex, promptLength);

  const totalTypedCharacters = Math.max(payload.totalTypedCharacters, player.totalTypedCharacters);
  const correctCharacters = Math.max(payload.correctCharacters, player.correctCharacters);
  const mistakes = Math.max(payload.mistakes, player.mistakes);
  const now = Date.now();
  const startedAt = room.serverStartAt ?? now;

  const isCorrect = correctCharacters > player.correctCharacters;
  if (isCorrect) {
    player.currentStreak += 1;
    player.maxStreak = Math.max(player.maxStreak, player.currentStreak);
  } else {
    player.currentStreak = 0;
  }

  player.progressIndex = nextIndex;
  player.correctCharacters = correctCharacters;
  player.totalTypedCharacters = totalTypedCharacters;
  player.mistakes = mistakes;
  player.wpm = calculateWpm(correctCharacters, now - startedAt);
  player.accuracy = calculateAccuracy(correctCharacters, totalTypedCharacters);

  if (room.matchRule !== "hpBattle") {
    if (player.progressIndex >= promptLength && previousProgressIndex < promptLength) {
      player.finishedAt = now;
      player.finishTimeMs = now - startedAt;
    }
    return;
  }

  const correctDelta = Math.max(correctCharacters - previousCorrectCharacters, 0);
  const mistakeDelta = Math.max(mistakes - previousMistakes, 0);

  if (correctDelta > 0) {
    for (const opponent of room.players.values()) {
      if (
        opponent.id === player.id ||
        opponent.hp === undefined ||
        opponent.progressIndex >= getTypingLength(room, opponent) ||
        opponent.hp <= 0
      ) {
        continue;
      }

      applyHpDamage(opponent, correctDelta * HP_BATTLE_ATTACK_DAMAGE, room, now);
    }
  }

  if (mistakeDelta > 0) {
    applyHpDamage(player, mistakeDelta * HP_BATTLE_MISTAKE_DAMAGE, room, now);
  }

  if (player.progressIndex >= promptLength && previousProgressIndex < promptLength) {
    player.finishedAt = now;
    player.finishTimeMs = now - startedAt;
  }
}

function areHumansFinished(room: InternalRoom): boolean {
  return [...room.players.values()]
    .filter((p) => !p.isBot)
    .every((p) => {
      if (p.forfeited) {
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
      bot.finishTimeMs = Infinity;
    }
  }
}

function ensureConnectedHost(room: InternalRoom): void {
  const currentHost = room.players.get(room.hostPlayerId);

  if (currentHost?.connected || currentHost?.isBot) {
    return;
  }

  const nextHost = [...room.players.values()].find((player) => player.connected && !player.isBot)
    ?? [...room.players.values()].find((player) => player.connected || player.isBot);

  if (nextHost) {
    room.hostPlayerId = nextHost.id;
  }
}

function maybeFinalizeRoom(room: InternalRoom): MatchResult | null {
  if (room.matchRule === "hpBattle") {
    const hasElimination = [...room.players.values()].some((player) => (player.hp ?? 1) <= 0);

    if (hasElimination) {
      return finalizeRoom(room);
    }
  }

  if (areHumansFinished(room)) {
    finalizeUnfinishedBots(room);
    return finalizeRoom(room);
  }

  return null;
}

function syncMatchRuleState(room: InternalRoom): void {
  delete room.matchEndsAt;
}

function applyHpDamage(player: InternalPlayer, damage: number, room: InternalRoom, now: number): void {
  if (damage <= 0 || player.hp === undefined || player.hp <= 0) {
    return;
  }

  const nextHp = Math.max(0, player.hp - damage);
  if (nextHp === player.hp) {
    return;
  }

  player.hp = nextHp;

  if (nextHp === 0) {
    player.finishedAt = now;
    player.finishTimeMs = now - (room.serverStartAt ?? now);
  }
}

function finalizeRoom(room: InternalRoom): MatchResult {
  room.status = "finished";
  const result = toMatchResult(room);
  room.result = result;

  return result;
}

function toMatchResult(room: InternalRoom): MatchResult {
  const prompt = room.prompt ?? pickPrompt();
  return {
    roomCode: room.roomCode,
    prompt,
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
    maxPlayers: MAX_PLAYERS
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

  if (player.maxHp !== undefined) {
    publicPlayer.maxHp = player.maxHp;
  }

  if (player.finishedAt !== undefined) {
    publicPlayer.finishedAt = player.finishedAt;
  }

  if (player.finishTimeMs !== undefined) {
    publicPlayer.finishTimeMs = player.finishTimeMs;
  }

  return publicPlayer;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function isValidTypingProgressPayload(payload: TypingProgress): boolean {
  return (
    Number.isInteger(payload.progressIndex) &&
    payload.progressIndex >= 0 &&
    Number.isInteger(payload.correctCharacters) &&
    payload.correctCharacters >= 0 &&
    Number.isInteger(payload.totalTypedCharacters) &&
    payload.totalTypedCharacters >= 0 &&
    Number.isInteger(payload.mistakes) &&
    payload.mistakes >= 0 &&
    payload.correctCharacters <= payload.totalTypedCharacters &&
    payload.mistakes <= payload.totalTypedCharacters &&
    payload.progressIndex <= payload.totalTypedCharacters
  );
}

function createRoomStateFromSnapshot(
  room: RoomState,
  playerSessions: Record<string, string> = {},
  disconnectedAt: Record<string, number> = {}
): InternalRoom {
  const normalizedRoomCode = normalizeRoomCode(room.roomCode);
  const internalRoom: InternalRoom = {
    roomCode: normalizedRoomCode,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    matchRule: room.matchRule,
    botDifficulty: room.botDifficulty,
    promptCategory: room.promptCategory,
    promptHistory: room.prompt ? [room.prompt.id] : [],
    players: new Map(
      room.players.map((player) => [
        player.id,
        {
          ...player,
          socketId: player.id,
          sessionId: playerSessions[player.id] ?? player.id,
          isHost: player.id === room.hostPlayerId,
          connected: false,
          ready: false,
          ...(disconnectedAt[player.id] !== undefined ? { disconnectedAt: disconnectedAt[player.id] } : {})
        } as InternalPlayer
      ])
    ),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    round: 1,
    ...(room.prompt ? { prompt: room.prompt } : {}),
    ...(room.serverStartAt !== undefined ? { serverStartAt: room.serverStartAt } : {}),
    ...(room.matchEndsAt !== undefined ? { matchEndsAt: room.matchEndsAt } : {}),
    ...(room.result ? { result: room.result } : {})
  };

  return internalRoom;
}

function parsePersistedRoomSnapshotFromValue(value: unknown): PersistedRoomSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const snapshot = value as PersistedRoomSnapshot;
  if (!snapshot.room || typeof snapshot.room.roomCode !== "string") {
    return null;
  }

  return snapshot;
}

function readClientIp(headers: Headers): string {
  const forwardedFor = headers.get("CF-Connecting-IP") ?? headers.get("X-Forwarded-For");
  if (!forwardedFor) {
    return "unknown";
  }

  return forwardedFor.split(",")[0]?.trim() || "unknown";
}
