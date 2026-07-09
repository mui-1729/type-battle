import type { CloudflareServerEventEnvelope, RoomState } from "@type-battle/shared";
import { normalizeRoomCode } from "./room-routing.js";

export type RoomStateBroadcastMessage = CloudflareServerEventEnvelope<"server:room:state">;

type UnknownRecord = Record<string, unknown>;

export function serializeRoomStateBroadcast(room: RoomState): string {
  const roomCode = normalizeRoomCode(room.roomCode);

  return JSON.stringify({
    id: createRoomStateBroadcastId(roomCode),
    type: "server:room:state",
    payload: {
      ...room,
      roomCode
    }
  } satisfies RoomStateBroadcastMessage);
}

export function parseRoomStateBroadcast(data: string): RoomStateBroadcastMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isUnknownRecord(parsed) || parsed.type !== "server:room:state") {
    return null;
  }

  if (typeof parsed.id !== "string" || !isUnknownRecord(parsed.payload)) {
    return null;
  }

  const room = parsed.payload as RoomState;

  if (typeof room.roomCode !== "string") {
    return null;
  }

  const roomCode = normalizeRoomCode(room.roomCode);

  return {
    id: parsed.id,
    type: "server:room:state",
    payload: {
      ...room,
      roomCode
    }
  };
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function createRoomStateBroadcastId(roomCode: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `room-state:${roomCode}:${randomId}`;
}
