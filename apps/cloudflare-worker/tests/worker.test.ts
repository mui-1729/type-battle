import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerState, RoomState } from "@type-battle/shared";
import { rooms } from "@type-battle/shared/room-engine";
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

  async list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    for (const [key, value] of this.values.entries()) {
      if (options?.prefix && !key.startsWith(options.prefix)) {
        continue;
      }

      result.set(key, value as T);
    }

    return result;
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

class FakeWebSocket {
  readyState = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((this: WebSocket, event: CloseEvent) => void) | null = null;
  readonly messages: string[] = [];
  shouldThrowOnSend = false;

  accept(): void {
    this.readyState = 1;
  }

  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error("socket is not open");
    }

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

const hydratedRoom: RoomState = {
  ...baseRoom,
  players: [createPlayerState()]
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

function parseMessages(socket: FakeWebSocket): Array<{ id: string; type: string; payload?: unknown; command?: string }> {
  return socket.messages.map((message) => JSON.parse(message) as { id: string; type: string; payload?: unknown; command?: string });
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createPlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "guest-alice",
    nickname: "Alice",
    connected: true,
    ready: false,
    isHost: true,
    isBot: false,
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    maxStreak: 0,
    currentStreak: 0,
    wpm: 0,
    accuracy: 100,
    ...overrides
  };
}

beforeEach(() => {
  rooms.clear();
});

