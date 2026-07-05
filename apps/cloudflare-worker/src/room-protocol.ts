import type { RoomState } from "@type-battle/shared";
import { normalizeRoomCode } from "./room-routing.js";

export type RoomStateBroadcastMessage = {
  type: "room:state";
  roomCode: string;
  room: RoomState;
};

type UnknownRecord = Record<string, unknown>;

export function serializeRoomStateBroadcast(room: RoomState): string {
  return JSON.stringify({
    type: "room:state",
    roomCode: normalizeRoomCode(room.roomCode),
    room
  } satisfies RoomStateBroadcastMessage);
}

export function parseRoomStateBroadcast(data: string): RoomStateBroadcastMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isUnknownRecord(parsed) || parsed.type !== "room:state") {
    return null;
  }

  if (typeof parsed.roomCode !== "string" || !isUnknownRecord(parsed.room)) {
    return null;
  }

  const roomCode = normalizeRoomCode(parsed.roomCode);
  const room = parsed.room as RoomState;

  if (normalizeRoomCode(room.roomCode) !== roomCode) {
    return null;
  }

  return {
    type: "room:state",
    roomCode,
    room
  };
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}
