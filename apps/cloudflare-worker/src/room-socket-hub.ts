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
  private readonly previousOnClose = new WeakMap<RoomSocket, RoomSocket["onclose"]>();
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
    this.previousOnClose.set(socket, socket.onclose);
    socket.onclose = (event) => {
      const previous = this.previousOnClose.get(socket);
      this.detach(socket);
      previous?.call(socket as WebSocket, event);
    };

    if (this.currentRoom) {
      socket.send(serializeRoomStateBroadcast(this.currentRoom));
    }
  }

  detach(socket: RoomSocket): void {
    this.sockets.delete(socket);
    socket.onclose = this.previousOnClose.get(socket) ?? null;
    this.previousOnClose.delete(socket);
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
    this.broadcastMessage(serializeRoomStateBroadcast(normalizedRoom));
  }

  broadcastMessage(payload: string): void {
    for (const socket of this.sockets) {
      if (socket.readyState !== 1) {
        this.detach(socket);
        continue;
      }

      try {
        socket.send(payload);
      } catch {
        this.detach(socket);
      }
    }
  }
}
