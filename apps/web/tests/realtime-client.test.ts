/// <reference types="@cloudflare/workers-types" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ioMock = vi.hoisted(() => vi.fn());

vi.mock("socket.io-client", () => ({
  io: ioMock
}));

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = 0;
  sent: string[] = [];

  private listeners = new Map<string, Set<(event: { data?: string }) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: { data?: string }) => void) {
    const handlers = this.listeners.get(type) ?? new Set<(event: { data?: string }) => void>();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch("open");
  }

  close() {
    this.readyState = 3;
    this.dispatch("close");
  }

  receive(data: string) {
    this.dispatch("message", { data });
  }

  private dispatch(type: string, event: { data?: string } = {}) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

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

class BridgeServerSocket {
  readyState = 1;
  onclose: ((this: WebSocket, event: CloseEvent) => void) | null = null;
  accepted = false;
  readonly messages: string[] = [];
  private readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  private client: BridgeClientSocket | null = null;

  accept(): void {
    this.accepted = true;
  }

  addEventListener(type: "message" | "close", handler: (event: { data?: unknown }) => void): void {
    const handlers = this.listeners.get(type) ?? new Set<(event: { data?: unknown }) => void>();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  send(data: string): void {
    this.messages.push(data);
    this.client?.receive(data);
  }

  close(): void {
    if (this.readyState === 3) {
      return;
    }

    this.readyState = 3;
    this.dispatch("close", {});
  }

  receive(data: string): void {
    this.dispatch("message", { data });
  }

  setClient(client: BridgeClientSocket): void {
    this.client = client;
  }

  private dispatch(type: string, event: { data?: unknown }): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

class BridgeClientSocket {
  static OPEN = 1;
  static instances: BridgeClientSocket[] = [];
  static gateway: {
    attachSocket(socket: WebSocket): string;
  } | null = null;

  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  private readonly server: BridgeServerSocket;

  constructor(url: string) {
    this.url = url;
    BridgeClientSocket.instances.push(this);

    if (!BridgeClientSocket.gateway) {
      throw new Error("Bridge gateway is not configured.");
    }

    this.server = new BridgeServerSocket();
    this.server.setClient(this);
    BridgeClientSocket.gateway.attachSocket(this.server as unknown as WebSocket);
  }

  addEventListener(type: string, handler: (event: { data?: unknown }) => void): void {
    const handlers = this.listeners.get(type) ?? new Set<(event: { data?: unknown }) => void>();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  send(data: string): void {
    this.sent.push(data);
    this.server.receive(data);
  }

  open(): void {
    this.readyState = BridgeClientSocket.OPEN;
    this.dispatch("open", {});
  }

  close(): void {
    if (this.readyState === 3) {
      return;
    }

    this.readyState = 3;
    this.dispatch("close", {});
    this.server.close();
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

describe("realtime client", () => {
  beforeEach(() => {
    ioMock.mockReset();
    MockWebSocket.instances = [];
    let randomUuidCounter = 0;
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `message-${++randomUuidCounter}`),
      getRandomValues: vi.fn((array: Uint8Array) => {
        array.fill(0);
        return array;
      })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
    BridgeClientSocket.instances = [];
    BridgeClientSocket.gateway = null;
  });

  it("keeps transport-specific default URLs separate", async () => {
    const { getDefaultRealtimeUrl } = await import("../app/_lib/realtime-client");

    expect(
      getDefaultRealtimeUrl("cloudflare", {
        hostname: "localhost",
        protocol: "http:"
      } as Location)
    ).toBe("ws://localhost:8787");

    expect(
      getDefaultRealtimeUrl("socketio", {
        hostname: "example.com",
        protocol: "https:"
      } as Location)
    ).toBe("https://example.com:3001");

    expect(
      getDefaultRealtimeUrl("socketio", {
        hostname: "preview.vercel.app",
        protocol: "https:"
      } as Location)
    ).toBeNull();
  });

  it("defaults to cloudflare in production and socketio elsewhere", async () => {
    const { resolveRealtimeTransport } = await import("../app/_lib/realtime-client");

    expect(resolveRealtimeTransport({ nodeEnv: "production" })).toBe("cloudflare");
    expect(resolveRealtimeTransport({ nodeEnv: "development" })).toBe("socketio");
    expect(resolveRealtimeTransport({ requestedTransport: "cloudflare", nodeEnv: "development" })).toBe("cloudflare");
    expect(resolveRealtimeTransport({ requestedTransport: "socketio", nodeEnv: "production" })).toBe("socketio");
  });

  it("wraps the Socket.IO client without changing its transport settings", async () => {
    const socketIoClient = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn()
    };

    ioMock.mockReturnValue(socketIoClient);

    const { createRealtimeSocket } = await import("../app/_lib/realtime-client");
    const socket = createRealtimeSocket({ transport: "socketio", url: "http://localhost:3001" });
    const connectHandler = vi.fn();

    socket.on("connect", connectHandler);
    socket.emit("room:leave", { roomCode: "ROOM1" });
    socket.disconnect();

    expect(ioMock).toHaveBeenCalledWith("http://localhost:3001", {
      transports: ["websocket"]
    });
    expect(socketIoClient.on).toHaveBeenCalledWith("connect", connectHandler);
    expect(socketIoClient.emit).toHaveBeenCalledWith("room:leave", { roomCode: "ROOM1" });
    expect(socketIoClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("queues Cloudflare messages, routes acks and events, and reconnects after close", async () => {
    const { createRealtimeSocket } = await import("../app/_lib/realtime-client");
    const connectHandler = vi.fn();
    const disconnectHandler = vi.fn();
    const roomStateHandler = vi.fn();
    const matchErrorHandler = vi.fn();
    const firstAck = vi.fn();
    const secondAck = vi.fn();

    const socket = createRealtimeSocket({ transport: "cloudflare", url: "ws://localhost:8787" });
    const firstSocket = MockWebSocket.instances[0]!;

    expect(firstSocket.url).toBe("ws://localhost:8787");

    socket.on("connect", connectHandler);
    socket.on("disconnect", disconnectHandler);
    socket.on("room:state", roomStateHandler);
    socket.on("match:error", matchErrorHandler);

    socket.emit(
      "room:create",
      { nickname: "Alice", guestId: "guest-1", sessionId: "session-1", deviceKind: "desktop" },
      firstAck
    );
    socket.emit("match:start", { roomCode: "ROOM1" }, secondAck);

    expect(firstSocket.sent).toEqual([]);

    firstSocket.open();

    expect(connectHandler).toHaveBeenCalledTimes(1);
    expect(firstSocket.sent).toHaveLength(2);

    const firstMessage = JSON.parse(firstSocket.sent[0] ?? "{}") as {
      id: string;
      type: string;
      payload: unknown;
    };
    const secondMessage = JSON.parse(firstSocket.sent[1] ?? "{}") as {
      id: string;
      type: string;
      payload: unknown;
    };

    expect(firstMessage).toMatchObject({
      type: "client:room:create",
      payload: { nickname: "Alice", guestId: "guest-1", sessionId: "session-1", deviceKind: "desktop" }
    });
    expect(secondMessage).toMatchObject({
      type: "client:match:start",
      payload: { roomCode: "ROOM1" }
    });

    firstSocket.receive(
      JSON.stringify({
        type: "server:ack",
        id: "ack-2",
        replyTo: secondMessage.id,
        command: "client:match:start",
        payload: { ok: true, data: { accepted: true } }
      })
    );
    expect(secondAck).toHaveBeenCalledWith({ ok: true, data: { accepted: true } });
    expect(firstAck).not.toHaveBeenCalled();

    const roomState = {
      roomCode: "ROOM1",
      hostPlayerId: "player-1",
      status: "waiting",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      players: [],
      maxPlayers: 2
    } as const;

    firstSocket.receive(
      JSON.stringify({
        type: "server:room:state",
        payload: roomState
      })
    );
    expect(roomStateHandler).toHaveBeenCalledWith(roomState);

    firstSocket.receive(
      JSON.stringify({
        type: "server:error",
        payload: { message: "Realtime error" }
      })
    );
    expect(matchErrorHandler).toHaveBeenCalledWith({ message: "Realtime error" });

    firstSocket.close();
    expect(disconnectHandler).toHaveBeenCalledTimes(1);
    expect(firstAck).toHaveBeenCalledWith({
      ok: false,
      error: "Realtime connection closed."
    });

    socket.emit("room:leave", { roomCode: "ROOM1" });

    await vi.advanceTimersByTimeAsync(1_000);

    const secondSocket = MockWebSocket.instances[1]!;
    expect(secondSocket).toBeDefined();

    secondSocket.open();

    expect(connectHandler).toHaveBeenCalledTimes(2);
    expect(secondSocket.sent).toHaveLength(1);
    expect(JSON.parse(secondSocket.sent[0] ?? "{}")).toMatchObject({
      type: "client:room:leave",
      payload: { roomCode: "ROOM1" }
    });
  });

  it("bridges the Cloudflare adapter to the worker gateway and returns acks", async () => {
    const { RoomDurableObject } = await import("../../cloudflare-worker/src/worker");

    const storage = new FakeStorage();
    const gateway = new RoomDurableObject(
      new FakeDurableObjectState(storage) as unknown as DurableObjectState
    );

    BridgeClientSocket.gateway = gateway;
    await gateway.ready;
    vi.stubGlobal("WebSocket", BridgeClientSocket as unknown as typeof WebSocket);

    const { createRealtimeSocket } = await import("../app/_lib/realtime-client");
    const connectHandler = vi.fn();
    const roomStateHandler = vi.fn();
    const createAck = vi.fn();
    const setPromptAck = vi.fn();
    const setDifficultyAck = vi.fn();
    const setRuleAck = vi.fn();

    const socket = createRealtimeSocket({ transport: "cloudflare", url: "ws://localhost:8787" });
    const clientSocket = BridgeClientSocket.instances[0];

    expect(clientSocket).toBeDefined();
    if (!clientSocket) {
      return;
    }

    socket.on("connect", connectHandler);
    socket.on("room:state", roomStateHandler);

    socket.emit(
      "room:create",
      {
        nickname: "Alice",
        guestId: "guest-alice-bridge",
        sessionId: "session-alice-bridge"
      },
      createAck
    );
    clientSocket.open();

    expect(connectHandler).toHaveBeenCalledTimes(1);
    expect(createAck).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          roomCode: expect.any(String),
          room: expect.objectContaining({
            roomCode: expect.any(String),
            status: "waiting"
          })
        })
      })
    );
    expect(roomStateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        roomCode: expect.any(String),
        status: "waiting"
      })
    );

    const roomCode = String((createAck.mock.calls[0]?.[0] as { data?: { roomCode?: string } })?.data?.roomCode ?? "");
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    socket.emit("room:setPromptCategory", { roomCode, category: "long" }, setPromptAck);
    socket.emit("room:setBotDifficulty", { roomCode, difficulty: "hard" }, setDifficultyAck);
    socket.emit("room:setMatchRule", { roomCode, rule: "timeAttack" }, setRuleAck);

    expect(setPromptAck).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          roomCode,
          promptCategory: "long"
        })
      })
    );
    expect(setDifficultyAck).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          roomCode,
          botDifficulty: "hard"
        })
      })
    );
    expect(setRuleAck).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          roomCode,
          matchRule: "timeAttack"
        })
      })
    );
  });
});
