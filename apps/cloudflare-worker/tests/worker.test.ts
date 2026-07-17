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

type RateLimitInput = {
  action: "create" | "join";
  clientIp: string;
  guestId: string;
};

type RateLimitResult = { ok: true } | { ok: false; error: string };

class FakeGatewayRateLimitStub {
  readonly calls: RateLimitInput[] = [];

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

    expect(findLastAck(socket, "client:room:create")).toMatchObject({
      type: "server:ack",
      command: "client:room:create",
      payload: {
        ok: false,
        error: "Room commands must use /rooms/:roomCode/socket."
      }
    });
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
    vi.setSystemTime(storage.alarmAt! + 1);
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
