import { getPromptsByCategory, pickPrompt } from "./prompts.js";
import { rankPlayers } from "./scoring.js";
import { createRoomCode, normalizeNickname } from "./validation.js";
import {
  applyBotProgress,
  applyProgress,
  isValidTypingProgressPayload,
  resetPlayerInputSession,
  resetPlayers
} from "./room-engine-progress.js";
export { startDailyPractice, startPractice } from "./practice.js";
import type {
  BotDifficulty,
  DeviceKind,
  MatchRule,
  MatchResult,
  MatchStatus,
  PlayerState,
  Prompt,
  PromptCategory,
  RoomState,
  TypingFinish,
  TypingProgress
} from "./game-state.js";

const MAX_PLAYERS = 2;
const COUNTDOWN_MS = 3_000;
const HP_BATTLE_DURATION_MS = 90_000;
const BOT_PLAYER_ID = "bot_com_1";
const BOT_NICKNAME = "COM";
export const BOT_TICK_MS = 500;

type RoomEngineLogger = {
  info?: (payload: unknown) => void;
  warn?: (payload: unknown) => void;
};

type GuestSessionRecord = {
  sessionId: string;
  guestId: string;
  nickname: string;
  roomCode: string;
};

type MatchResultRecord = {
  roomCode: string;
  round: number;
  prompt: Prompt;
  promptCategory: PromptCategory;
  botDifficulty: BotDifficulty;
  playerCount: number;
  hasBot: boolean;
  result: MatchResult;
};

export type RoomEngineHooks = {
  logger?: RoomEngineLogger;
  recordGuestSession?: (input: GuestSessionRecord) => void | Promise<void>;
  recordMatchResult?: (input: MatchResultRecord) => void | Promise<void>;
};

export type RoomEngineConfig = {
  timeAttackMs?: number;
};

const DEFAULT_TIME_ATTACK_MS = 60_000;

let engineHooks: RoomEngineHooks = {};
let engineConfig = {
  timeAttackMs: DEFAULT_TIME_ATTACK_MS
};

export function setRoomEngineHooks(hooks: RoomEngineHooks): void {
  engineHooks = hooks;
}

export function setRoomEngineConfig(config: RoomEngineConfig): void {
  engineConfig = {
    ...engineConfig,
    ...config
  };
}

