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

describe("realtime client", () => {
  beforeEach(() => {
    ioMock.mockReset();
    MockWebSocket.instances = [];
    let randomUuidCounter = 0;
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `message-${++randomUuidCounter}`)
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
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
});
