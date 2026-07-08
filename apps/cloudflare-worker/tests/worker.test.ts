import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomState } from "@type-battle/shared";
import {
  createRoom,
  getRoom,
  markPlaying,
  resetRoomEngineState,
  rooms,
  startMatch
} from "@type-battle/shared/room-engine";
import type { Env } from "../src/worker.js";
import worker, { RoomDurableObject } from "../src/worker.js";

class FakeStorage {
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;
  failAlarmWrites = false;

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

  async setAlarm(timestamp: number): Promise<void> {
    if (this.failAlarmWrites) {
      throw new Error("setAlarm failed");
    }

    this.alarmAt = timestamp;
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmAt;
  }

  async deleteAlarm(): Promise<void> {
    if (this.failAlarmWrites) {
      throw new Error("deleteAlarm failed");
    }

    this.alarmAt = null;
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

function findLastAck(
  socket: FakeSocket,
  command: string
): Record<string, unknown> | undefined {
  return [...parseMessages(socket)]
    .reverse()
    .find((message) => message.type === "server:ack" && message.command === command);
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
      for (let index = 0; index < array.length; index += 1) {
        array[index] = (uuidCounter + index) % 256;
      }
      uuidCounter += 1;
      return array;
    })
  });
  resetRoomEngineState();
});

