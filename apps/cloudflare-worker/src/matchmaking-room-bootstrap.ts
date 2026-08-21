import type { DeviceKind, PlayerState, RoomState } from "@type-battle/shared";
import { isValidRoomCode, normalizeNickname, validateNickname } from "@type-battle/shared";
import { normalizeRoomCode } from "./room-routing.js";

const MAX_IDENTIFIER_LENGTH = 96;
export const MATCHMAKING_ROOM_BOOTSTRAP_PATH = "/__internal/matchmaking-bootstrap";
export const MATCHMAKING_ROOM_CLEANUP_PATH = "/__internal/matchmaking-cleanup";

export type MatchmakingBootstrapPlayer = {
  guestId: string;
  sessionId: string;
  nickname: string;
  deviceKind?: DeviceKind;
};

export type MatchmakingRoomBootstrapSnapshot = {
  schemaVersion: 2;
  room: RoomState;
  playerSessions: Record<string, string>;
  disconnectedAt: Record<string, number>;
  internal: {
    round: 1;
    promptHistory: string[];
    createdAt: number;
    lastActivityAt: number;
  };
};

export function createMatchmakingRoomBootstrapSnapshot(input: {
  roomCode: string;
  host: MatchmakingBootstrapPlayer;
  guest: MatchmakingBootstrapPlayer;
  now?: number;
}): MatchmakingRoomBootstrapSnapshot {
  const roomCode = normalizeRoomCode(input.roomCode);
  const host = normalizeBootstrapPlayer(input.host);
  const guest = normalizeBootstrapPlayer(input.guest);
  const now = input.now ?? Date.now();

  if (!isValidRoomCode(roomCode)) {
    throw new Error("Invalid matchmaking room code.");
  }
  if (host.guestId === guest.guestId) {
    throw new Error("Matchmaking bootstrap requires two distinct guests.");
  }
  if (host.sessionId === guest.sessionId) {
    throw new Error("Matchmaking bootstrap requires distinct sessions.");
  }
  if (!Number.isFinite(now) || now < 0) {
    throw new Error("Invalid matchmaking bootstrap timestamp.");
  }

  const hostState = createReservedPlayer(host, true);
  const guestState = createReservedPlayer(guest, false);

  return {
    schemaVersion: 2,
    room: {
      roomCode,
      hostPlayerId: hostState.id,
      status: "waiting",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      players: [hostState, guestState],
      maxPlayers: 2,
      round: 1
    },
    playerSessions: {
      [host.guestId]: host.sessionId,
      [guest.guestId]: guest.sessionId
    },
    disconnectedAt: {
      [host.guestId]: now,
      [guest.guestId]: now
    },
    internal: {
      round: 1,
      promptHistory: [],
      createdAt: now,
      lastActivityAt: now
    }
  };
}

export function isAssignedMatchmakingHostConnected(
  room: RoomState | null | undefined,
  expectedHostGuestId: string
): boolean {
  const guestId = readIdentifier(expectedHostGuestId);
  if (!room || !guestId || room.hostPlayerId !== guestId) {
    return false;
  }

  const player = room.players.find((candidate) => candidate.id === guestId);
  return Boolean(player?.connected && player.isHost && !player.isBot);
}

function normalizeBootstrapPlayer(player: MatchmakingBootstrapPlayer): MatchmakingBootstrapPlayer {
  const guestId = readIdentifier(player.guestId);
  const sessionId = readIdentifier(player.sessionId);
  const nickname = normalizeNickname(player.nickname);
  const nicknameError = validateNickname(nickname);

  if (!guestId || !sessionId || nicknameError) {
    throw new Error("Invalid matchmaking bootstrap player.");
  }
  if (player.deviceKind !== undefined && player.deviceKind !== "mobile" && player.deviceKind !== "desktop") {
    throw new Error("Invalid matchmaking bootstrap device kind.");
  }

  return {
    guestId,
    sessionId,
    nickname,
    ...(player.deviceKind ? { deviceKind: player.deviceKind } : {})
  };
}

function createReservedPlayer(player: MatchmakingBootstrapPlayer, isHost: boolean): PlayerState {
  return {
    id: player.guestId,
    nickname: player.nickname,
    connected: false,
    ready: false,
    isHost,
    isBot: false,
    deviceKind: player.deviceKind ?? "desktop",
    inputMode: player.deviceKind === "mobile" ? "kana" : "romaji",
    progressIndex: 0,
    typingProgressIndex: 0,
    pendingInput: "",
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    maxStreak: 0,
    currentStreak: 0,
    wpm: 0,
    accuracy: 100
  };
}

function readIdentifier(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_IDENTIFIER_LENGTH ? normalized : null;
}
