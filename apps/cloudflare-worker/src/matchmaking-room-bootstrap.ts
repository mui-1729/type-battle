import type { PlayerState, RoomState } from "@type-battle/shared";
import type { MatchmakingRoomReservation } from "./matchmaking-room-reservation.js";

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

export function createMatchmakingRoomBootstrapSnapshot(
  reservation: MatchmakingRoomReservation,
  now = Date.now()
): MatchmakingRoomBootstrapSnapshot {
  if (!Number.isFinite(now) || now < reservation.createdAt || now >= reservation.expiresAt) {
    throw new Error("Matchmaking reservation is not active.");
  }

  const host = createReservedPlayer(reservation.host.guestId, reservation.host.nickname, true);
  const guest = createReservedPlayer(reservation.guest.guestId, reservation.guest.nickname, false);

  return {
    schemaVersion: 2,
    room: {
      roomCode: reservation.roomCode,
      hostPlayerId: host.id,
      status: "waiting",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      players: [host, guest],
      maxPlayers: 2,
      round: 1
    },
    playerSessions: {
      [host.id]: reservation.host.claimToken,
      [guest.id]: reservation.guest.claimToken
    },
    disconnectedAt: {
      [host.id]: now,
      [guest.id]: now
    },
    internal: {
      round: 1,
      promptHistory: [],
      createdAt: now,
      lastActivityAt: now
    }
  };
}

function createReservedPlayer(id: string, nickname: string, isHost: boolean): PlayerState {
  return {
    id,
    nickname,
    connected: false,
    ready: false,
    isHost,
    isBot: false,
    deviceKind: "desktop",
    inputMode: "romaji",
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
