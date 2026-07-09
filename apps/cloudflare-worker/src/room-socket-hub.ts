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

  attach(socket: RoomSocket): RoomSocket[] {
    this.sockets.add(socket);
    this.previousOnClose.set(socket, socket.onclose);
    socket.onclose = (event) => {
      const previous = this.previousOnClose.get(socket);
      this.detach(socket);
      previous?.call(socket as WebSocket, event);
    };

    if (this.currentRoom && !this.send(socket, serializeRoomStateBroadcast(this.currentRoom))) {
      return [socket];
    }

    return [];
  }

  detach(socket: RoomSocket): void {
    this.sockets.delete(socket);
    socket.onclose = this.previousOnClose.get(socket) ?? null;
    this.previousOnClose.delete(socket);
  }

  setRoomState(room: RoomState): RoomSocket[] {
    const normalizedRoom = {
      ...room,
      roomCode: normalizeRoomCode(room.roomCode)
    };

    if (normalizedRoom.roomCode !== this.roomCode) {
      throw new Error(`roomCode mismatch: expected ${this.roomCode}, received ${room.roomCode}`);
    }

    this.currentRoom = normalizedRoom;
    return this.broadcastMessage(serializeRoomStateBroadcast(normalizedRoom));
  }

  broadcastMessage(payload: string): RoomSocket[] {
    const detachedSockets: RoomSocket[] = [];

    for (const socket of this.sockets) {
      if (!this.send(socket, payload)) {
        detachedSockets.push(socket);
      }
    }

    return detachedSockets;
  }

  private send(socket: RoomSocket, payload: string): boolean {
    if (socket.readyState !== 1) {
      this.detach(socket);
      return false;
    }

    try {
      socket.send(payload);
      return true;
    } catch {
      this.detach(socket);
      return false;
    }
  }
}
