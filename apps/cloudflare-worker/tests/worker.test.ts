import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRomajiTypingPlan, type RoomState } from "@type-battle/shared";
import { resetRoomEngineState } from "@type-battle/shared/room-engine";
import type { Env } from "../src/worker.js";
import worker, { RoomAuthorityDurableObject, RoomDurableObject } from "../src/worker.js";
import { GATEWAY_ROOM_RATE_LIMIT_PATH } from "../src/realtime-gateway.js";
import { readCloudflareClientIp } from "../src/client-ip.js";

class FakeStorage {
  readonly values = new Map<string, unknown>();
  readonly failPutPrefixes = new Set<string>();
  alarmAt: number | null = null;
  failAlarmWrites = false;
  roomPutGate: Promise<void> | null = null;

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
    if (key === "room" && this.roomPutGate) {
      await this.roomPutGate;
    }
    if ([...this.failPutPrefixes].some((prefix) => key.startsWith(prefix))) {
      throw new Error(`put failed for ${key}`);
    }

    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
  }

  async transaction<T>(callback: (transaction: FakeStorage) => Promise<T>): Promise<T> {
    return await callback(this);
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
  readonly backgroundWork: Promise<unknown>[] = [];

  constructor(public readonly storage: FakeStorage) {}

  async blockConcurrencyWhile<T>(callback: () => Promise<T> | T): Promise<T> {
    return await callback();
  }

  waitUntil(promise: Promise<unknown>): void {
    this.backgroundWork.push(promise);
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

type RateLimitInput = {
  action: "create" | "join";
  clientIp: string;
  guestId: string;
};

type RateLimitResult = { ok: true } | { ok: false; error: string };

class FakeGatewayRateLimitStub {
  readonly calls: RateLimitInput[] = [];
  responseGate: Promise<void> | null = null;
  readonly responseGates: Array<Promise<void> | null> = [];

  constructor(private readonly maxPerGuestAction: number) {}

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);

    if (url.pathname !== GATEWAY_ROOM_RATE_LIMIT_PATH) {
      return new Response("Not found", { status: 404 });
    }

    const payload = await request.json() as Partial<RateLimitInput>;

    if (
      (payload.action !== "create" && payload.action !== "join") ||
      typeof payload.clientIp !== "string" ||
      typeof payload.guestId !== "string"
    ) {
      return Response.json({ ok: false, error: "invalid rate limit request" } satisfies RateLimitResult, {
        status: 400
      });
    }

    const rateLimitInput: RateLimitInput = {
      action: payload.action,
      clientIp: payload.clientIp,
      guestId: payload.guestId
    };
    this.calls.push(rateLimitInput);
    const responseGate = this.responseGates[this.calls.length - 1] ?? this.responseGate;
    if (responseGate) {
      await responseGate;
    }
    const callCount = this.calls.filter(
      (call) => call.action === rateLimitInput.action && call.guestId === rateLimitInput.guestId
    ).length;

    if (callCount > this.maxPerGuestAction) {
      return Response.json({ ok: false, error: "central limited" } satisfies RateLimitResult);
    }

    return Response.json({ ok: true } satisfies RateLimitResult);
  }
}

class FakeGatewayRateLimitNamespace {
  readonly getByNameCalls: string[] = [];
  readonly stub: FakeGatewayRateLimitStub;

  constructor(maxPerGuestAction: number) {
    this.stub = new FakeGatewayRateLimitStub(maxPerGuestAction);
  }

  getByName(name: string): FakeGatewayRateLimitStub {
    this.getByNameCalls.push(name);
    return this.stub;
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
  roomCode: "AB23CD",
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

function sendTypingInput(socket: FakeSocket, roomCode: string, input: string): void {
  const chunks = input.match(/.{1,8}/g) ?? [];

  chunks.forEach((chunk, index) => {
    socket.receive(
      JSON.stringify({
        id: `msg-typing-${index + 1}`,
        type: index === chunks.length - 1 ? "client:typing:finish" : "client:typing:progress",
        payload: {
          roomCode,
          input: chunk,
          sequence: index + 1
        }
      })
    );
  });
}

function getCountdownRoom(socket: FakeSocket): RoomState {
  const message = parseMessages(socket).find((entry) => entry.type === "server:match:countdown");
  return (message?.payload as { room?: RoomState } | undefined)?.room as RoomState;
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

function createEnv(): {
  GATEWAY: FakeDurableObjectNamespace;
  ROOMS: FakeDurableObjectNamespace;
  ROOM_STATE_WRITE_TOKEN: string;
} {
  return {
    GATEWAY: new FakeDurableObjectNamespace(),
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
  it("uses only the Cloudflare client IP header for rate-limit identity", () => {
    expect(readCloudflareClientIp(new Headers({ "CF-Connecting-IP": "203.0.113.10" }))).toBe("203.0.113.10");
    expect(readCloudflareClientIp(new Headers({ "X-Forwarded-For": "198.51.100.10" }))).toBe("unknown");
    expect(readCloudflareClientIp(new Headers({
      "CF-Connecting-IP": " 203.0.113.10 ",
      "X-Forwarded-For": "198.51.100.10"
    }))).toBe("203.0.113.10");
  });

  it("rejects room lifecycle commands on the root websocket", async () => {
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(socket as unknown as WebSocket);

    socket.receive(
      JSON.stringify({
        id: "msg-root-create",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice",
          sessionId: "session-alice"
        }
      })
    );
    await flushAsyncWork();

    expect(findLastAck(socket, "client:room:create")).toMatchObject({
      type: "server:ack",
      command: "client:room:create",
      payload: {
        ok: false,
        error: "Room commands must use /rooms/:roomCode/socket."
      }
    });

    socket.receive(JSON.stringify({
      id: "msg-root-reaction",
      type: "client:player:reaction",
      payload: { roomCode: "AB23CD", reaction: "ナイス" }
    }));
    socket.receive(JSON.stringify({
      id: "msg-root-accessory",
      type: "client:player:accessory",
      payload: { roomCode: "AB23CD", accessoryIndex: 1 }
    }));
    await flushAsyncWork();

    expect(findLastAck(socket, "client:player:reaction")).toMatchObject({
      payload: { ok: false, error: "Room commands must use /rooms/:roomCode/socket." }
    });
    expect(parseMessages(socket)).toContainEqual(expect.objectContaining({
      type: "server:error",
      payload: { message: "Room commands must use /rooms/:roomCode/socket." }
    }));
  });

  it("serializes gateway socket events and continues after a rejected event", async () => {
    const state = new FakeDurableObjectState(new FakeStorage());
    const gateway = new RoomDurableObject(state as unknown as DurableObjectState);
    const socket = new FakeSocket();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const internals = gateway as unknown as {
      handleSocketMessage(socketId: string, data: unknown): Promise<void>;
      detachSocket(socketId: string): void;
    };
    let messageCount = 0;
    const originalDetachSocket = internals.detachSocket.bind(gateway);
    internals.handleSocketMessage = async () => {
      messageCount += 1;
      events.push(`message-${messageCount}:start`);
      if (messageCount === 1) {
        await gate;
        throw new Error("injected failure");
      }
      events.push(`message-${messageCount}:end`);
    };
    internals.detachSocket = (socketId) => {
      events.push("close");
      originalDetachSocket(socketId);
    };

    await gateway.ready;
    gateway.attachSocket(socket as unknown as WebSocket);
    socket.receive("first");
    socket.receive("second");
    socket.close();
    await flushAsyncWork();
    expect(events).toEqual(["message-1:start"]);

    release();
    await flushAsyncWork();
    expect(events).toEqual([
      "message-1:start",
      "message-2:start",
      "message-2:end",
      "close"
    ]);
    expect(state.backgroundWork.length).toBeGreaterThanOrEqual(3);
  });

  it("closes idle gateway sockets and rejects connections over the limit", async () => {
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const idleSocket = new FakeSocket();

    await gateway.ready;
    gateway.attachSocket(idleSocket as unknown as WebSocket);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(idleSocket.readyState).toBe(3);

    const sockets = Array.from({ length: 256 }, () => new FakeSocket());
    sockets.forEach((socket) => gateway.attachSocket(socket as unknown as WebSocket));
    const rejectedSocket = new FakeSocket();
    gateway.attachSocket(rejectedSocket as unknown as WebSocket);

    expect(rejectedSocket.accepted).toBe(true);
    expect(rejectedSocket.readyState).toBe(3);
  });

  it("reports readiness from durable object storage", async () => {
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );

    await gateway.ready;
    const response = await gateway.fetch(new Request("https://example.com/ready"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      check: "readiness"
    });
  });

  it("does not expose room state from the root gateway durable object", async () => {
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );

    await gateway.ready;
    const response = await gateway.fetch(new Request("https://example.com/rooms/ab23cd/state"));

    expect(response.status).toBe(410);
    await expect(response.text()).resolves.toBe("Room state is handled by room authority.");
  });
});

