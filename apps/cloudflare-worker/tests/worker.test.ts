import { describe, expect, it } from "vitest";
import type { RoomState } from "@type-battle/shared";
import { RoomDurableObject } from "../src/worker.js";

class FakeStorage {
  readonly values = new Map<string, unknown>();
  putResolved = false;
  putCalls = 0;

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.putCalls += 1;
    this.values.set(key, value);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.putResolved = true;
        resolve();
      }, 0);
    });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class FakeDurableObjectState implements DurableObjectState {
  constructor(public readonly storage: FakeStorage) {}

  async blockConcurrencyWhile<T>(callback: () => Promise<T> | T): Promise<T> {
    return await callback();
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

describe("room durable object", () => {
  it("rejects state updates for a mismatched room code", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(new FakeDurableObjectState(storage));

    const response = await durableObject.fetch(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...baseRoom,
          roomCode: "ZZ99ZZ"
        })
      })
    );

    expect(response.status).toBe(400);
    expect(storage.putCalls).toBe(0);
  });

  it("waits for room state persistence before responding", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(new FakeDurableObjectState(storage));

    const response = await durableObject.fetch(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(baseRoom)
      })
    );

    expect(response.status).toBe(200);
    expect(storage.putCalls).toBe(1);
    expect(storage.putResolved).toBe(true);
    expect(storage.values.get("room-state")).toEqual(baseRoom);
  });
});
