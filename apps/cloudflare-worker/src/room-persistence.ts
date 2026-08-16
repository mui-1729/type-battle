import type { RoomState } from "@type-battle/shared";

export const ROOM_SNAPSHOT_SCHEMA_VERSION = 2;

export type PersistedPlayerTypingState = {
  typingProgressIndex?: number;
  pendingInput?: string;
  inputMode?: "kana" | "romaji";
  lastInputSequence?: number;
  typingRateTokens?: number;
  typingRateLastRefillAt?: number;
};

export type PersistedRoomSnapshot = {
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

type PersistablePlayer = {
  disconnectedAt?: number;
  typingProgressIndex: number;
  pendingInput: string;
  inputMode?: "kana" | "romaji";
  lastInputSequence: number;
  typingRateTokens: number;
  typingRateLastRefillAt: number;
};

type PersistableRoom = {
  round: number;
  promptHistory: string[];
  createdAt: number;
  lastActivityAt: number;
  finishedAt?: number;
  players: Map<string, PersistablePlayer>;
};

export function createPersistedRoomSnapshot({
  room,
  publicRoom,
  playerSessions
}: {
  room: PersistableRoom;
  publicRoom: RoomState;
  playerSessions: ReadonlyMap<string, string>;
}): PersistedRoomSnapshot {
  const disconnectedAt: Record<string, number> = {};
  const typingState: Record<string, PersistedPlayerTypingState> = {};

  for (const [playerId, player] of room.players.entries()) {
    if (player.disconnectedAt !== undefined) {
      disconnectedAt[playerId] = player.disconnectedAt;
    }

    typingState[playerId] = {
      typingProgressIndex: player.typingProgressIndex,
      pendingInput: player.pendingInput,
      ...(player.inputMode ? { inputMode: player.inputMode } : {}),
      lastInputSequence: player.lastInputSequence,
      typingRateTokens: player.typingRateTokens,
      typingRateLastRefillAt: player.typingRateLastRefillAt
    };
  }

  return {
    schemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
    room: publicRoom,
    playerSessions: Object.fromEntries(playerSessions.entries()),
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
