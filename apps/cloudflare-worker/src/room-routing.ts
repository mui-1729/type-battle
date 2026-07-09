import { isValidRoomCode } from "@type-battle/shared";

export type RoomRoute =
  | {
      action: "socket";
      roomCode: string;
    }
  | {
      action: "state";
      roomCode: string;
    };

const ROOM_ROUTE_PATTERN = /^\/rooms\/([^/]+)\/(socket|state)\/?$/i;

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function isRoomRoutePath(pathname: string): boolean {
  return ROOM_ROUTE_PATTERN.test(pathname);
}

export function resolveRoomRoute(pathname: string): RoomRoute | null {
  const match = ROOM_ROUTE_PATTERN.exec(pathname);

  if (!match) {
    return null;
  }

  const roomCode = normalizeRoomCode(match[1] ?? "");
  const action = match[2]?.toLowerCase();

  if (!roomCode || !action || !isValidRoomCode(roomCode)) {
    return null;
  }

  if (action === "socket") {
    return { action, roomCode };
  }

  return { action: "state", roomCode };
}