function runRoomEngineHook(callback: () => void | Promise<void>, scope: string): void {
  try {
    void Promise.resolve(callback()).catch((error: unknown) => {
      engineHooks.logger?.warn?.({
        event: "room_engine_hook_error",
        scope,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  } catch (error) {
    engineHooks.logger?.warn?.({
      event: "room_engine_hook_error",
      scope,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

const DIFFICULTY_SETTINGS: Record<BotDifficulty, { charsPerTick: number; mistakeChance: number }> = {
  easy: { charsPerTick: 1, mistakeChance: 0.05 },
  normal: { charsPerTick: 2, mistakeChance: 0.02 },
  hard: { charsPerTick: 3, mistakeChance: 0.01 }
};

export type InternalPlayer = PlayerState & {
  socketId: string;
  sessionId: string;
  disconnectedAt?: number;
  typingProgressIndex: number;
  pendingInput: string;
  lastInputSequence: number;
};

export type BotTickOutcome =
  | {
      type: "progress";
      room: RoomState;
    }
  | {
      type: "result";
      result: MatchResult;
    };

export type InternalRoom = {
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
  round: number;
};

export const rooms = new Map<string, InternalRoom>();
const socketIndex = new Map<string, { roomCode: string; playerId: string }>();

export const metrics = {
  matchesStarted: 0,
  matchesFinished: 0,
  disconnectCount: 0,
  serverErrors: 0
};

export function getMetrics() {
  return {
    ...metrics,
    activeRooms: rooms.size,
    activePlayers: socketIndex.size
  };
}

export function resetRoomEngineState(): void {
  rooms.clear();
  socketIndex.clear();
  metrics.matchesStarted = 0;
  metrics.matchesFinished = 0;
  metrics.disconnectCount = 0;
  metrics.serverErrors = 0;
}

export function restoreRoomState(room: RoomState, playerSessions: Record<string, string> = {}): void {
  const roomCode = room.roomCode.toUpperCase();

  rooms.set(roomCode, {
    roomCode,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    matchRule: room.matchRule,
    botDifficulty: room.botDifficulty,
    promptCategory: room.promptCategory,
    promptHistory: room.prompt ? [room.prompt.id] : [],
    players: new Map(
      room.players.map((player) => [
        player.id,
        toInternalPlayer(player, room.hostPlayerId, playerSessions[player.id] ?? player.id)
      ])
    ),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    round: 1,
    ...(room.prompt ? { prompt: room.prompt } : {}),
    ...(room.serverStartAt !== undefined ? { serverStartAt: room.serverStartAt } : {}),
    ...(room.matchEndsAt !== undefined ? { matchEndsAt: room.matchEndsAt } : {}),
    ...(room.suddenDeath ? { suddenDeath: true } : {}),
    ...(room.result ? { result: room.result } : {})
  });
}

export function createRoom(input: {
  nickname: string;
  guestId: string;
  socketId: string;
  sessionId?: string;
  deviceKind?: DeviceKind;
}): {
  room: RoomState;
  playerId: string;
} {
  const roomCode = createUniqueRoomCode();
  const player = createPlayer(
    input.guestId,
    input.nickname,
    input.socketId,
    true,
    input.sessionId ?? input.guestId,
    input.deviceKind
  );
  const room: InternalRoom = {
    roomCode,
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

  rooms.set(roomCode, room);
  socketIndex.set(input.socketId, { roomCode, playerId: player.id });
  runRoomEngineHook(
    () => engineHooks.recordGuestSession?.({
      sessionId: input.sessionId ?? input.guestId,
      guestId: input.guestId,
      nickname: player.nickname,
      roomCode
    }),
    "guest_session"
  );

  return { room: toPublicRoom(room), playerId: player.id };
}

export function joinRoom(input: {
  roomCode: string;
  nickname: string;
  guestId: string;
  socketId: string;
  sessionId?: string;
  deviceKind?: DeviceKind;
}): { room: RoomState; playerId: string } | { error: string } {
  const room = rooms.get(input.roomCode.toUpperCase());

  if (!room) {
    return { error: "ルームが見つかりません。" };
  }

  room.lastActivityAt = Date.now();
  const existing = room.players.get(input.guestId);

  if (existing) {
    if (existing.sessionId !== (input.sessionId ?? input.guestId)) {
      return { error: "このプレイヤーは別のセッションで使用されています。" };
    }

    const previousSocketId = existing.socketId;
    if (previousSocketId && previousSocketId !== input.socketId) {
      socketIndex.delete(previousSocketId);
    }

    existing.socketId = input.socketId;
    existing.connected = true;
    delete existing.disconnectedAt;
    existing.nickname = normalizeNickname(input.nickname);
    existing.deviceKind = input.deviceKind ?? existing.deviceKind ?? "desktop";
    resetPlayerInputSession(existing, room);
    socketIndex.set(input.socketId, { roomCode: room.roomCode, playerId: existing.id });
    ensureConnectedHost(room);
    runRoomEngineHook(
      () => engineHooks.recordGuestSession?.({
        sessionId: input.sessionId ?? input.guestId,
        guestId: input.guestId,
        nickname: existing.nickname,
        roomCode: room.roomCode
      }),
      "guest_session"
    );
    return { room: toPublicRoom(room), playerId: existing.id };
  }

  if (room.status !== "waiting") {
    return { error: "試合中のルームには参加できません。" };
  }

  if (room.players.size >= MAX_PLAYERS) {
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
  room.players.set(player.id, player);
  socketIndex.set(input.socketId, { roomCode: room.roomCode, playerId: player.id });
  ensureConnectedHost(room);
  runRoomEngineHook(
    () => engineHooks.recordGuestSession?.({
      sessionId: input.sessionId ?? input.guestId,
      guestId: input.guestId,
      nickname: player.nickname,
      roomCode: room.roomCode
    }),
    "guest_session"
  );

  return { room: toPublicRoom(room), playerId: player.id };
}

export function setPromptCategory(
  socketId: string,
  roomCode: string,
  category: PromptCategory
): { room: RoomState } | { error: string } {
  const context = getContext(socketId, roomCode);

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
  return { room: toPublicRoom(context.room) };
}

export function setBotDifficulty(
  socketId: string,
  roomCode: string,
  difficulty: BotDifficulty
): { room: RoomState } | { error: string } {
  const context = getContext(socketId, roomCode);

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
  clearRoomReadyStates(context.room);
  return { room: toPublicRoom(context.room) };
}

export function setMatchRule(
  socketId: string,
  roomCode: string,
  rule: MatchRule
): { room: RoomState } | { error: string } {
  const context = getContext(socketId, roomCode);

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
  return { room: toPublicRoom(context.room) };
}

function clearRoomReadyStates(room: InternalRoom): void {
  for (const player of room.players.values()) {
    player.ready = false;
  }
}

export function leaveBySocket(socketId: string): RoomState | null {
  const record = socketIndex.get(socketId);

  if (!record) {
    return null;
  }

  socketIndex.delete(socketId);
  const room = rooms.get(record.roomCode);

  if (!room) {
    return null;
  }

  const player = room.players.get(record.playerId);

  if (player) {
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = Date.now();
    metrics.disconnectCount += 1;
  }

  if (room.status === "countdown") {
    abortCountdown(room);
  }

  room.lastActivityAt = Date.now();

  // Handle host leave
  if (record.playerId === room.hostPlayerId) {
    const activePlayers = [...room.players.values()].filter((p) => p.connected || p.isBot);
    if (activePlayers.length === 0) {
      return toPublicRoom(room);
    }

    // Transfer host to the first active human player, or remain if no humans
    const nextHost = activePlayers.find(p => !p.isBot) || activePlayers[0];
    if (nextHost) {
      room.hostPlayerId = nextHost.id;
    }
  }

  return toPublicRoom(room);
}

export function explicitLeaveBySocket(socketId: string): RoomState | null {
  const record = socketIndex.get(socketId);

  if (!record) {
    return null;
  }

  const room = rooms.get(record.roomCode);

  if (!room) {
    socketIndex.delete(socketId);
    return null;
  }

  if (room.status === "playing" || room.status === "countdown") {
    return leaveBySocket(socketId);
  }

  socketIndex.delete(socketId);
  room.players.delete(record.playerId);
  room.lastActivityAt = Date.now();

  if (room.players.size === 0) {
    rooms.delete(room.roomCode);
    return null;
  }

  if (record.playerId === room.hostPlayerId) {
    const nextHost = [...room.players.values()].find((player) => !player.isBot) ?? [...room.players.values()][0];
    if (nextHost) {
      room.hostPlayerId = nextHost.id;
    }
  }

  return toPublicRoom(room);
}

export function setReady(socketId: string, roomCode: string, ready: boolean): RoomState | null {
  const record = socketIndex.get(socketId);
  const room = rooms.get(roomCode.toUpperCase());

  if (!record || !room || record.roomCode !== room.roomCode || (room.status !== "waiting" && room.status !== "finished")) {
    return null;
  }

  const player = room.players.get(record.playerId);

  if (!player) {
    return null;
  }

  player.ready = ready;

  if (room.status === "finished") {
    const humans = [...room.players.values()].filter((candidate) => !candidate.isBot);
    if (humans.length > 0 && humans.every((candidate) => candidate.ready && candidate.connected)) {
      const nextRound = room.round + 1;
      let prompt: Prompt;
      try {
        prompt = selectPromptForRoom(room, Date.now() + nextRound);
      } catch {
        return toPublicRoom(room);
      }

      if (room.players.size < MAX_PLAYERS) {
        addBotPlayer(room);
      }
      room.status = "countdown";
      room.round = nextRound;
      room.prompt = prompt;
      if (!room.promptHistory.includes(prompt.id)) {
        room.promptHistory.push(prompt.id);
      }
      room.serverStartAt = Date.now() + COUNTDOWN_MS;
      if (room.matchRule === "timeAttack") {
        room.matchEndsAt = room.serverStartAt + engineConfig.timeAttackMs;
      } else if (room.matchRule === "hpBattle") {
        room.matchEndsAt = room.serverStartAt + HP_BATTLE_DURATION_MS;
      } else {
        delete room.matchEndsAt;
      }
      room.suddenDeath = false;
      delete room.result;
      resetPlayers(room);
    }
  }

  return toPublicRoom(room);
}

export function startMatch(socketId: string, roomCode: string): { room: RoomState } | { error: string } {
  const record = socketIndex.get(socketId);
  const room = rooms.get(roomCode.toUpperCase());

  if (!record || !room || record.roomCode !== room.roomCode) {
    return { error: "ルームに参加していません。" };
  }

  if (record.playerId !== room.hostPlayerId) {
    return { error: "ホストだけが開始できます。" };
  }

  if (room.status !== "waiting") {
    return { error: "この試合はすでに開始しています。" };
  }

  const players = [...room.players.values()];

  const humanPlayers = players.filter((player) => !player.isBot);

  if (humanPlayers.some((player) => !player.connected || !player.ready)) {
    return { error: "参加者全員のREADYが必要です。" };
  }

  if (players.length < MAX_PLAYERS) {
    addBotPlayer(room);
  }

  if (![...room.players.values()].every((player) => player.connected || player.isBot)) {
    return { error: "切断中のプレイヤーがいます。" };
  }

  let prompt: Prompt;

  try {
    prompt = selectPromptForRoom(room, Date.now());
  } catch {
    return { error: "有効な課題文がありません。" };
  }

  room.status = "countdown";
  room.prompt = prompt;
  if (!room.promptHistory.includes(prompt.id)) {
    room.promptHistory.push(prompt.id);
  }
  room.serverStartAt = Date.now() + COUNTDOWN_MS;
  if (room.matchRule === "timeAttack") {
    room.matchEndsAt = room.serverStartAt + engineConfig.timeAttackMs;
  } else if (room.matchRule === "hpBattle") {
    room.matchEndsAt = room.serverStartAt + HP_BATTLE_DURATION_MS;
  } else {
    delete room.matchEndsAt;
  }
  room.suddenDeath = false;
  delete room.result;
  resetPlayers(room);
  metrics.matchesStarted += 1;

  return { room: toPublicRoom(room) };
}

export function markPlaying(roomCode: string): RoomState | null {
  const room = rooms.get(roomCode.toUpperCase());

  if (!room || room.status !== "countdown") {
    return null;
  }

  const humans = [...room.players.values()].filter((player) => !player.isBot);
  if (humans.length === 0 || humans.some((player) => !player.connected)) {
    abortCountdown(room);
    return null;
  }

  room.status = "playing";
  return toPublicRoom(room);
}

function areHumansFinished(room: InternalRoom): boolean {
  if (room.matchRule === "timeAttack") {
    return false;
  }

  if (room.matchRule === "hpBattle") {
    return [...room.players.values()]
      .filter((p) => !p.isBot)
      .every((p) => p.forfeited || (p.hp ?? 0) <= 0);
  }

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

export function advanceBot(roomCode: string): BotTickOutcome | null {
  const room = rooms.get(roomCode.toUpperCase());

  if (!room || room.status !== "playing" || !room.prompt) {
    return null;
  }

  if (isTimeAttackExpired(room, Date.now())) {
    return { type: "result", result: finalizeRoom(room) };
  }

  const bot = [...room.players.values()].find((player) => player.isBot);

  if (!bot || (room.matchRule !== "timeAttack" && room.matchRule !== "hpBattle" && bot.progressIndex >= getTypingLength(room, bot))) {
    return null;
  }

  const settings = DIFFICULTY_SETTINGS[room.botDifficulty] ?? DIFFICULTY_SETTINGS.normal;
  const isMistake = Math.random() < settings.mistakeChance;

  // Add random speed variation: -1, 0, or +1 (ensuring minimum speed of 1)
  const variance = Math.floor(Math.random() * 3) - 1;
  const speed = Math.max(1, settings.charsPerTick + variance);
  const charsToAdd = isMistake ? 0 : speed;

  applyBotProgress(bot, room, charsToAdd, speed, isMistake);

  const promptLength = getTypingLength(room, bot);

  if (room.matchRule !== "timeAttack" && bot.progressIndex >= promptLength) {
    bot.finishedAt = Date.now();
    bot.finishTimeMs = bot.finishedAt - (room.serverStartAt ?? bot.finishedAt);
    bot.finishStatus = "finished";
  }

  const result = maybeFinalizeRoom(room);

  if (result) {
    return { type: "result", result };
  }

  if ((room.matchRule === "race" && bot.progressIndex >= promptLength) || areHumansFinished(room)) {
    if (bot.progressIndex < promptLength) {
      finalizeUnfinishedBots(room);
    }
    return { type: "result", result: finalizeRoom(room) };
  }

  return { type: "progress", room: toPublicRoom(room) };
}

export function updateProgress(socketId: string, payload: TypingProgress): RoomState | MatchResult | null {
  if (!isValidTypingProgressPayload(payload)) {
    return null;
  }

  const context = getContext(socketId, payload.roomCode);

  if (!context || context.room.status !== "playing" || !context.room.prompt) {
    return null;
  }

  if (isTimeAttackExpired(context.room, Date.now())) {
    return finalizeRoom(context.room);
  }

  if (!applyProgress(context.player, context.room, payload)) {
    return null;
  }

  const result = maybeFinalizeRoom(context.room);
  if (result) {
    return result;
  }

  return toPublicRoom(context.room);
}

export function finishTyping(socketId: string, payload: TypingFinish): MatchResult | RoomState | null {
  if (!isValidTypingProgressPayload(payload)) {
    return null;
  }

  const context = getContext(socketId, payload.roomCode);

  if (!context || context.room.status !== "playing" || !context.room.prompt) {
    return null;
  }

  if (isTimeAttackExpired(context.room, Date.now())) {
    return finalizeRoom(context.room);
  }

  if (!applyProgress(context.player, context.room, payload)) {
    return null;
  }

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

export function rematch(socketId: string, roomCode: string): { room: RoomState } | { error: string } {
  const record = socketIndex.get(socketId);
  const room = rooms.get(roomCode.toUpperCase());

  if (!record || !room || record.roomCode !== room.roomCode) {
    return { error: "ルームに参加していません。" };
  }

  if (record.playerId !== room.hostPlayerId) {
    return { error: "ホストだけが再戦できます。" };
  }

  if (room.status !== "finished") {
    return { error: "終了した試合だけ再戦できます。" };
  }

  const nextRound = room.round + 1;
  let prompt: Prompt;

  try {
    prompt = selectPromptForRoom(room, Date.now() + nextRound);
  } catch {
    return { error: "有効な課題文がありません。" };
  }

  if ([...room.players.values()].some((player) => !player.isBot && !player.connected)) {
    return { error: "切断中のプレイヤーがいるため再戦できません。" };
  }

  if (room.players.size < MAX_PLAYERS) {
    addBotPlayer(room);
  }

  room.status = "countdown";
  room.round = nextRound;
  room.prompt = prompt;
  if (!room.promptHistory.includes(prompt.id)) {
    room.promptHistory.push(prompt.id);
  }
  room.serverStartAt = Date.now() + COUNTDOWN_MS;
  if (room.matchRule === "timeAttack") {
    room.matchEndsAt = room.serverStartAt + engineConfig.timeAttackMs;
  } else if (room.matchRule === "hpBattle") {
    room.matchEndsAt = room.serverStartAt + HP_BATTLE_DURATION_MS;
  } else {
    delete room.matchEndsAt;
  }
  room.suddenDeath = false;
  delete room.result;
  resetPlayers(room);

  return { room: toPublicRoom(room) };
}

export function getRoom(roomCode: string): RoomState | null {
  const room = rooms.get(roomCode.toUpperCase());
  return room ? toPublicRoom(room) : null;
}

function getContext(
  socketId: string,
  roomCode: string
): { room: InternalRoom; player: InternalPlayer } | null {
  const record = socketIndex.get(socketId);
  const room = rooms.get(roomCode.toUpperCase());

  if (!record || !room || record.roomCode !== room.roomCode) {
    return null;
  }

  const player = room.players.get(record.playerId);

  if (!player) {
    return null;
  }

  return { room, player };
}

function getTypingLength(room: InternalRoom, player: InternalPlayer | PlayerState): number {
  void player;
  const prompt = room.prompt ?? pickPrompt(room.promptCategory, Date.now() + room.round);
  return Array.from(prompt.typing.hiragana).length;
}

function abortCountdown(room: InternalRoom): void {
  room.status = "waiting";
  delete room.prompt;
  delete room.serverStartAt;
  delete room.matchEndsAt;
  room.suddenDeath = false;
  delete room.result;
  resetPlayers(room, true);
  room.lastActivityAt = Date.now();
}

function isTimeAttackExpired(room: InternalRoom, now: number): boolean {
  return room.matchRule === "timeAttack" && room.matchEndsAt !== undefined && now >= room.matchEndsAt;
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

function finalizeRoom(room: InternalRoom): MatchResult {
  room.status = "finished";
  const result = toMatchResult(room);
  room.result = result;
  metrics.matchesFinished += 1;

  runRoomEngineHook(
    () => engineHooks.recordMatchResult?.({
      roomCode: room.roomCode,
      round: room.round,
      prompt: room.prompt ?? pickPrompt(),
      promptCategory: room.promptCategory,
      botDifficulty: room.botDifficulty,
      playerCount: room.players.size,
      hasBot: [...room.players.values()].some((player) => player.isBot),
      result
    }),
    "match_result"
  );

  return result;
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

function addBotPlayer(room: InternalRoom): void {
  if (room.players.has(BOT_PLAYER_ID)) {
    return;
  }

  const difficultyLabel = room.botDifficulty.charAt(0).toUpperCase() + room.botDifficulty.slice(1);
  const nickname = `${BOT_NICKNAME} (${difficultyLabel})`;

  room.players.set(BOT_PLAYER_ID, {
    id: BOT_PLAYER_ID,
    socketId: BOT_PLAYER_ID,
    nickname: nickname,
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

function toInternalPlayer(player: PlayerState, hostPlayerId: string, sessionId: string): InternalPlayer {
  return {
    ...player,
    socketId: player.id,
    sessionId,
    isHost: player.id === hostPlayerId,
    typingProgressIndex: 0,
    pendingInput: "",
    lastInputSequence: 0
  };
}

function createUniqueRoomCode(): string {
  let roomCode = createRoomCode();

  while (rooms.has(roomCode)) {
    roomCode = createRoomCode();
  }

  return roomCode;
}

function selectPromptForRoom(room: InternalRoom, seed: number): Prompt {
  const selected = selectPromptFromPool(
    getPromptsByCategory(room.promptCategory),
    room.promptHistory,
    room.prompt,
    seed
  );

  if (selected) {
    return selected;
  }

  const fallback = selectPromptFromPool(getPromptsByCategory("standard"), room.promptHistory, room.prompt, seed);

  if (fallback) {
    return fallback;
  }

  throw new Error("有効な課題文がありません。");
}

function selectPromptFromPool(
  prompts: Prompt[],
  promptHistory: string[],
  currentPrompt: Prompt | undefined,
  seed: number
): Prompt | null {
  if (prompts.length === 0) {
    return null;
  }

  const unseenPrompts = prompts.filter((prompt) => !promptHistory.includes(prompt.id));
  const pool = unseenPrompts.length > 0 ? unseenPrompts : prompts;
  const index = Math.abs(seed) % pool.length;
  let selected = pool[index] ?? pool[0]!;

  if (currentPrompt && pool.length > 1 && selected.id === currentPrompt.id) {
    selected = pool[(index + 1) % pool.length]!;
  }

  return selected;
}

export const ROOM_TTL_MS = 60 * 1000; // 1 minute
export const DISCONNECT_GRACE_MS = 30_000;

export function cleanupExpiredRooms(): void {
  const now = Date.now();
  for (const [roomCode, room] of rooms.entries()) {
    const isAbandoned = [...room.players.values()].every(p => !p.connected);
    const isFinished = room.status === "finished";

    // Expire waiting rooms, finished rooms, and abandoned rooms
    if (
      (room.status === "waiting" && now - room.lastActivityAt > ROOM_TTL_MS) ||
      (isFinished && now - room.lastActivityAt > ROOM_TTL_MS) ||
      (isAbandoned && now - room.lastActivityAt > ROOM_TTL_MS)
    ) {
      rooms.delete(roomCode);
    }
  }
}

export function checkForForfeits(): RoomState[] {
  const now = Date.now();
  const updatedRooms: RoomState[] = [];

  for (const room of rooms.values()) {
    if (room.status === "playing") {
      let changed = false;

      for (const player of room.players.values()) {
        if (!player.connected && player.disconnectedAt) {
          const elapsed = now - player.disconnectedAt;
          if (elapsed > DISCONNECT_GRACE_MS) {
            if (player.forfeited) {
              continue;
            }

            player.finishedAt = now;
            delete player.finishTimeMs;
            player.finishStatus = "forfeited";
            player.forfeited = true;
            changed = true;
            // If all humans are finished now, finish the match
            if (areHumansFinished(room)) {
              finalizeUnfinishedBots(room);
              finalizeRoom(room);
              changed = true;
            }
          }
        }
      }

      if (changed) {
        updatedRooms.push(toPublicRoom(room));
      }
    }
  }

  return updatedRooms;
}

export function checkExpiredTimeAttackMatches(): MatchResult[] {
  const now = Date.now();
  const results: MatchResult[] = [];

  for (const room of rooms.values()) {
    if (room.status !== "playing" || (room.matchRule !== "timeAttack" && room.matchRule !== "hpBattle") || !room.matchEndsAt) {
      continue;
    }

    if (now < room.matchEndsAt) {
      continue;
    }

    if (room.matchRule === "hpBattle") {
      const players = [...room.players.values()];
      const leftHp = players[0]?.hp ?? 0;
      const rightHp = players[1]?.hp ?? 0;
      if (leftHp === rightHp) {
        room.suddenDeath = true;
        delete room.matchEndsAt;
        continue;
      }
    }

    finalizeUnfinishedBots(room);
    results.push(finalizeRoom(room));
  }

  return results;
}

function maybeFinalizeRoom(room: InternalRoom): MatchResult | null {
  if (room.matchRule === "timeAttack") {
    return null;
  }

  if (room.matchRule === "hpBattle") {
    const hasElimination = [...room.players.values()].some((player) => (player.hp ?? 1) <= 0);

    if (hasElimination) {
      return finalizeRoom(room);
    }
  }

  if (room.matchRule === "race" && [...room.players.values()].some((player) => player.finishStatus === "finished")) {
    finalizeUnfinishedRacePlayers(room);
    return finalizeRoom(room);
  }

  if (areHumansFinished(room)) {
    finalizeUnfinishedBots(room);
    return finalizeRoom(room);
  }

  return null;
}

function syncMatchRuleState(room: InternalRoom): void {
  delete room.matchEndsAt;
  room.suddenDeath = false;
}
