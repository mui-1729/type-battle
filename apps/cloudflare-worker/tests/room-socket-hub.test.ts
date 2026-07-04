import { describe, expect, it } from "vitest";
import type { RoomState } from "@type-battle/shared";
import { RoomSocketHub, type RoomSocket } from "../src/room-socket-hub.js";

class FakeRoomSocket implements RoomSocket {
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  readonly messages: string[] = [];

  send(data: string): void {
    this.messages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    const event: { code?: number; reason?: string } = {};

    if (code !== undefined) {
      event.code = code;
    }

    if (reason !== undefined) {
      event.reason = reason;
    }

    this.onclose?.(event);
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
      type: "room:state",
      roomCode: "AB12CD",
      room: baseRoom
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
      type: "room:state",
      roomCode: "AB12CD",
      room: baseRoom
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

  it("accepts room state messages from connected sockets", () => {
    const hub = new RoomSocketHub("AB12CD");
    const sender = new FakeRoomSocket();
    const receiver = new FakeRoomSocket();

    hub.attach(sender);
    hub.attach(receiver);
    sender.receive(
      JSON.stringify({
        type: "room:state",
        roomCode: "ab12cd",
        room: baseRoom
      })
    );

    expect(receiver.messages).toHaveLength(1);
  });
});