describe("room authority", () => {
  it("serializes room commands across delayed rate limiting", async () => {
    const storage = new FakeStorage();
    const gateway = new FakeGatewayRateLimitNamespace(10);
    let release!: () => void;
    gateway.stub.responseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState,
      { GATEWAY: gateway }
    );
    const socket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(socket as unknown as WebSocket, { roomCode: "SQ23RS" });
    socket.receive(JSON.stringify({
      id: "msg-create-serialized",
      type: "client:room:create",
      payload: {
        nickname: "Alice",
        guestId: "guest-serialized",
        sessionId: "session-serialized"
      }
    }));
    socket.receive(JSON.stringify({
      id: "msg-ready-serialized",
      type: "client:player:ready",
      payload: { roomCode: "SQ23RS", ready: true }
    }));
    await flushAsyncWork();
    expect(storage.values.get("room")).toBeUndefined();

    release();
    await flushAsyncWork();
    expect(storage.values.get("room")).toMatchObject({
      room: {
        players: [expect.objectContaining({ id: "guest-serialized", ready: true })]
      }
    });
  });

  it("runs maintenance after an already in-flight socket command", async () => {
    const storage = new FakeStorage();
    const gateway = new FakeGatewayRateLimitNamespace(10);
    let release!: () => void;
    gateway.stub.responseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState,
      { GATEWAY: gateway }
    );
    const socket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(socket as unknown as WebSocket, { roomCode: "AM23NT" });
    socket.receive(JSON.stringify({
      id: "msg-create-before-maintenance",
      type: "client:room:create",
      payload: {
        nickname: "Alice",
        guestId: "guest-before-maintenance",
        sessionId: "session-before-maintenance"
      }
    }));

    let maintenanceSettled = false;
    const maintenance = roomAuthority.alarm().then(() => {
      maintenanceSettled = true;
    });
    await flushAsyncWork();
    expect(maintenanceSettled).toBe(false);

    release();
    await maintenance;
    expect(storage.values.get("room")).toMatchObject({
      room: {
        players: [expect.objectContaining({ id: "guest-before-maintenance" })]
      }
    });
  });

  it("persists room rate limits across instances and releases them after the fixed window", async () => {
    const storage = new FakeStorage();
    const firstGateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const request = (guestId: string) => new Request(
      `https://type-battle.internal${GATEWAY_ROOM_RATE_LIMIT_PATH}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          clientIp: "203.0.113.10",
          guestId
        })
      }
    );

    await firstGateway.ready;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await firstGateway.fetch(request("guest-persisted-limit"));
      await expect(response.json()).resolves.toEqual({ ok: true });
    }

    const secondGateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    await secondGateway.ready;
    const limitedResponse = await secondGateway.fetch(request("guest-persisted-limit"));
    await expect(limitedResponse.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("Guest")
    });

    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    await secondGateway.alarm();
    expect([...storage.values.keys()].filter((key) => key.startsWith("rate-limit:v1:"))).toHaveLength(0);
    expect(storage.alarmAt).toBeNull();

    const releasedResponse = await secondGateway.fetch(request("guest-persisted-limit"));
    await expect(releasedResponse.json()).resolves.toEqual({ ok: true });

    expect([...storage.values.keys()].filter((key) => key.startsWith("rate-limit:v1:"))).toHaveLength(2);
    expect(storage.alarmAt).toEqual(expect.any(Number));
  });

  it("starts a fresh rate-limit window exactly at the persisted reset time", async () => {
    const storage = new FakeStorage();
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const request = () => new Request(
      `https://type-battle.internal${GATEWAY_ROOM_RATE_LIMIT_PATH}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          clientIp: "203.0.113.11",
          guestId: "guest-reset-boundary"
        })
      }
    );

    await gateway.ready;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await gateway.fetch(request());
    }
    await expect((await gateway.fetch(request())).json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("Guest")
    });

    const resetAt = storage.alarmAt;
    expect(resetAt).toEqual(expect.any(Number));
    vi.setSystemTime(resetAt!);

    await expect((await gateway.fetch(request())).json()).resolves.toEqual({ ok: true });
  });

  it("continues consuming the IP quota when the guest quota rejects a request", async () => {
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const request = (guestId: string) => new Request(
      `https://type-battle.internal${GATEWAY_ROOM_RATE_LIMIT_PATH}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          clientIp: "198.51.100.20",
          guestId
        })
      }
    );

    await gateway.ready;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await gateway.fetch(request("guest-exhausts-ip"));
    }

    const response = await gateway.fetch(request("fresh-guest-on-exhausted-ip"));
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("IP")
    });
  });

  it("preserves arrival order across sockets when an earlier join is delayed", async () => {
    const storage = new FakeStorage();
    const gateway = new FakeGatewayRateLimitNamespace(10);
    const state = new FakeDurableObjectState(storage);
    const roomAuthority = new RoomAuthorityDurableObject(
      state as unknown as DurableObjectState,
      { GATEWAY: gateway }
    );
    const hostSocket = new FakeSocket();
    const firstGuestSocket = new FakeSocket();
    const secondGuestSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(hostSocket as unknown as WebSocket, { roomCode: "JK23LM" });
    hostSocket.receive(JSON.stringify({
      id: "msg-create-cross-socket-order",
      type: "client:room:create",
      payload: {
        nickname: "Host",
        guestId: "guest-cross-socket-host",
        sessionId: "session-cross-socket-host"
      }
    }));
    await state.backgroundWork[0];

    let releaseFirstJoin!: () => void;
    gateway.stub.responseGates[1] = new Promise<void>((resolve) => {
      releaseFirstJoin = resolve;
    });
    roomAuthority.attachSocket(firstGuestSocket as unknown as WebSocket, { roomCode: "JK23LM" });
    roomAuthority.attachSocket(secondGuestSocket as unknown as WebSocket, { roomCode: "JK23LM" });
    const joinMessage = {
      type: "client:room:join",
      payload: {
        roomCode: "JK23LM",
        nickname: "Guest",
        guestId: "guest-cross-socket-player",
        sessionId: "session-cross-socket-player"
      }
    };
    firstGuestSocket.receive(JSON.stringify({ id: "msg-first-delayed-join", ...joinMessage }));
    secondGuestSocket.receive(JSON.stringify({ id: "msg-second-later-join", ...joinMessage }));
    // This is received before the replacement closes the first socket, but it
    // executes after that socket has been detached. It must not steal the
    // session back from the second socket.
    firstGuestSocket.receive(JSON.stringify({ id: "msg-stale-first-rejoin", ...joinMessage }));
    await vi.waitFor(() => {
      expect(gateway.stub.calls).toHaveLength(2);
    });
    expect(firstGuestSocket.readyState).toBe(1);
    expect(secondGuestSocket.readyState).toBe(1);

    releaseFirstJoin();
    await vi.waitFor(() => {
      expect(gateway.stub.calls).toHaveLength(3);
      expect(firstGuestSocket.readyState).toBe(3);
    });
    expect(secondGuestSocket.readyState).toBe(1);

    secondGuestSocket.receive(JSON.stringify({
      id: "msg-ready-from-final-active-socket",
      type: "client:player:ready",
      payload: { roomCode: "JK23LM", ready: true }
    }));
    await flushAsyncWork();
    expect(storage.values.get("room")).toMatchObject({
      room: {
        players: expect.arrayContaining([
          expect.objectContaining({ id: "guest-cross-socket-player", connected: true, ready: true })
        ])
      }
    });
  });

  it("processes a close after an in-flight room creation", async () => {
    const storage = new FakeStorage();
    const gateway = new FakeGatewayRateLimitNamespace(10);
    let release!: () => void;
    gateway.stub.responseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = new FakeDurableObjectState(storage);
    const roomAuthority = new RoomAuthorityDurableObject(
      state as unknown as DurableObjectState,
      { GATEWAY: gateway }
    );
    const socket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(socket as unknown as WebSocket, { roomCode: "SC23TU" });
    socket.receive(JSON.stringify({
      id: "msg-create-before-close",
      type: "client:room:create",
      payload: {
        nickname: "Alice",
        guestId: "guest-before-close",
        sessionId: "session-before-close"
      }
    }));
    socket.close();
    await flushAsyncWork();
    expect(storage.values.get("room")).toBeUndefined();

    release();
    await flushAsyncWork();
    expect(storage.values.get("room")).toMatchObject({
      room: {
        players: [expect.objectContaining({ id: "guest-before-close", connected: false })]
      },
      disconnectedAt: { "guest-before-close": expect.any(Number) }
    });
    expect(state.backgroundWork.length).toBeGreaterThanOrEqual(2);
  });

  it("does not broadcast room state to sockets before they join", async () => {
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const unjoinedSocket = new FakeSocket();
    const joinedSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(unjoinedSocket as unknown as WebSocket, {
      roomCode: "AB23CD"
    });
    roomAuthority.attachSocket(joinedSocket as unknown as WebSocket, {
      roomCode: "AB23CD"
    });

    joinedSocket.receive(
      JSON.stringify({
        id: "msg-create-private-broadcast",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-private",
          sessionId: "session-alice-private"
        }
      })
    );
    await flushAsyncWork();

    expect(parseMessages(unjoinedSocket)).toEqual([]);
    expect(parseMessages(joinedSocket).some((message) => message.type === "server:room:state")).toBe(true);
  });

  it("broadcasts quick reactions to the room and enforces the cooldown", async () => {
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(hostSocket as unknown as WebSocket, { roomCode: "RX23YZ" });
    roomAuthority.attachSocket(guestSocket as unknown as WebSocket, { roomCode: "RX23YZ" });
    hostSocket.receive(JSON.stringify({
      id: "msg-create-reaction",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-reaction-alice", sessionId: "session-reaction-alice" }
    }));
    await flushAsyncWork();
    guestSocket.receive(JSON.stringify({
      id: "msg-join-reaction",
      type: "client:room:join",
      payload: {
        roomCode: "RX23YZ",
        nickname: "Bob",
        guestId: "guest-reaction-bob",
        sessionId: "session-reaction-bob"
      }
    }));
    await flushAsyncWork();

    hostSocket.receive(JSON.stringify({
      id: "msg-accessory-reaction",
      type: "client:player:accessory",
      payload: { roomCode: "RX23YZ", accessoryIndex: 2 }
    }));
    await flushAsyncWork();
    const accessoryState = [...parseMessages(guestSocket)]
      .reverse()
      .find((message) => message.type === "server:room:state")?.payload as { players?: Array<{ id: string; accessoryIndex?: number }> } | undefined;
    expect(accessoryState?.players).toContainEqual(expect.objectContaining({ id: "guest-reaction-alice", accessoryIndex: 2 }));

    hostSocket.receive(JSON.stringify({
      id: "msg-reaction-first",
      type: "client:player:reaction",
      payload: { roomCode: "RX23YZ", reaction: "よろしく" }
    }));
    hostSocket.receive(JSON.stringify({
      id: "msg-reaction-too-soon",
      type: "client:player:reaction",
      payload: { roomCode: "RX23YZ", reaction: "ナイス" }
    }));
    await flushAsyncWork();

    const firstReactions = parseMessages(guestSocket).filter((message) => message.type === "server:player:reaction");
    expect(firstReactions).toHaveLength(1);
    expect(firstReactions[0]?.payload).toEqual({ playerId: "guest-reaction-alice", reaction: "よろしく" });

    await vi.advanceTimersByTimeAsync(3_000);
    hostSocket.receive(JSON.stringify({
      id: "msg-reaction-second",
      type: "client:player:reaction",
      payload: { roomCode: "RX23YZ", reaction: "ナイス" }
    }));
    await flushAsyncWork();
    expect(parseMessages(guestSocket).filter((message) => message.type === "server:player:reaction")).toHaveLength(2);
  });

  it("clears READY states when the host changes the next match settings", async () => {
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(hostSocket as unknown as WebSocket, { roomCode: "ST23UV" });
    roomAuthority.attachSocket(guestSocket as unknown as WebSocket, { roomCode: "ST23UV" });
    hostSocket.receive(JSON.stringify({
      id: "msg-create-settings-reset",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-settings-alice", sessionId: "session-settings-alice" }
    }));
    await flushAsyncWork();
    guestSocket.receive(JSON.stringify({
      id: "msg-join-settings-reset",
      type: "client:room:join",
      payload: {
        roomCode: "ST23UV",
        nickname: "Bob",
        guestId: "guest-settings-bob",
        sessionId: "session-settings-bob"
      }
    }));
    await flushAsyncWork();
    for (const [socket, id] of [[hostSocket, "host"], [guestSocket, "guest"]] as const) {
      socket.receive(JSON.stringify({
        id: `msg-ready-settings-reset-${id}`,
        type: "client:player:ready",
        payload: { roomCode: "ST23UV", ready: true }
      }));
    }
    hostSocket.receive(JSON.stringify({
      id: "msg-category-settings-reset",
      type: "client:room:setPromptCategory",
      payload: { roomCode: "ST23UV", category: "long" }
    }));
    await flushAsyncWork();

    expect(findLastAck(hostSocket, "client:room:setPromptCategory")).toMatchObject({
      payload: {
        ok: true,
        data: { players: [{ ready: false }, { ready: false }] }
      }
    });
  });

  it("persists guest sessions and match results for room-scoped sockets", async () => {
    const storage = new FakeStorage();
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(socket as unknown as WebSocket, {
      roomCode: "AB23CD"
    });

    socket.receive(
      JSON.stringify({
        id: "msg-create-room-authority",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-authority",
          sessionId: "session-alice-authority"
        }
      })
    );
    await flushAsyncWork();

    const createAck = findLastAck(socket, "client:room:create");
    expect(createAck).toMatchObject({
      type: "server:ack",
      payload: {
        ok: true,
        data: {
          roomCode: "AB23CD",
          playerId: "guest-alice-authority"
        }
      }
    });
    expect(storage.values.get("guest-session:AB23CD:guest-alice-authority")).toMatchObject({
      sessionId: "session-alice-authority",
      guestId: "guest-alice-authority",
      nickname: "Alice",
      roomCode: "AB23CD",
      createdAt: expect.any(String),
      lastSeenAt: expect.any(String)
    });
    expect(storage.values.get("retention-alarm-at")).toEqual(expect.any(Number));

    socket.receive(JSON.stringify({
      id: "msg-ready-room-authority",
      type: "client:player:ready",
      payload: { roomCode: "AB23CD", ready: true }
    }));

    socket.receive(
      JSON.stringify({
        id: "msg-start-room-authority",
        type: "client:match:start",
        payload: {
          roomCode: "AB23CD"
        }
      })
    );
    await vi.advanceTimersByTimeAsync(3_000);

    sendTypingInput(socket, "AB23CD", getCountdownRoom(socket).prompt?.typing.romaji ?? "");
    await flushAsyncWork();

    expect(storage.values.get("match-result:AB23CD:1")).toMatchObject({
      roomCode: "AB23CD",
      round: 1,
      prompt: expect.objectContaining({
        id: expect.any(String)
      }),
      result: expect.objectContaining({
        roomCode: "AB23CD",
        matchRule: "race"
      }),
      createdAt: expect.any(String)
    });
  });

  it("ends a race for both players when the first player finishes", async () => {
    const storage = new FakeStorage();
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(hostSocket as unknown as WebSocket, { roomCode: "RF34GH" });
    roomAuthority.attachSocket(guestSocket as unknown as WebSocket, { roomCode: "RF34GH" });
    hostSocket.receive(JSON.stringify({
      id: "msg-create-race-first-finish",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-race-first-host", sessionId: "session-race-first-host" }
    }));
    await flushAsyncWork();
    guestSocket.receive(JSON.stringify({
      id: "msg-join-race-first-finish",
      type: "client:room:join",
      payload: {
        roomCode: "RF34GH",
        nickname: "Bob",
        guestId: "guest-race-first-guest",
        sessionId: "session-race-first-guest"
      }
    }));
    await flushAsyncWork();

    for (const [socket, id] of [[hostSocket, "host"], [guestSocket, "guest"]] as const) {
      socket.receive(JSON.stringify({
        id: `msg-ready-race-first-finish-${id}`,
        type: "client:player:ready",
        payload: { roomCode: "RF34GH", ready: true }
      }));
    }
    hostSocket.receive(JSON.stringify({
      id: "msg-start-race-first-finish",
      type: "client:match:start",
      payload: { roomCode: "RF34GH" }
    }));
    await vi.advanceTimersByTimeAsync(3_000);

    let releasePersistence!: () => void;
    storage.roomPutGate = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    storage.failPutPrefixes.add("room");
    sendTypingInput(hostSocket, "RF34GH", getCountdownRoom(hostSocket).prompt?.typing.romaji ?? "");
    await flushAsyncWork();

    for (const socket of [hostSocket, guestSocket]) {
      const terminalMessages = parseMessages(socket).filter(
        (message) => message.type === "server:room:state" || message.type === "server:match:result"
      );
      expect(terminalMessages.slice(-2).map((message) => message.type)).toEqual([
        "server:room:state",
        "server:match:result"
      ]);
      expect(terminalMessages.at(-2)?.payload).toMatchObject({ status: "finished" });
      const result = [...parseMessages(socket)]
        .reverse()
        .find((message) => message.type === "server:match:result")?.payload as
        | { players?: Array<{ id: string; finishStatus?: string; totalTypedCharacters?: number }> }
        | undefined;
      expect(result?.players).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "guest-race-first-host", finishStatus: "finished" }),
        expect.objectContaining({ id: "guest-race-first-guest", finishStatus: "unfinished", totalTypedCharacters: 0 })
      ]));
    }

    releasePersistence();
    await flushAsyncWork();

    const guestMessageCount = guestSocket.messages.length;
    guestSocket.receive(JSON.stringify({
      id: "msg-progress-after-race-finished",
      type: "client:typing:progress",
      payload: { roomCode: "RF34GH", input: "a", sequence: 1 }
    }));
    await flushAsyncWork();

    expect(guestSocket.messages).toHaveLength(guestMessageCount);
  });

  it("broadcasts and persists post-finish departures without repeating the match result", async () => {
    const storage = new FakeStorage();
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(hostSocket as unknown as WebSocket, { roomCode: "PL34MN" });
    roomAuthority.attachSocket(guestSocket as unknown as WebSocket, { roomCode: "PL34MN" });
    hostSocket.receive(JSON.stringify({
      id: "msg-create-post-finish-leave",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-post-finish-host", sessionId: "session-post-finish-host" }
    }));
    await flushAsyncWork();
    guestSocket.receive(JSON.stringify({
      id: "msg-join-post-finish-leave",
      type: "client:room:join",
      payload: {
        roomCode: "PL34MN",
        nickname: "Bob",
        guestId: "guest-post-finish-guest",
        sessionId: "session-post-finish-guest"
      }
    }));
    await flushAsyncWork();

    for (const [socket, id] of [[hostSocket, "host"], [guestSocket, "guest"]] as const) {
      socket.receive(JSON.stringify({
        id: `msg-ready-post-finish-leave-${id}`,
        type: "client:player:ready",
        payload: { roomCode: "PL34MN", ready: true }
      }));
    }
    hostSocket.receive(JSON.stringify({
      id: "msg-start-post-finish-leave",
      type: "client:match:start",
      payload: { roomCode: "PL34MN" }
    }));
    await vi.advanceTimersByTimeAsync(3_000);
    sendTypingInput(hostSocket, "PL34MN", getCountdownRoom(hostSocket).prompt?.typing.romaji ?? "");
    await flushAsyncWork();

    const resultCountBeforeLeave = parseMessages(hostSocket)
      .filter((message) => message.type === "server:match:result").length;
    guestSocket.receive(JSON.stringify({
      id: "msg-post-finish-leave",
      type: "client:room:leave",
      payload: { roomCode: "PL34MN" }
    }));
    await flushAsyncWork();

    const latestRoom = [...parseMessages(hostSocket)]
      .reverse()
      .find((message) => message.type === "server:room:state")?.payload as RoomState | undefined;
    expect(latestRoom?.players).toEqual([
      expect.objectContaining({ id: "guest-post-finish-host" })
    ]);
    expect(parseMessages(hostSocket).filter((message) => message.type === "server:match:result"))
      .toHaveLength(resultCountBeforeLeave);
    expect(storage.values.get("room")).toMatchObject({
      room: {
        players: [expect.objectContaining({ id: "guest-post-finish-host" })]
      }
    });
  });

  it("preserves partial romaji input and its statistics when a player reconnects", async () => {
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const firstSocket = new FakeSocket();
    const rejoinedSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(firstSocket as unknown as WebSocket, { roomCode: "RJ34KL" });
    firstSocket.receive(JSON.stringify({
      id: "msg-create-rejoin-progress",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-rejoin-progress", sessionId: "session-rejoin-progress", deviceKind: "desktop" }
    }));
    await flushAsyncWork();
    firstSocket.receive(JSON.stringify({
      id: "msg-category-rejoin-progress",
      type: "client:room:setPromptCategory",
      payload: { roomCode: "RJ34KL", category: "short" }
    }));
    firstSocket.receive(JSON.stringify({
      id: "msg-ready-rejoin-progress",
      type: "client:player:ready",
      payload: { roomCode: "RJ34KL", ready: true }
    }));
    firstSocket.receive(JSON.stringify({
      id: "msg-start-rejoin-progress",
      type: "client:match:start",
      payload: { roomCode: "RJ34KL" }
    }));
    await vi.advanceTimersByTimeAsync(3_000);

    const prompt = getCountdownRoom(firstSocket).prompt!;
    const plan = buildRomajiTypingPlan(prompt.typing.hiragana);
    const partialUnitIndex = plan.units.findIndex((unit) => unit.guide.length > 1);
    expect(partialUnitIndex).toBeGreaterThanOrEqual(0);
    const partialInput = `${plan.units.slice(0, partialUnitIndex).map((unit) => unit.guide).join("")}${plan.units[partialUnitIndex]!.guide[0]}`;

    firstSocket.receive(JSON.stringify({
      id: "msg-progress-rejoin-progress",
      type: "client:typing:progress",
      payload: { roomCode: "RJ34KL", input: partialInput, sequence: 1 }
    }));
    await flushAsyncWork();

    roomAuthority.attachSocket(rejoinedSocket as unknown as WebSocket, { roomCode: "RJ34KL" });
    rejoinedSocket.receive(JSON.stringify({
      id: "msg-join-rejoin-progress",
      type: "client:room:join",
      payload: { roomCode: "RJ34KL", nickname: "Alice", guestId: "guest-rejoin-progress", sessionId: "session-rejoin-progress", deviceKind: "desktop" }
    }));
    await flushAsyncWork();

    const rejoinAck = findLastAck(rejoinedSocket, "client:room:join") as { payload?: { data?: { room?: RoomState } } };
    const player = rejoinAck.payload?.data?.room?.players.find((entry) => entry.id === "guest-rejoin-progress");
    const completedGuideLength = plan.units
      .slice(0, partialUnitIndex)
      .reduce((length, unit) => length + unit.guide.length, 0);
    expect(player).toMatchObject({
      typingProgressIndex: completedGuideLength,
      pendingInput: plan.units[partialUnitIndex]!.guide[0],
      correctCharacters: partialInput.length,
      totalTypedCharacters: partialInput.length
    });

    const remainingInput = `${plan.units[partialUnitIndex]!.guide.slice(1)}${plan.units
      .slice(partialUnitIndex + 1)
      .map((unit) => unit.guide)
      .join("")}`;
    sendTypingInput(rejoinedSocket, "RJ34KL", remainingInput);
    await flushAsyncWork();
    expect(parseMessages(rejoinedSocket).some((message) => message.type === "server:match:result")).toBe(true);
  });

  it("derives the romaji cursor when a legacy snapshot has no internal typing state", async () => {
    const storage = new FakeStorage();
    const firstRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const firstSocket = new FakeSocket();

    await firstRoom.ready;
    firstRoom.attachSocket(firstSocket as unknown as WebSocket, { roomCode: "LG34MN" });
    firstSocket.receive(JSON.stringify({
      id: "msg-create-legacy-typing",
      type: "client:room:create",
      payload: {
        nickname: "Alice",
        guestId: "guest-legacy-typing",
        sessionId: "session-legacy-typing",
        deviceKind: "desktop"
      }
    }));
    firstSocket.receive(JSON.stringify({
      id: "msg-category-legacy-typing",
      type: "client:room:setPromptCategory",
      payload: { roomCode: "LG34MN", category: "short" }
    }));
    firstSocket.receive(JSON.stringify({
      id: "msg-ready-legacy-typing",
      type: "client:player:ready",
      payload: { roomCode: "LG34MN", ready: true }
    }));
    firstSocket.receive(JSON.stringify({
      id: "msg-start-legacy-typing",
      type: "client:match:start",
      payload: { roomCode: "LG34MN" }
    }));
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(3_000);
    await flushAsyncWork();

    const prompt = getCountdownRoom(firstSocket).prompt!;
    const plan = buildRomajiTypingPlan(prompt.typing.hiragana);
    expect(plan.units.length).toBeGreaterThan(1);
    const completedCanonicalLength = Array.from(plan.units[0]!.hiragana).length;
    const completedGuideLength = plan.units[0]!.guide.length;
    const legacySnapshot = structuredClone(storage.values.get("room")) as {
      room: RoomState;
      internal?: { typingState?: unknown };
    };
    const legacyPlayer = legacySnapshot.room.players.find((player) => player.id === "guest-legacy-typing")!;
    legacyPlayer.progressIndex = completedCanonicalLength;
    legacyPlayer.correctCharacters = completedGuideLength;
    legacyPlayer.totalTypedCharacters = completedGuideLength;
    delete legacyPlayer.typingProgressIndex;
    delete legacyPlayer.pendingInput;
    if (legacySnapshot.internal) {
      delete legacySnapshot.internal.typingState;
    }
    storage.values.set("room", legacySnapshot);

    const restoredRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const rejoinedSocket = new FakeSocket();
    await restoredRoom.ready;
    restoredRoom.attachSocket(rejoinedSocket as unknown as WebSocket, { roomCode: "LG34MN" });
    rejoinedSocket.receive(JSON.stringify({
      id: "msg-rejoin-legacy-typing",
      type: "client:room:join",
      payload: {
        roomCode: "LG34MN",
        nickname: "Alice",
        guestId: "guest-legacy-typing",
        sessionId: "session-legacy-typing",
        deviceKind: "desktop"
      }
    }));
    await flushAsyncWork();

    const rejoinAck = findLastAck(rejoinedSocket, "client:room:join") as {
      payload?: { data?: { room?: RoomState } };
    };
    expect(rejoinAck.payload?.data?.room?.players.find((player) => player.id === "guest-legacy-typing"))
      .toMatchObject({
        progressIndex: completedCanonicalLength,
        typingProgressIndex: completedGuideLength,
        pendingInput: ""
      });

    const remainingInput = plan.units.slice(1).map((unit) => unit.guide).join("");
    sendTypingInput(rejoinedSocket, "LG34MN", remainingInput);
    await flushAsyncWork();
    expect(parseMessages(rejoinedSocket).some((message) => message.type === "server:match:result")).toBe(true);
  });

  it("marks players disconnected before detaching socket state", async () => {
    const storage = new FakeStorage();
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(socket as unknown as WebSocket, {
      roomCode: "CD34EF"
    });
    socket.receive(
      JSON.stringify({
        id: "msg-create-disconnect",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-alice-disconnect",
          sessionId: "session-alice-disconnect"
        }
      })
    );
    await flushAsyncWork();
    socket.receive(JSON.stringify({
      id: "msg-ready-disconnect",
      type: "client:player:ready",
      payload: { roomCode: "CD34EF", ready: true }
    }));
    socket.receive(
      JSON.stringify({
        id: "msg-start-disconnect",
        type: "client:match:start",
        payload: {
          roomCode: "CD34EF"
        }
      })
    );
    await vi.advanceTimersByTimeAsync(3_000);

    socket.close();
    await flushAsyncWork();

    const snapshot = storage.values.get("room") as
      | { room?: RoomState; disconnectedAt?: Record<string, number> }
      | undefined;
    const player = snapshot?.room?.players.find((entry) => entry.id === "guest-alice-disconnect");

    expect(player).toMatchObject({
      connected: false,
      ready: false
    });
    expect(snapshot?.disconnectedAt?.["guest-alice-disconnect"]).toEqual(expect.any(Number));
    expect(storage.alarmAt).not.toBeNull();
  });

  it("retains an all-offline waiting room until its idle TTL and then deletes it", async () => {
    const storage = new FakeStorage();
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(socket as unknown as WebSocket, { roomCode: "WT45UV" });
    socket.receive(JSON.stringify({
      id: "msg-create-waiting-ttl",
      type: "client:room:create",
      payload: {
        nickname: "Alice",
        guestId: "guest-waiting-ttl",
        sessionId: "session-waiting-ttl"
      }
    }));
    await flushAsyncWork();
    socket.close();
    await flushAsyncWork();

    expect(storage.values.get("room")).toMatchObject({
      room: { status: "waiting", players: [expect.objectContaining({ connected: false })] }
    });
    expect(storage.alarmAt).toEqual(expect.any(Number));

    vi.setSystemTime(storage.alarmAt! - 1);
    await roomAuthority.alarm();
    expect(storage.values.get("room")).toBeDefined();

    vi.setSystemTime(storage.alarmAt! + 1);
    await roomAuthority.alarm();
    expect(storage.values.get("room")).toBeUndefined();
    const response = await roomAuthority.fetch(new Request("https://example.com/health"));
    await expect(response.json()).resolves.toMatchObject({ room: null });
  });

  it("cleans a player that was connected before a waiting-room restart", async () => {
    const storage = new FakeStorage();
    const firstRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const aliceSocket = new FakeSocket();
    const bobSocket = new FakeSocket();

    await firstRoom.ready;
    firstRoom.attachSocket(aliceSocket as unknown as WebSocket, { roomCode: "RW45XY" });
    aliceSocket.receive(JSON.stringify({
      id: "msg-create-before-waiting-restart",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-restart-alice", sessionId: "session-restart-alice" }
    }));
    firstRoom.attachSocket(bobSocket as unknown as WebSocket, { roomCode: "RW45XY" });
    bobSocket.receive(JSON.stringify({
      id: "msg-join-before-waiting-restart",
      type: "client:room:join",
      payload: {
        roomCode: "RW45XY",
        nickname: "Bob",
        guestId: "guest-restart-bob",
        sessionId: "session-restart-bob"
      }
    }));
    await flushAsyncWork();

    const restoreAt = Date.now();
    const restoredRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const rejoinedAliceSocket = new FakeSocket();
    await restoredRoom.ready;
    restoredRoom.attachSocket(rejoinedAliceSocket as unknown as WebSocket, { roomCode: "RW45XY" });
    rejoinedAliceSocket.receive(JSON.stringify({
      id: "msg-rejoin-after-waiting-restart",
      type: "client:room:join",
      payload: {
        roomCode: "RW45XY",
        nickname: "Alice",
        guestId: "guest-restart-alice",
        sessionId: "session-restart-alice"
      }
    }));
    await flushAsyncWork();

    vi.setSystemTime(restoreAt + 30_001);
    await restoredRoom.alarm();
    const response = await restoredRoom.fetch(new Request("https://example.com/health"));
    const body = await response.json() as { room?: RoomState };
    expect(body.room).toMatchObject({
      status: "waiting",
      players: [expect.objectContaining({ id: "guest-restart-alice", connected: true })]
    });
  });

  it("forfeits and finalizes a player that stays offline after a playing-room restart", async () => {
    const storage = new FakeStorage();
    const firstRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const aliceSocket = new FakeSocket();
    const bobSocket = new FakeSocket();

    await firstRoom.ready;
    firstRoom.attachSocket(aliceSocket as unknown as WebSocket, { roomCode: "RP45YZ" });
    aliceSocket.receive(JSON.stringify({
      id: "msg-create-before-playing-restart",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-playing-alice", sessionId: "session-playing-alice" }
    }));
    firstRoom.attachSocket(bobSocket as unknown as WebSocket, { roomCode: "RP45YZ" });
    bobSocket.receive(JSON.stringify({
      id: "msg-join-before-playing-restart",
      type: "client:room:join",
      payload: {
        roomCode: "RP45YZ",
        nickname: "Bob",
        guestId: "guest-playing-bob",
        sessionId: "session-playing-bob"
      }
    }));
    for (const [socket, id] of [[aliceSocket, "alice"], [bobSocket, "bob"]] as const) {
      socket.receive(JSON.stringify({
        id: `msg-ready-before-playing-restart-${id}`,
        type: "client:player:ready",
        payload: { roomCode: "RP45YZ", ready: true }
      }));
    }
    aliceSocket.receive(JSON.stringify({
      id: "msg-start-before-playing-restart",
      type: "client:match:start",
      payload: { roomCode: "RP45YZ" }
    }));
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(3_000);
    await flushAsyncWork();

    const restoreAt = Date.now();
    const restoredRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const rejoinedAliceSocket = new FakeSocket();
    await restoredRoom.ready;
    restoredRoom.attachSocket(rejoinedAliceSocket as unknown as WebSocket, { roomCode: "RP45YZ" });
    rejoinedAliceSocket.receive(JSON.stringify({
      id: "msg-rejoin-after-playing-restart",
      type: "client:room:join",
      payload: {
        roomCode: "RP45YZ",
        nickname: "Alice",
        guestId: "guest-playing-alice",
        sessionId: "session-playing-alice"
      }
    }));
    await flushAsyncWork();

    vi.setSystemTime(restoreAt + 30_001);
    await restoredRoom.alarm();
    await flushAsyncWork();
    const resultRetentionAlarm = storage.alarmAt;
    expect(resultRetentionAlarm).toEqual(expect.any(Number));
    expect(resultRetentionAlarm!).toBeGreaterThan(Date.now());

    // A second maintenance pass used to immediately remove the forfeited
    // player and reset the finished room, making the just-broadcast result
    // disappear from connected clients.
    await restoredRoom.alarm();
    await flushAsyncWork();
    const response = await restoredRoom.fetch(new Request("https://example.com/health"));
    const body = await response.json() as { room?: RoomState };
    expect(body.room).toMatchObject({
      status: "finished",
      players: expect.arrayContaining([
        expect.objectContaining({ id: "guest-playing-alice", connected: true }),
        expect.objectContaining({
          id: "guest-playing-bob",
          connected: false,
          forfeited: true,
          finishStatus: "forfeited"
        })
      ])
    });
  });

  it("cleans explicitly forfeited players and lets the remaining player rematch", async () => {
    const storage = new FakeStorage();
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(hostSocket as unknown as WebSocket, { roomCode: "EF34GH" });
    roomAuthority.attachSocket(guestSocket as unknown as WebSocket, { roomCode: "EF34GH" });
    hostSocket.receive(JSON.stringify({
      id: "msg-create-explicit-forfeit-cleanup",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-explicit-forfeit-host", sessionId: "session-explicit-forfeit-host" }
    }));
    await flushAsyncWork();
    guestSocket.receive(JSON.stringify({
      id: "msg-join-explicit-forfeit-cleanup",
      type: "client:room:join",
      payload: {
        roomCode: "EF34GH",
        nickname: "Bob",
        guestId: "guest-explicit-forfeit-guest",
        sessionId: "session-explicit-forfeit-guest"
      }
    }));
    await flushAsyncWork();

    for (const [socket, id] of [[hostSocket, "host"], [guestSocket, "guest"]] as const) {
      socket.receive(JSON.stringify({
        id: `msg-ready-explicit-forfeit-${id}`,
        type: "client:player:ready",
        payload: { roomCode: "EF34GH", ready: true }
      }));
    }
    hostSocket.receive(JSON.stringify({
      id: "msg-start-explicit-forfeit-cleanup",
      type: "client:match:start",
      payload: { roomCode: "EF34GH" }
    }));
    await vi.advanceTimersByTimeAsync(3_000);

    hostSocket.receive(JSON.stringify({
      id: "msg-leave-explicit-forfeit-cleanup",
      type: "client:room:leave",
      payload: { roomCode: "EF34GH" }
    }));
    await flushAsyncWork();

    const resultState = [...parseMessages(guestSocket)]
      .reverse()
      .find((message) => message.type === "server:room:state")?.payload as RoomState | undefined;
    expect(resultState).toMatchObject({
      status: "finished",
      players: [
        expect.objectContaining({ id: "guest-explicit-forfeit-host", forfeited: true, finishStatus: "forfeited" }),
        expect.objectContaining({ id: "guest-explicit-forfeit-guest" })
      ]
    });
    expect(storage.alarmAt).toEqual(expect.any(Number));
    const resultRetentionAlarm = storage.alarmAt!;
    expect(resultRetentionAlarm).toBeGreaterThan(Date.now());

    await roomAuthority.alarm();
    await flushAsyncWork();
    const retainedResponse = await roomAuthority.fetch(new Request("https://example.com/health"));
    const retainedBody = await retainedResponse.json() as { room?: RoomState };
    expect(retainedBody.room).toMatchObject({ status: "finished", result: expect.any(Object) });

    vi.setSystemTime(resultRetentionAlarm + 1);
    await roomAuthority.alarm();
    await flushAsyncWork();

    const waitingState = [...parseMessages(guestSocket)]
      .reverse()
      .find((message) => message.type === "server:room:state")?.payload as RoomState | undefined;
    expect(waitingState).toMatchObject({
      status: "waiting",
      hostPlayerId: "guest-explicit-forfeit-guest",
      players: [expect.objectContaining({ id: "guest-explicit-forfeit-guest", connected: true })]
    });
    expect(waitingState?.players).not.toContainEqual(expect.objectContaining({ id: "guest-explicit-forfeit-host" }));

    guestSocket.receive(JSON.stringify({
      id: "msg-ready-explicit-forfeit-rematch",
      type: "client:player:ready",
      payload: { roomCode: "EF34GH", ready: true }
    }));
    guestSocket.receive(JSON.stringify({
      id: "msg-start-explicit-forfeit-rematch",
      type: "client:match:start",
      payload: { roomCode: "EF34GH" }
    }));
    await flushAsyncWork();

    expect(findLastAck(guestSocket, "client:match:start")).toMatchObject({
      payload: {
        ok: true,
        data: expect.objectContaining({ status: "countdown" })
      }
    });
  });

  it("closes a socket that remains after leaving a room", async () => {
    const roomAuthority = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState
    );
    const socket = new FakeSocket();

    await roomAuthority.ready;
    roomAuthority.attachSocket(socket as unknown as WebSocket, { roomCode: "LV56MN" });
    socket.receive(JSON.stringify({
      id: "msg-create-leave-timeout",
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-leave-timeout", sessionId: "session-leave-timeout" }
    }));
    await flushAsyncWork();
    socket.receive(JSON.stringify({
      id: "msg-leave-timeout",
      type: "client:room:leave",
      payload: { roomCode: "LV56MN" }
    }));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(socket.readyState).toBe(3);
  });

  it("uses the gateway rate limiter across different room authorities", async () => {
    const gatewayNamespace = new FakeGatewayRateLimitNamespace(1);
    const env = {
      GATEWAY: gatewayNamespace
    };
    const firstRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState,
      env
    );
    const secondRoom = new RoomAuthorityDurableObject(
      new FakeDurableObjectState(new FakeStorage()) as unknown as DurableObjectState,
      env
    );
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();

    await firstRoom.ready;
    await secondRoom.ready;
    firstRoom.attachSocket(firstSocket as unknown as WebSocket, {
      roomCode: "RL0001",
      clientIp: "127.0.0.1"
    });
    secondRoom.attachSocket(secondSocket as unknown as WebSocket, {
      roomCode: "RL0002",
      clientIp: "127.0.0.1"
    });

    firstSocket.receive(
      JSON.stringify({
        id: "msg-create-rate-1",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-rate-limit",
          sessionId: "session-rate-1"
        }
      })
    );
    await flushAsyncWork();

    secondSocket.receive(
      JSON.stringify({
        id: "msg-create-rate-2",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-rate-limit",
          sessionId: "session-rate-2"
        }
      })
    );
    await flushAsyncWork();

    expect(findLastAck(firstSocket, "client:room:create")).toMatchObject({
      payload: {
        ok: true
      }
    });
    expect(findLastAck(secondSocket, "client:room:create")).toMatchObject({
      payload: {
        ok: false,
        error: "central limited"
      }
    });
    expect(gatewayNamespace.getByNameCalls).toEqual(["gateway", "gateway"]);
    expect(gatewayNamespace.stub.calls).toEqual([
      {
        action: "create",
        clientIp: "127.0.0.1",
        guestId: "guest-rate-limit"
      },
      {
        action: "create",
        clientIp: "127.0.0.1",
        guestId: "guest-rate-limit"
      }
    ]);
  });
});

describe("worker handler", () => {
  it("rejects unauthorized state writes and forwards gateway requests", async () => {
    const env = createEnv();

    const forbidden = await worker.fetch(
      new Request("https://example.com/rooms/ab23cd/state", {
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
    expect(env.GATEWAY.stub.fetchCalls).toBe(0);

    const forwarded = await worker.fetch(new Request("https://example.com/"), env as unknown as Env);

    expect(forwarded.status).toBe(200);
    expect(env.GATEWAY.getByNameCalls).toEqual(["gateway"]);
    expect(env.GATEWAY.stub.fetchCalls).toBe(1);
    expect(env.GATEWAY.stub.lastRequest?.url).toBe("https://example.com/");
    expect(env.ROOMS.getByNameCalls).toEqual([]);
  });

  it("allows authorized state writes through to the room authority", async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request("https://example.com/rooms/ab23cd/state", {
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
    expect(env.ROOMS.getByNameCalls).toEqual(["AB23CD"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
    expect(env.ROOMS.stub.lastRequest?.method).toBe("PUT");
    expect(env.ROOMS.stub.lastRequest?.url).toBe("https://example.com/rooms/ab23cd/state");
    expect(env.GATEWAY.getByNameCalls).toEqual([]);
  });

  it("rejects unauthenticated public room state reads", async () => {
    const env = createEnv();
    const response = await worker.fetch(
      new Request("https://example.com/rooms/AB23CD/state", {
        method: "GET"
      }),
      env as unknown as Env
    );

    expect(response.status).toBe(403);
    expect(env.ROOMS.getByNameCalls).toEqual([]);
  });

  it("rejects invalid room route codes before durable object lookup", async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request("https://example.com/rooms/ab12cd/socket", {
        headers: {
          upgrade: "websocket"
        }
      }),
      env as unknown as Env
    );

    expect(response.status).toBe(400);
    expect(env.ROOMS.getByNameCalls).toEqual([]);
    expect(env.GATEWAY.getByNameCalls).toEqual([]);
  });

  it("does not expose the gateway internal rate-limit endpoint", async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request(`https://example.com${GATEWAY_ROOM_RATE_LIMIT_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "create",
          clientIp: "127.0.0.1",
          guestId: "guest-test"
        })
      }),
      env as unknown as Env
    );

    expect(response.status).toBe(403);
    expect(env.ROOMS.getByNameCalls).toEqual([]);
    expect(env.GATEWAY.getByNameCalls).toEqual([]);
  });

  it("forwards room websocket routes to room authorities", async () => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request("https://example.com/rooms/xy987z/socket", {
        headers: {
          upgrade: "websocket"
        }
      }),
      env as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(env.ROOMS.getByNameCalls).toEqual(["XY987Z"]);
    expect(env.ROOMS.stub.fetchCalls).toBe(1);
    expect(env.ROOMS.stub.lastRequest?.url).toBe("https://example.com/rooms/xy987z/socket");
    expect(env.GATEWAY.getByNameCalls).toEqual([]);
  });
});
