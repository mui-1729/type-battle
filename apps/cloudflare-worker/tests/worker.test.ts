import { describe, expect, it } from "vitest";
import type { RoomState } from "@type-battle/shared";
import type { Env } from "../src/worker.js";
import worker, { RoomDurableObject } from "../src/worker.js";

class FakeStorage {
  readonly values = new Map<string, unknown>();
  putResolved = false;
  putCalls = 0;
  shouldFailPut = false;

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.putCalls += 1;

    if (this.shouldFailPut) {
      throw new Error("storage write failed");
    }

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

class FakeDurableObjectState {
  constructor(public readonly storage: FakeStorage) {}

  async blockConcurrencyWhile<T>(callback: () => Promise<T> | T): Promise<T> {
    return await callback();
  }
}

class FakeDurableObjectId {
  constructor(private readonly id: string) {}

  toString(): string {
    return this.id;
  }
}

class FakeDurableObjectStub {
  fetchCalls = 0;
  lastRequest: Request | null = null;

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    this.fetchCalls += 1;
    this.lastRequest = input instanceof Request ? input : new Request(input, init);

    return new Response("ok", { status: 200 });
  }
}

class FakeDurableObjectNamespace {
  readonly ids: string[] = [];
  readonly stub = new FakeDurableObjectStub();

  idFromName(name: string): DurableObjectId {
    this.ids.push(name);
    return new FakeDurableObjectId(name) as unknown as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    void id;
    return this.stub as unknown as DurableObjectStub;
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

const fetchWorker = worker.fetch as unknown as (
  request: Request,
  env: Env
) => Promise<Response>;

function createEnv(): {
  ROOMS: FakeDurableObjectNamespace;
  ROOM_STATE_WRITE_TOKEN: string;
} {
  return {
    ROOMS: new FakeDurableObjectNamespace(),
    ROOM_STATE_WRITE_TOKEN: "secret-token"
  };
}

describe("room durable object", () => {
  it("rejects state updates for a mismatched room code", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

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
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

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

  it("canonicalizes room codes before persistence", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const response = await durableObject.fetch(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...baseRoom,
          roomCode: " ab12cd "
        })
      })
    );

    expect(response.status).toBe(200);
    expect(storage.values.get("room-state")).toEqual(baseRoom);
  });

  it("returns 500 when room state persistence fails", async () => {
    const storage = new FakeStorage();
    storage.shouldFailPut = true;
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const response = await durableObject.fetch(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(baseRoom)
      })
    );

    expect(response.status).toBe(500);
    expect(storage.putCalls).toBe(1);
    expect(storage.values.has("room-state")).toBe(false);
  });

  it("rejects non-websocket upgrades on the socket route", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const response = await durableObject.fetch(
      new Request("https://example.com/rooms/ab12cd/socket", {
        method: "GET"
      })
    );

    expect(response.status).toBe(400);
  });
});

describe("worker handler", () => {
  it("serves a health endpoint without a durable object lookup", async () => {
    const env = createEnv();
    const response = await fetchWorker(
      new Request("https://example.com/health"),
      env as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "type-battle-cloudflare-worker"
    });
    expect(env.ROOMS.ids).toEqual([]);
  });

  it("rejects state writes without the internal token", async () => {
    const env = createEnv();
    const response = await fetchWorker(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(baseRoom)
      }) as Request,
      env as unknown as Env
    );

    expect(response.status).toBe(403);
    expect(env.ROOMS.stub.fetchCalls).toBe(0);
  });

  it("forwards authorized state writes to the room DO", async () => {
    const env = createEnv();
    const response = await fetchWorker(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "POST",
        headers: {
          "authorization": "Bearer secret-token",
          "content-type": "application/json"
        },
        body: JSON.stringify(baseRoom)
      }) as Request,
      env as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(env.ROOMS.ids).toEqual(["AB12CD"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
    expect(env.ROOMS.stub.lastRequest?.method).toBe("POST");
  });

  it("forwards socket requests to the room DO", async () => {
    const env = createEnv();
    const response = await fetchWorker(
      new Request("https://example.com/rooms/ab12cd/socket", {
        method: "GET"
      }) as Request,
      env as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(env.ROOMS.ids).toEqual(["AB12CD"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
    expect(env.ROOMS.stub.lastRequest?.url).toContain("/rooms/ab12cd/socket");
  });
});
