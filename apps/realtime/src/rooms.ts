import {
  calculateAccuracy,
  calculateWpm,
  createRoomCode,
  normalizeNickname,
  pickPrompt,
  rankPlayers
} from "@type-battle/shared";
import type {
  BotDifficulty,
  MatchResult,
  MatchStatus,
  PlayerState,
  Prompt,
  PromptCategory,
  RoomState,
  TypingFinish,
  TypingProgress
} from "@type-battle/shared";

const MAX_PLAYERS = 2;
const COUNTDOWN_MS = 3_000;
const BOT_PLAYER_ID = "bot_com_1";
const BOT_NICKNAME = "COM";
export const BOT_TICK_MS = 500;

const DIFFICULTY_SETTINGS: Record<BotDifficulty, { charsPerTick: number; mistakeChance: number }> = {
  easy: { charsPerTick: 1, mistakeChance: 0.05 },
  normal: { charsPerTick: 2, mistakeChance: 0.02 },
  hard: { charsPerTick: 3, mistakeChance: 0.01 }
};

type InternalPlayer = PlayerState & {
  socketId: string;
  disconnectedAt?: number;
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

type InternalRoom = {
  roomCode: string;
  hostPlayerId: string;
  status: MatchStatus;
  botDifficulty: BotDifficulty;
  promptCategory: PromptCategory;
  prompt?: Prompt;
  serverStartAt?: number;
  result?: MatchResult;
  players: Map<string, InternalPlayer>;
  createdAt: number;
  lastActivityAt: number;
  round: number;
};

const rooms = new Map<string, InternalRoom>();
const socketIndex = new Map<string, { roomCode: string; playerId: string }>();

export function createRoom(input: { nickname: string; guestId: string; socketId: string }): {
  room: RoomState;
  playerId: string;
} {
  const roomCode = createUniqueRoomCode();
  const player = createPlayer(input.guestId, input.nickname, input.socketId, true);
  const room: InternalRoom = {
    roomCode,
    hostPlayerId: player.id,
    status: "waiting",
    botDifficulty: "normal",
    promptCategory: "standard",
    players: new Map([[player.id, player]]),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    round: 1
  };

  rooms.set(roomCode, room);
  socketIndex.set(input.socketId, { roomCode, playerId: player.id });

  return { room: toPublicRoom(room), playerId: player.id };
}

export function joinRoom(input: {
  roomCode: string;
  nickname: string;
  guestId: string;
  socketId: string;
}): { room: RoomState; playerId: string } | { error: string } {
  const room = rooms.get(input.roomCode.toUpperCase());

  if (!room) {
    return { error: "ルームが見つかりません。" };
  }

  room.lastActivityAt = Date.now();
  const existing = room.players.get(input.guestId);

  if (existing) {
    existing.socketId = input.socketId;
    existing.connected = true;
    delete existing.disconnectedAt;
    existing.nickname = normalizeNickname(input.nickname);
    socketIndex.set(input.socketId, { roomCode: room.roomCode, playerId: existing.id });
    return { room: toPublicRoom(room), playerId: existing.id };
  }

  if (room.status !== "waiting") {
    return { error: "試合中のルームには参加できません。" };
  }

  if (room.players.size >= MAX_PLAYERS) {
    return { error: "このルームは満員です。" };
  }

  const player = createPlayer(input.guestId, input.nickname, input.socketId, false);
  room.players.set(player.id, player);
  socketIndex.set(input.socketId, { roomCode: room.roomCode, playerId: player.id });

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

  if (context.room.status !== "waiting") {
    return { error: "試合中は課題カテゴリを変更できません。" };
  }

  context.room.promptCategory = category;
  return { room: toPublicRoom(context.room) };
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

export function setReady(socketId: string, roomCode: string, ready: boolean): RoomState | null {
  const record = socketIndex.get(socketId);
  const room = rooms.get(roomCode.toUpperCase());

  if (!record || !room || record.roomCode !== room.roomCode || room.status !== "waiting") {
    return null;
  }

  const player = room.players.get(record.playerId);

  if (!player) {
    return null;
  }

  player.ready = ready;
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

  if (players.length < MAX_PLAYERS) {
    addBotPlayer(room);
  }

  if (![...room.players.values()].every((player) => player.connected || player.isBot)) {
    return { error: "切断中のプレイヤーがいます。" };
  }

  room.status = "countdown";
  room.prompt = pickPrompt(room.promptCategory, Date.now());
  room.serverStartAt = Date.now() + COUNTDOWN_MS;
  delete room.result;
  resetPlayers(room);

  return { room: toPublicRoom(room) };
}

export function markPlaying(roomCode: string): RoomState | null {
  const room = rooms.get(roomCode.toUpperCase());

  if (!room || room.status !== "countdown") {
    return null;
  }

  room.status = "playing";
  return toPublicRoom(room);
}

function areHumansFinished(room: InternalRoom): boolean {
  const promptLength = room.prompt?.text.length ?? 0;
  return [...room.players.values()]
    .filter((p) => !p.isBot)
    .every((p) => p.progressIndex >= promptLength || !p.connected);
}

function finalizeUnfinishedBots(room: InternalRoom): void {
  const promptLength = room.prompt?.text.length ?? 0;
  for (const bot of [...room.players.values()].filter((p) => p.isBot)) {
    if (bot.progressIndex < promptLength) {
      bot.finishedAt = Date.now();
      bot.finishTimeMs = Infinity;
    }
  }
}

export function advanceBot(roomCode: string): BotTickOutcome | null {
  const room = rooms.get(roomCode.toUpperCase());

  if (!room || room.status !== "playing" || !room.prompt) {
    return null;
  }

  const bot = [...room.players.values()].find((player) => player.isBot);

  if (!bot || bot.progressIndex >= room.prompt.text.length) {
    return null;
  }

  const settings = DIFFICULTY_SETTINGS[room.botDifficulty] ?? DIFFICULTY_SETTINGS.normal;
  const isMistake = Math.random() < settings.mistakeChance;

  // Add random speed variation: -1, 0, or +1 (ensuring minimum speed of 1)
  const variance = Math.floor(Math.random() * 3) - 1;
  const speed = Math.max(1, settings.charsPerTick + variance);
  const charsToAdd = isMistake ? 0 : speed;

  applyProgress(bot, room, {
    roomCode: room.roomCode,
    progressIndex: bot.progressIndex + charsToAdd,
    correctCharacters: bot.correctCharacters + charsToAdd,
    totalTypedCharacters: bot.totalTypedCharacters + speed,
    mistakes: bot.mistakes + (isMistake ? speed : 0)
  });

  const promptLength = room.prompt.text.length;

  if (bot.progressIndex >= promptLength) {
    bot.finishedAt = Date.now();
    bot.finishTimeMs = bot.finishedAt - (room.serverStartAt ?? bot.finishedAt);
  }

  if (bot.progressIndex >= promptLength || areHumansFinished(room)) {
    if (bot.progressIndex < promptLength) {
      finalizeUnfinishedBots(room);
    }
    room.status = "finished";
    room.result = toMatchResult(room);
    return { type: "result", result: room.result };
  }

  return { type: "progress", room: toPublicRoom(room) };
}

export function updateProgress(socketId: string, payload: TypingProgress): RoomState | null {
  const context = getContext(socketId, payload.roomCode);

  if (!context || context.room.status !== "playing" || !context.room.prompt) {
    return null;
  }

  applyProgress(context.player, context.room, payload);
  return toPublicRoom(context.room);
}

export function finishTyping(socketId: string, payload: TypingFinish): MatchResult | RoomState | null {
  const context = getContext(socketId, payload.roomCode);

  if (!context || context.room.status !== "playing" || !context.room.prompt) {
    return null;
  }

  applyProgress(context.player, context.room, payload);

  const promptLength = context.room.prompt.text.length;

  if (context.player.progressIndex >= promptLength) {
    const now = Date.now();
    context.player.finishedAt = now;
    context.player.finishTimeMs = now - (context.room.serverStartAt ?? now);
  }

  if (areHumansFinished(context.room)) {
    finalizeUnfinishedBots(context.room);
    context.room.status = "finished";
    context.room.result = toMatchResult(context.room);
    return context.room.result;
  }

  return toPublicRoom(context.room);
}

export function rematch(socketId: string, roomCode: string): { room: RoomState } | { error: string } {
  const record = socketIndex.get(socketId);
  const room = rooms.get(roomCode.toUpperCase());

  if (!record || !room || record.roomCode !== room.roomCode) {
    return { error: "ルームに参加していません。" };
  }

  room.status = "waiting";
  room.round += 1;
  room.prompt = pickPrompt(room.promptCategory, Date.now() + room.round);
  delete room.serverStartAt;
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

function applyProgress(player: InternalPlayer, room: InternalRoom, payload: TypingProgress): void {
  const promptLength = room.prompt?.text.length ?? 0;
  const nextIndex = clamp(payload.progressIndex, player.progressIndex, promptLength);
  const totalTypedCharacters = Math.max(payload.totalTypedCharacters, player.totalTypedCharacters);
  const correctCharacters = clamp(payload.correctCharacters, player.correctCharacters, nextIndex);
  const mistakes = Math.max(payload.mistakes, player.mistakes);
  const now = Date.now();
  const startedAt = room.serverStartAt ?? now;

  player.progressIndex = nextIndex;
  player.correctCharacters = correctCharacters;
  player.totalTypedCharacters = totalTypedCharacters;
  player.mistakes = mistakes;
  player.wpm = calculateWpm(correctCharacters, now - startedAt);
  player.accuracy = calculateAccuracy(correctCharacters, totalTypedCharacters);
}

function resetPlayers(room: InternalRoom): void {
  for (const player of room.players.values()) {
    player.ready = false;
    player.progressIndex = 0;
    player.correctCharacters = 0;
    player.totalTypedCharacters = 0;
    player.mistakes = 0;
    player.wpm = 0;
    player.accuracy = 100;
    delete player.finishedAt;
    delete player.finishTimeMs;
  }
}

function toMatchResult(room: InternalRoom): MatchResult {
  const prompt = room.prompt ?? pickPrompt();

  return {
    roomCode: room.roomCode,
    prompt,
    players: rankPlayers(toPublicPlayers(room), prompt.text.length)
  };
}

function toPublicRoom(room: InternalRoom): RoomState {
  const publicRoom: RoomState = {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
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
    accuracy: player.accuracy
  };

  if (player.finishedAt) {
    publicPlayer.finishedAt = player.finishedAt;
  }

  if (player.finishTimeMs) {
    publicPlayer.finishTimeMs = player.finishTimeMs;
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
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    wpm: 0,
    accuracy: 100
  });
}

function createPlayer(
  id: string,
  nickname: string,
  socketId: string,
  isHost: boolean
): InternalPlayer {
  return {
    id,
    socketId,
    nickname: normalizeNickname(nickname),
    connected: true,
    ready: false,
    isHost,
    isBot: false,
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    wpm: 0,
    accuracy: 100
  };
}

function createUniqueRoomCode(): string {
  let roomCode = createRoomCode();

  while (rooms.has(roomCode)) {
    roomCode = createRoomCode();
  }

  return roomCode;
}

const ROOM_TTL_MS = 60 * 1000; // 1 minute

export function cleanupExpiredRooms(): void {
  const now = Date.now();
  for (const [roomCode, room] of rooms.entries()) {
    if (room.status === "waiting" && now - room.lastActivityAt > ROOM_TTL_MS) {
      rooms.delete(roomCode);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}
