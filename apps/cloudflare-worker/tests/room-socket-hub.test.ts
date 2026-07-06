import { describe, expect, it } from "vitest";
import type { RoomState } from "@type-battle/shared";
import { RoomSocketHub, type RoomSocket } from "../src/room-socket-hub.js";

class FakeRoomSocket implements RoomSocket {
  accept(): void {}
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((this: WebSocket, event: CloseEvent) => void) | null = null;
  readonly messages: string[] = [];
  shouldThrowOnSend = false;

  send(data: string): void {
    if (this.shouldThrowOnSend) {
      throw new Error("send failed");
    }

    this.messages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    const event = { code: code ?? 1000, reason: reason ?? "", wasClean: true } as CloseEvent;

    this.onclose?.call(this as unknown as WebSocket, event);
  }

  receive(data: string): void {
    this.onmessage?.({ data });
  }

}

const baseRoom: RoomState = {
  roomCode: "AB12CD",
  hostPlayerId: "guest-alice",
  status: "waiting",
  matchRule: "race",
  botDifficulty: "normal",
  promptCategory: "standard",
  players: [],
  maxPlayers: 2
};

describe("room socket hub", () => {
  it("broadcasts room state to connected sockets", () => {
    const hub = new RoomSocketHub("AB12CD");
    const first = new FakeRoomSocket();
    const second = new FakeRoomSocket();

    hub.attach(first);
    hub.attach(second);
    hub.setRoomState(baseRoom);

    expect(first.messages).toHaveLength(1);
    expect(second.messages).toHaveLength(1);
    expect(JSON.parse(first.messages[0] as string)).toEqual({
      id: "room-state:AB12CD",
      type: "server:room:state",
      payload: baseRoom
    });
  });

  it("sends the latest snapshot to late joiners", () => {
    const hub = new RoomSocketHub("AB12CD");
    const first = new FakeRoomSocket();
    const second = new FakeRoomSocket();

    hub.attach(first);
    hub.setRoomState(baseRoom);
    hub.attach(second);

    expect(second.messages).toHaveLength(1);
    expect(JSON.parse(second.messages[0] as string)).toEqual({
      id: "room-state:AB12CD",
      type: "server:room:state",
      payload: baseRoom
    });
  });

  it("detaches closed sockets and ignores mismatched updates", () => {
    const hub = new RoomSocketHub("AB12CD");
    const first = new FakeRoomSocket();

    hub.attach(first);
    first.close();

    expect(hub.connectedCount).toBe(0);
    expect(() =>
      hub.setRoomState({
        ...baseRoom,
        roomCode: "ZZ99ZZ"
      })
    ).toThrow(/roomCode mismatch/);
  });

  it("preserves an existing close handler when attaching", () => {
    const hub = new RoomSocketHub("AB12CD");
    const socket = new FakeRoomSocket();
    let closeCount = 0;

    socket.onclose = () => {
      closeCount += 1;
    };

    hub.attach(socket);
    socket.close();

    expect(closeCount).toBe(1);
    expect(hub.connectedCount).toBe(0);
  });

  it("ignores incoming socket messages", () => {
    const hub = new RoomSocketHub("AB12CD");
    const sender = new FakeRoomSocket();
    const receiver = new FakeRoomSocket();

    hub.attach(sender);
    hub.attach(receiver);
    hub.setRoomState(baseRoom);
    sender.receive(
      JSON.stringify({
        id: "client-message",
        type: "server:room:state",
        payload: {
          ...baseRoom,
          status: "active"
        }
      })
    );

    expect(receiver.messages).toHaveLength(1);
    expect(hub.snapshot).toEqual(baseRoom);
  });

  it("detaches sockets that fail to send", () => {
    const hub = new RoomSocketHub("AB12CD");
    const failing = new FakeRoomSocket();
    const healthy = new FakeRoomSocket();

    failing.shouldThrowOnSend = true;

    hub.attach(failing);
    hub.attach(healthy);
    hub.setRoomState(baseRoom);

    expect(hub.connectedCount).toBe(1);
    expect(healthy.messages).toHaveLength(1);
  });
});
