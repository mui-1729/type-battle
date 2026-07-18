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
        void this.persistGuestSessionRecord(input);
      },
      recordMatchResult: (input) => {
        void this.persistMatchResultRecord(input);
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
      void this.handleSocketMessage(socketId, event.data);
    });

    socket.addEventListener("close", () => {
      void this.handleSocketClose(socketId);
    });

    this.scheduleUnjoinedSocketTimeout(socketId);

    return socketId;
  }

  private async handleSocketMessage(socketId: string, rawMessage: unknown): Promise<void> {
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
      this.sendAck(socketId, messageI�n=��$z{-���jםtatus === "eliminated" || (p.hp ?? 0) <= 0);
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
  internal: PersistedRoomSnapshot["internal"] = {}
): InternalRoom {
  const normalizedRoomCode = normalizeRoomCode(room.roomCode);
  const typingState = internal?.typingState ?? {};
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
          connected: false,
          ready: false,
          typingProgressIndex: typingState[player.id]?.typingProgressIndex ?? 0,
          pendingInput: typingState[player.id]?.pendingInput ?? "",
          lastInputSequence: typingState[player.id]?.lastInputSequence ?? 0,
          ...(disconnectedAt[player.id] !== undefined ? { disconnectedAt: disconnectedAt[player.id] } : {})
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