afterEach(async () => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetRoomEngineState();
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

  it("rejects malformed payloads and applies room rate limits", async () => {
    const storage = new FakeStorage();
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const creatorSocket = new FakeSocket();
    const joinerSocket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(creatorSocket as unknown as WebSocket, {
      clientIp: "127.0.0.1"
    });
    gateway.attachSocket(joinerSocket as unknown as WebSocket, {
      clientIp: "127.0.0.1"
    });

    creatorSocket.receive(
      JSON.stringify({
        id: "msg-invalid",
        type: "client:room:create",
        payload: {
          nickname: 123,
          guestId: "guest-invalid",
          sessionId: "session-invalid"
        }
      })
    );

    expect(findLastAck(creatorSocket, "client:room:create")).toMatchObject({
      type: "server:ack",
      command: "client:room:create",
      payload: {
        ok: false,
        error: "リクエストの形式が正しくありません。"
      }
    });

    let roomCode = "";
    for (let index = 0; index < 10; index += 1) {
      creatorSocket.receive(
        JSON.stringify({
          id: `msg-create-${index}`,
          type: "client:room:create",
          payload: {
            nickname: `Alice ${index}`,
            guestId: "guest-create-limit",
            sessionId: "session-create-limit"
          }
        })
      );

      const message = findLastAck(creatorSocket, "client:room:create");
      expect(message).toMatchObject({
        type: "server:ack",
        command: "client:room:create",
        payload: {
          ok: true
        }
      });

      if (!roomCode) {
        roomCode = String((message?.payload as { data?: { roomCode?: string } })?.data?.roomCode ?? "");
      }
    }

    creatorSocket.receive(
      JSON.stringify({
        id: "msg-create-over-limit",
        type: "client:room:create",
        payload: {
          nickname: "Alice over",
          guestId: "guest-create-limit",
          sessionId: "session-create-limit"
        }
      })
    );

    expect(findLastAck(creatorSocket, "client:room:create")).toMatchObject({
      type: "server:ack",
      command: "client:room:create",
      payload: {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
      }
    });

    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    const initialMessageCount = joinerSocket.messages.length;
    for (let index = 0; index < 30; index += 1) {
      joinerSocket.receive(
        JSON.stringify({
          id: `msg-join-${index}`,
          type: "client:room:join",
          payload: {
            roomCode,
            nickname: `Bob ${index}`,
            guestId: "guest-join-limit",
            sessionId: "session-join-limit"
          }
        })
      );
    }

    expect(findLastAck(joinerSocket, "client:room:join")).toMatchObject({
      type: "server:ack",
      command: "client:room:join",
      payload: {
        ok: true
      }
    });

    joinerSocket.receive(
      JSON.stringify({
        id: "msg-join-over-limit",
        type: "client:room:join",
        payload: {
          roomCode,
          nickname: "Bob over",
          guestId: "guest-join-limit",
          sessionId: "session-join-limit"
        }
      })
    );

    expect(findLastAck(joinerSocket, "client:room:join")).toMatchObject({
      type: "server:ack",
      command: "client:room:join",
      payload: {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
      }
    });
    expect(joinerSocket.messages.length - initialMessageCount).toBeGreaterThanOrEqual(30);
  });

  it("drops over-limit typing progress updates without crashing", async () => {
    const storage = new FakeStorage();
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(socket as unknown as WebSocket, {
      clientIp: "127.0.0.1"
    });

    socket.receive(
      JSON.stringify({
        id: "msg-create-progress",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-progress",
          sessionId: "session-progress"
        }
      })
    );

    const createAck = findLastAck(socket, "client:room:create");
    const roomCode = String((createAck?.payload as { data?: { roomCode?: string } })?.data?.roomCode ?? "");
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    socket.receive(
      JSON.stringify({
        id: "msg-start-progress",
        type: "client:match:start",
        payload: {
          roomCode
        }
      })
    );

    markPlaying(roomCode);
    const messageCountBeforeProgress = socket.messages.length;

    for (let index = 0; index < 31; index += 1) {
      socket.receive(
        JSON.stringify({
          id: `msg-progress-${index}`,
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
    }

    await Promise.resolve();

    expect(socket.messages.length - messageCountBeforeProgress).toBe(30);
  });

  it("rejects wrong-session rejoins and invalidates the previous socket after a successful rejoin", async () => {
    const storage = new FakeStorage();
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const originalSocket = new FakeSocket();
    const wrongSessionSocket = new FakeSocket();
    const rejoinSocket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(originalSocket as unknown as WebSocket);
    gateway.attachSocket(wrongSessionSocket as unknown as WebSocket);
    gateway.attachSocket(rejoinSocket as unknown as WebSocket);

    originalSocket.receive(
      JSON.stringify({
        id: "msg-create",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-rejoin",
          sessionId: "session-alice"
        }
      })
    );

    const createAck = findLastAck(originalSocket, "client:room:create");
    const roomCode = String((createAck?.payload as { data?: { roomCode?: string } })?.data?.roomCode ?? "");

    wrongSessionSocket.receive(
      JSON.stringify({
        id: "msg-join-wrong",
        type: "client:room:join",
        payload: {
          roomCode,
          nickname: "Alice",
          guestId: "guest-alice-rejoin",
          sessionId: "session-intruder"
        }
      })
    );

    expect(findLastAck(wrongSessionSocket, "client:room:join")).toMatchObject({
      type: "server:ack",
      command: "client:room:join",
      payload: {
        ok: false,
        error: expect.stringContaining("別のセッション")
      }
    });

    rejoinSocket.receive(
      JSON.stringify({
        id: "msg-join-right",
        type: "client:room:join",
        payload: {
          roomCode,
          nickname: "Alice",
          guestId: "guest-alice-rejoin",
          sessionId: "session-alice"
        }
      })
    );

    expect(findLastAck(rejoinSocket, "client:room:join")).toMatchObject({
      type: "server:ack",
      command: "client:room:join",
      payload: {
        ok: true,
        data: {
          playerId: "guest-alice-rejoin"
        }
      }
    });

    rejoinSocket.receive(
      JSON.stringify({
        id: "msg-ready-new",
        type: "client:player:ready",
        payload: {
          roomCode,
          ready: true
        }
      })
    );

    await Promise.resolve();
    expect(getRoom(roomCode)?.players.find((player) => player.id === "guest-alice-rejoin")?.ready).toBe(true);
  });

  it("schedules an alarm and forfeits a disconnected player after durable object eviction", async () => {
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
          guestId: "guest-alice-forfeit",
          sessionId: "session-alice"
        }
      })
    );

    const createAck = findLastAck(socket, "client:room:create");
    const roomCode = String((createAck?.payload as { data?: { roomCode?: string } })?.data?.roomCode ?? "");

    socket.receive(
      JSON.stringify({
        id: "msg-start",
        type: "client:match:start",
        payload: {
          roomCode
        }
      })
    );

    markPlaying(roomCode);
    socket.close();
    await Promise.resolve();

    const storageKey = `room:${roomCode}`;
    const snapshot = storage.values.get(storageKey) as
      | { room?: RoomState; disconnectedAt?: Record<string, number> }
      | undefined;

    expect(snapshot?.room?.roomCode).toBe(roomCode);

    if (snapshot?.room && snapshot.disconnectedAt) {
      snapshot.disconnectedAt["guest-alice-forfeit"] = Date.now() - 40_000;
      storage.values.set(storageKey, snapshot);
    }

    const restoredGateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    await restoredGateway.ready;
    expect(storage.alarmAt).not.toBeNull();
    expect(rooms.get(roomCode)?.players.get("guest-alice-forfeit")?.disconnectedAt).toBeDefined();

    await restoredGateway.alarm();

    const updatedRoom = getRoom(roomCode);
    expect(updatedRoom?.status).toBe("finished");
    expect(updatedRoom?.players.find((player) => player.id === "guest-alice-forfeit")?.forfeited).toBe(true);
  });

  it("restores human players as disconnected until the same session rejoins", async () => {
    const storage = new FakeStorage();
    const activeRoom: RoomState = {
      ...baseRoom,
      roomCode: "RS1234",
      hostPlayerId: "guest-alice-restore",
      status: "playing",
      players: [
        {
          id: "guest-alice-restore",
          nickname: "Alice",
          connected: true,
          ready: true,
          isHost: true,
          isBot: false,
          deviceKind: "desktop",
          progressIndex: 0,
          correctCharacters: 0,
          totalTypedCharacters: 0,
          mistakes: 0,
          wpm: 0,
          accuracy: 100,
          currentStreak: 0,
          maxStreak: 0
        }
      ]
    };

    storage.values.set("room:RS1234", {
      room: activeRoom,
      playerSessions: {
        "guest-alice-restore": "session-alice-restore"
      },
      disconnectedAt: {}
    });

    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await gateway.ready;

    const restoredPlayer = rooms.get("RS1234")?.players.get("guest-alice-restore");
    expect(restoredPlayer).toMatchObject({
      connected: false,
      ready: false,
      disconnectedAt: expect.any(Number)
    });

    gateway.attachSocket(socket as unknown as WebSocket);
    socket.receive(
      JSON.stringify({
        id: "msg-rejoin-restored",
        type: "client:room:join",
        payload: {
          roomCode: "RS1234",
          nickname: "Alice",
          guestId: "guest-alice-restore",
          sessionId: "session-alice-restore"
        }
      })
    );

    expect(findLastAck(socket, "client:room:join")).toMatchObject({
      type: "server:ack",
      payload: {
        ok: true
      }
    });
    expect(getRoom("RS1234")?.players.find((player) => player.id === "guest-alice-restore")).toMatchObject({
      connected: true
    });
    expect(rooms.get("RS1234")?.players.get("guest-alice-restore")?.disconnectedAt).toBeUndefined();
  });

  it("runs maintenance from a bounded fallback when alarm registration fails", async () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    storage.failAlarmWrites = true;
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(socket as unknown as WebSocket);

    socket.receive(
      JSON.stringify({
        id: "msg-create-fallback",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-fallback",
          sessionId: "session-alice-fallback"
        }
      })
    );

    const createAck = findLastAck(socket, "client:room:create");
    const roomCode = String((createAck?.payload as { data?: { roomCode?: string } })?.data?.roomCode ?? "");
    socket.receive(
      JSON.stringify({
        id: "msg-start-fallback",
        type: "client:match:start",
        payload: {
          roomCode
        }
      })
    );

    markPlaying(roomCode);
    socket.close();
    await Promise.resolve();

    const player = rooms.get(roomCode)?.players.get("guest-alice-fallback");
    if (player) {
      player.disconnectedAt = Date.now() - 40_000;
    }

    await vi.advanceTimersByTimeAsync(5_000);

    const updatedRoom = getRoom(roomCode);
    expect(updatedRoom?.status).toBe("finished");
    expect(updatedRoom?.players.find((player) => player.id === "guest-alice-fallback")?.forfeited).toBe(true);
  });

  it("rejects invalid typing metric values", async () => {
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
          guestId: "guest-alice-typing",
          sessionId: "session-alice"
        }
      })
    );

    const createAck = findLastAck(socket, "client:room:create");
    const roomCode = String((createAck?.payload as { data?: { roomCode?: string } })?.data?.roomCode ?? "");

    socket.receive(
      JSON.stringify({
        id: "msg-start",
        type: "client:match:start",
        payload: {
          roomCode
        }
      })
    );

    markPlaying(roomCode);

    socket.receive(
      JSON.stringify({
        id: "msg-progress-negative",
        type: "client:typing:progress",
        payload: {
          roomCode,
          progressIndex: -1,
          correctCharacters: 0,
          totalTypedCharacters: 0,
          mistakes: 0
        }
      })
    );

    expect(parseMessages(socket).at(-1)).toMatchObject({
      type: "server:error",
      payload: {
        message: "リクエストの形式が正しくありません。"
      }
    });

    socket.receive(
      JSON.stringify({
        id: "msg-progress-invalid",
        type: "client:typing:progress",
        payload: {
          roomCode,
          progressIndex: 1,
          correctCharacters: 3,
          totalTypedCharacters: 2,
          mistakes: 0
        }
      })
    );

    expect(parseMessages(socket).at(-1)).toMatchObject({
      type: "server:error",
      payload: {
        message: "リクエストの形式が正しくありません。"
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

    vi.useFakeTimers();
    try {
      await gateway.ready;
      expect(getRoom(created.room.roomCode)?.status).toBe("countdown");

      await vi.advanceTimersByTimeAsync(3_000);
      expect(getRoom(created.room.roomCode)?.status).toBe("playing");

      await vi.advanceTimersByTimeAsync(500);
      const restoredRoom = getRoom(created.room.roomCode);

      expect(restoredRoom?.players.some((player) => player.isBot && player.progressIndex > 0)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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