afterEach(() => {
  rooms.clear();
  vi.useRealTimers();
});

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
    expect(storage.values.get("room-state:AB12CD")).toEqual(baseRoom);
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
    expect(storage.values.get("room-state:AB12CD")).toEqual(baseRoom);
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
    expect(storage.values.has("room-state:AB12CD")).toBe(false);
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

  it("rejects malformed websocket payloads without throwing", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const socket = new FakeWebSocket();
    durableObject.acceptSocket(socket as unknown as WebSocket);

    expect(() =>
      socket.receive(
        JSON.stringify({
          id: "bad-1",
          type: "client:room:create",
          payload: {
            guestId: "guest-alice-create",
            sessionId: "session-alice-create"
          }
        })
      )
    ).not.toThrow();

    await flushAsync();

    const messages = parseMessages(socket);
    expect(messages.some((message) => message.type === "server:error")).toBe(true);
    expect(rooms.size).toBe(0);
  });

  it("rehydrates persisted rooms before handling websocket joins", async () => {
    const storage = new FakeStorage();
    storage.values.set("room-state:AB12CD", hydratedRoom);

    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const socket = new FakeWebSocket();
    durableObject.acceptSocket(socket as unknown as WebSocket);

    socket.receive(
      JSON.stringify({
        id: "join-rehydrate-1",
        type: "client:room:join",
        payload: {
          roomCode: "AB12CD",
          nickname: "Alice",
          guestId: "guest-alice",
          sessionId: "session-alice"
        }
      })
    );

    await flushAsync();

    const messages = parseMessages(socket);
    const ack = messages.find((message) => message.type === "server:ack");

    expect(ack?.command).toBe("client:room:join");
    expect(rooms.get("AB12CD")?.players.get("guest-alice")?.connected).toBe(true);
  });

  it("acks ready, leave, and typing commands", async () => {
    vi.useFakeTimers();

    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const hostSocket = new FakeWebSocket();
    const joinerSocket = new FakeWebSocket();

    durableObject.acceptSocket(hostSocket as unknown as WebSocket);
    hostSocket.receive(
      JSON.stringify({
        id: "create-ack-1",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-ack",
          sessionId: "session-alice-ack"
        }
      })
    );
    await flushAsync();

    const roomCode = (parseMessages(hostSocket).find((message) => message.id === "create-ack-1" && message.type === "server:ack")?.payload as { data?: { roomCode?: string } } | undefined)?.data?.roomCode;
    expect(roomCode).toBeDefined();
    if (!roomCode) {
      throw new Error("expected room code");
    }

    durableObject.acceptSocket(joinerSocket as unknown as WebSocket);
    joinerSocket.receive(
      JSON.stringify({
        id: "join-ack-1",
        type: "client:room:join",
        payload: {
          roomCode,
          nickname: "Bob",
          guestId: "guest-bob-ack",
          sessionId: "session-bob-ack"
        }
      })
    );
    await flushAsync();

    hostSocket.receive(
      JSON.stringify({
        id: "ready-ack-1",
        type: "client:player:ready",
        payload: {
          roomCode,
          ready: true
        }
      })
    );
    await flushAsync();

    const hostMessagesAfterReady = parseMessages(hostSocket);
    expect(hostMessagesAfterReady.some((message) => message.id === "ready-ack-1" && message.type === "server:ack" && (message.payload as { ok?: boolean } | undefined)?.ok)).toBe(true);

    hostSocket.receive(
      JSON.stringify({
        id: "start-ack-1",
        type: "client:match:start",
        payload: {
          roomCode
        }
      })
    );
    await flushAsync();
    await vi.advanceTimersByTimeAsync(3_000);

    hostSocket.receive(
      JSON.stringify({
        id: "typing-progress-1",
        type: "client:typing:progress",
        payload: {
          roomCode,
          progressIndex: 1,
          correctCharacters: 1,
          totalTypedCharacters: 1,
          mistakes: 0
        }
      })
    );
    await flushAsync();

    hostSocket.receive(
      JSON.stringify({
        id: "typing-finish-1",
        type: "client:typing:finish",
        payload: {
          roomCode,
          progressIndex: 1,
          correctCharacters: 1,
          totalTypedCharacters: 1,
          mistakes: 0
        }
      })
    );
    await flushAsync();

    const hostMessagesAfterTyping = parseMessages(hostSocket);

    joinerSocket.receive(
      JSON.stringify({
        id: "leave-ack-1",
        type: "client:room:leave",
        payload: {
          roomCode
        }
      })
    );
    await flushAsync();

    const joinerMessages = parseMessages(joinerSocket);
    expect(joinerMessages.some((message) => message.id === "leave-ack-1" && message.type === "server:ack")).toBe(true);
    expect(hostMessagesAfterTyping.some((message) => message.id === "typing-progress-1" && message.type === "server:ack")).toBe(true);
    expect(hostMessagesAfterTyping.some((message) => message.id === "typing-finish-1" && message.type === "server:ack")).toBe(true);
  });

  it("cleans up the previous room when the same socket creates a new room", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const socket = new FakeWebSocket();
    durableObject.acceptSocket(socket as unknown as WebSocket);

    socket.receive(
      JSON.stringify({
        id: "create-old-1",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-create-old",
          sessionId: "session-alice-create-old"
        }
      })
    );
    await flushAsync();

    const firstAck = parseMessages(socket).find((message) => message.id === "create-old-1" && message.type === "server:ack");
    const firstRoomCode = (firstAck?.payload as { data?: { roomCode?: string } } | undefined)?.data?.roomCode;

    expect(firstRoomCode).toBeDefined();
    if (!firstRoomCode) {
      throw new Error("expected first room code");
    }

    socket.receive(
      JSON.stringify({
        id: "create-new-1",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-create-new",
          sessionId: "session-alice-create-new"
        }
      })
    );
    await flushAsync();

    expect(rooms.has(firstRoomCode)).toBe(false);
  });

  it("removes disconnected sockets from the engine when a broadcast fails", async () => {
    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const hostSocket = new FakeWebSocket();
    const joinerSocket = new FakeWebSocket();

    durableObject.acceptSocket(hostSocket as unknown as WebSocket);
    hostSocket.receive(
      JSON.stringify({
        id: "create-broadcast-1",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-broadcast",
          sessionId: "session-alice-broadcast"
        }
      })
    );
    await flushAsync();

    const roomCode = (parseMessages(hostSocket).find((message) => message.id === "create-broadcast-1" && message.type === "server:ack")?.payload as { data?: { roomCode?: string } } | undefined)?.data?.roomCode;

    expect(roomCode).toBeDefined();
    if (!roomCode) {
      throw new Error("expected room code");
    }

    durableObject.acceptSocket(joinerSocket as unknown as WebSocket);
    joinerSocket.receive(
      JSON.stringify({
        id: "join-broadcast-1",
        type: "client:room:join",
        payload: {
          roomCode,
          nickname: "Bob",
          guestId: "guest-bob-broadcast",
          sessionId: "session-bob-broadcast"
        }
      })
    );
    await flushAsync();

    joinerSocket.shouldThrowOnSend = true;

    hostSocket.receive(
      JSON.stringify({
        id: "set-broadcast-1",
        type: "client:room:setPromptCategory",
        payload: {
          roomCode,
          category: "long"
        }
      })
    );
    await flushAsync();

    expect(rooms.get(roomCode)?.players.has("guest-bob-broadcast")).toBe(false);
  });

  it("creates rooms, joins players, and starts countdowns over websockets", async () => {
    vi.useFakeTimers();

    const storage = new FakeStorage();
    const durableObject = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    const hostSocket = new FakeWebSocket();
    const joinerSocket = new FakeWebSocket();

    durableObject.acceptSocket(hostSocket as unknown as WebSocket);

    hostSocket.receive(
      JSON.stringify({
        id: "create-1",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-create",
          sessionId: "session-alice-create"
        }
      })
    );
    await flushAsync();

    const hostMessagesAfterCreate = parseMessages(hostSocket);
    const createAck = hostMessagesAfterCreate.find((message) => message.type === "server:ack");

    expect(createAck?.command).toBe("client:room:create");
    expect(hostMessagesAfterCreate.some((message) => message.type === "server:room:state")).toBe(true);

    const createAckPayload = createAck?.payload as { ok?: boolean; data?: { room: RoomState; roomCode: string; playerId: string } } | undefined;
    const roomCode = createAckPayload?.data?.roomCode ?? baseRoom.roomCode;

    durableObject.acceptSocket(joinerSocket as unknown as WebSocket);
    joinerSocket.receive(
      JSON.stringify({
        id: "join-1",
        type: "client:room:join",
        payload: {
          roomCode,
          nickname: "Bob",
          guestId: "guest-bob-join",
          sessionId: "session-bob-join"
        }
      })
    );
    await flushAsync();

    const joinerMessages = parseMessages(joinerSocket);
    const joinAck = joinerMessages.find((message) => message.type === "server:ack");

    expect(joinAck?.command).toBe("client:room:join");
    expect(joinerMessages.some((message) => message.type === "server:room:state")).toBe(true);

    hostSocket.receive(
      JSON.stringify({
        id: "start-1",
        type: "client:match:start",
        payload: {
          roomCode
        }
      })
    );
    await flushAsync();

    const countdownMessages = parseMessages(hostSocket).filter((message) => message.type === "server:match:countdown");
    expect(countdownMessages).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(3_000);

    const hostEvents = parseMessages(hostSocket);
    const joinerEvents = parseMessages(joinerSocket);

    expect(hostEvents.some((message) => message.type === "server:match:started")).toBe(true);
    expect(joinerEvents.some((message) => message.type === "server:match:started")).toBe(true);
  });
});

describe("worker handler", () => {
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

  it("forwards authorized state writes to the realtime DO", async () => {
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
    expect(env.ROOMS.ids).toEqual(["realtime"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
    expect(env.ROOMS.stub.lastRequest?.method).toBe("POST");
  });

  it("routes websocket connections through the realtime DO", async () => {
    const env = createEnv();
    const response = await fetchWorker(
      new Request("https://example.com/", {
        method: "GET",
        headers: {
          Upgrade: "websocket"
        }
      }) as Request,
      env as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(env.ROOMS.ids).toEqual(["realtime"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
  });
});
