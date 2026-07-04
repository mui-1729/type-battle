import type { RoomState } from "@type-battle/shared";
import { parseRoomStateBroadcast, serializeRoomStateBroadcast } from "./room-protocol.js";

export interface RoomSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
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
    socket.onmessage = (event) => {
      const message = parseRoomStateBroadcast(event.data);

      if (!message || message.roomCode !== this.roomCode) {
        return;
      }

      this.setRoomState(message.room);
    };
    socket.onclose = () => {
      this.detach(socket);
    };

    if (this.currentRoom) {
      socket.send(serializeRoomStateBroadcast(this.currentRoom));
    }
  }

  detach(socket: RoomSocket): void {
    this.sockets.delete(socket);
    socket.onmessage = null;
    socket.onclose = null;
  }

  setRoomState(room: RoomState): void {
    if (room.roomCode.toUpperCase() !== this.roomCode) {
      throw new Error(`roomCode mismatch: expected ${this.roomCode}, received ${room.roomCode}`);
    }

    this.currentRoom = room;
    this.broadcast(room);
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
