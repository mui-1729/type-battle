import type { RoomState } from "@type-battle/shared";
import { normalizeRoomCode } from "./room-routing.js";
import { serializeRoomStateBroadcast } from "./room-protocol.js";

export interface RoomSocket {
  accept(): void;
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onclose: ((this: WebSocket, event: CloseEvent) => void) | null;
}

export class RoomSocketHub {
  private readonly sockets = new Set<RoomSocket>();
  private currentRoom: RoomState | null = null;

  constructor(public readonly roomCode: string) {}

  get connectedCount(): number {
    return this.sockets.size;
  }

  get snapshot(): RoomState | null {
    return this.currentRoom;
  }

  attach(socket: RoomSocket): void {
    this.sockets.add(socket);
    socket.onclose = () => {
      this.detach(socket);
    };

    if (this.currentRoom) {
      socket.send(serializeRoomStateBroadcast(this.currentRoom));
    }
  }

  detach(socket: RoomSocket): void {
    this.sockets.delete(socket);
    socket.onclose = null;
  }

  setRoomState(room: RoomState): void {
    const normalizedRoom = {
      ...room,
      roomCode: normalizeRoomCode(room.roomCode)
    };

    if (normalizedRoom.roomCode !== this.roomCode) {
      throw new Error(`roomCode mismatch: expected ${this.roomCode}, received ${room.roomCode}`);
    }

    this.currentRoom = normalizedRoom;
    this.broadcast(normalizedRoom);
  }

  private broadcast(room: RoomState): void {
    const payload = serializeRoomStateBroadcast(room);

    for (const socket of this.sockets) {
      if (socket.readyState !== 1) {
        continue;
      }

      socket.send(payload);
    }
  }
}
