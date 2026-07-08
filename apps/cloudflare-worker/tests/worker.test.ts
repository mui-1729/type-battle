import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomState } from "@type-battle/shared";
import { createRoom, getRoom, rooms, startMatch } from "@type-battle/shared/room-engine";
import type { Env } from "../src/worker.js";
import worker, { RoomDurableObject } from "../src/worker.js";

class FakeStorage {
  readonly values = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    for (const [key, value] of this.values) {
      if (options?.prefix && !key.startsWith(options.prefix)) {
        continue;
      }

      result.set(key, value as T);
    }

    return result;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
  }

  async sync(): Promise<void> {}
}

class FakeDurableObjectState {
  constructor(public readonly storage: FakeStorage) {}

  async blockConcurrencyWhile<T>(callback: () => Promise<T> | T): Promise<T> {
    return await callback();
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
  readonly getByNameCalls: string[] = [];
  readonly stub = new FakeDurableObjectStub();

  getByName(name: string): DurableObjectStub {
    this.getByNameCalls.push(name);
    return this.stub as unknown as DurableObjectStub;
  }
}

class FakeSocket {
  readyState = 1;
  accepted = false;
  readonly messages: string[] = [];
  private readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();

  accept(): void {
    this.accepted = true;
  }

  addEventListener(type: "message" | "close", handler: (event: { data?: unknown }) => void): void {
    const handlers = this.listeners.get(type) ?? new Set<(event: { data?: unknown }) => void>();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  close(): void {
    if (this.readyState === 3) {
      return;
    }

    this.readyState = 3;
    this.dispatch("close", {});
  }

  send(data: string): void {
    this.messages.push(data);
  }

  receive(data: string): void {
    this.dispatch("message", { data });
  }

  private dispatch(type: string, event: { data?: unknown }): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
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

function parseMessages(socket: FakeSocket): Array<Record<string, unknown>> {
  return socket.messages.map((message) => JSON.parse(message) as Record<string, unknown>);
}

function createEnv(): { ROOMS: FakeDurableObjectNamespace; ROOM_STATE_WRITE_TOKEN: string } {
  return {
    ROOMS: new FakeDurableObjectNamespace(),
    ROOM_STATE_WRITE_TOKEN: "secret-token"
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  let uuidCounter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
    getRandomValues: vi.fn((array: Uint8Array) => {
      array.fill(0);
      return array;
    })
  });
  rooms.clear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  rooms.clear();
  vi.resetModules();
});

describe("cloudflare gateway", () => {
  it("creates rooms, emits envelopes, and starts matches over one websocket", async () => {
    const storage = new FakeStorage();
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(socket as unknown as WebSocket);

    socket.receive(
      JSON.stringify({
        id: "msg-create",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice",
          sessionId: "session-alice"
        }
      })
    );

    const firstTwoMessages = parseMessages(socket).slice(0, 2);
    expect(firstTwoMessages[0]).toMatchObject({
      type: "server:ack",
      command: "client:room:create",
      payload: {
        ok: true,
        data: {
          roomCode: expect.any(String),
          playerId: expect.any(String),
          room: expect.objectContaining({
            roomCode: expect.any(String),
            status: "waiting"
          })
        }
      }
    });
    expect(firstTwoMessages[1]).toMatchObject({
      type: "server:room:state",
      payload: expect.objectContaining({
        roomCode: expect.any(String),
        status: "waiting"
      })
    });

    const roomCode = String((firstTwoMessages[0]?.payload as { data?: { roomCode?: string } })?.data?.roomCode ?? "");
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(storage.values.has(`room:${roomCode}`)).toBe(true);

    socket.receive(
      JSON.stringify({
        id: "msg-start",
        type: "client:match:start",
        payload: {
          roomCode
        }
      })
    );

    const messagesAfterStart = parseMessages(socket).slice(2);
    expect(messagesAfterStart[0]).toMatchObject({
      type: "server:ack",
      command: "client:match:start",
      payload: {
        ok: true,
        data: expect.objectContaining({
          roomCode,
          status: "countdown"
        })
      }
    });
    expect(messagesAfterStart[1]).toMatchObject({
      type: "server:match:countdown",
      payload: {
        room: expect.objectContaining({
          roomCode,
          status: "countdown"
        }),
        serverStartAt: expect.any(Number)
      }
    });
  });

  it("restores persisted room snapshots for state reads", async () => {
    const storage = new FakeStorage();
    storage.values.set("room:AB12CD", baseRoom);

    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    await gateway.ready;

    const response = await gateway.fetch(new Request("https://example.com/rooms/ab12cd/state"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      room: expect.objectContaining({
        roomCode: "AB12CD"
      })
    });
  });

  it("rejects malformed client payloads without throwing", async () => {
    const storage = new FakeStorage();
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(socket as unknown as WebSocket);

    socket.receive(
      JSON.stringify({
        id: "msg-bad",
        type: "client:room:create"
      })
    );

    expect(parseMessages(socket)[0]).toMatchObject({
      type: "server:error",
      payload: {
        message: "Invalid message payload."
      }
    });
  });

  it("restores countdown timers and bot progress after a restart", async () => {
    const storage = new FakeStorage();
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest-alice-restart",
      socketId: "socket-alice-restart"
    });

    const started = startMatch("socket-alice-restart", created.room.roomCode);

    expect("error" in started).toBe(false);
    if ("error" in started) {
      return;
    }

    storage.values.set(`room:${created.room.roomCode}`, started.room);

    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    await gateway.ready;
    expect(getRoom(created.room.roomCode)?.status).toBe("countdown");

    await vi.advanceTimersByTimeAsync(3_000);
    expect(getRoom(created.room.roomCode)?.status).toBe("playing");

    await vi.advanceTimersByTimeAsync(500);
    const restoredRoom = getRoom(created.room.roomCode);

    expect(restoredRoom?.players.some((player) => player.isBot && player.progressIndex > 0)).toBe(true);
  });
});

describe("worker handler", () => {
  it("rejects unauthorized state writes and forwards gateway requests", async () => {
    const env = createEnv();

    const forbidden = await worker.fetch(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(baseRoom)
      }),
      env as unknown as Env
    );

    expect(forbidden.status).toBe(403);
    expect(env.ROOMS.stub.fetchCalls).toBe(0);

    const forwarded = await worker.fetch(new Request("https://example.com/"), env as unknown as Env);

    expect(forwarded.status).toBe(200);
    expect(env.ROOMS.getByNameCalls).toEqual(["gateway"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
    expect(env.ROOMS.stub.lastRequest?.url).toBe("https://example.com/");
  });

  it("allows authorized state writes through to the gateway", async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request("https://example.com/rooms/ab12cd/state", {
        method: "PUT",
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json"
        },
        body: JSON.stringify(baseRoom)
      }),
      env as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(env.ROOMS.getByNameCalls).toEqual(["gateway"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
    expect(env.ROOMS.stub.lastRequest?.method).toBe("PUT");
  });
});
