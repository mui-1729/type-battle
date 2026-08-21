import { describe, expect, it, vi } from "vitest";
import type { RealtimeSocket } from "../app/_lib/realtime-client";
import {
  disconnectPracticeRealtimeConnection,
  disconnectRealtimeConnection,
  getRoomRealtimeUrl,
  openRealtimeConnection
} from "../app/_lib/realtime-connection-controller";

function createFakeSocket() {
  return {
    isConnected: vi.fn(() => false),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn()
  } as unknown as RealtimeSocket;
}

describe("realtime connection controller", () => {
  it("replaces the previous socket and attaches the new mode", () => {
    const previousSocket = createFakeSocket();
    const nextSocket = createFakeSocket();
    const refs = {
      socketRef: { current: previousSocket as RealtimeSocket | null },
      socketModeRef: { current: "room" as "practice" | "room" | null },
      storedRoomJoinInFlightRef: { current: true }
    };
    const setSocketMode = vi.fn();
    const setConnected = vi.fn();
    const attachHandlers = vi.fn();
    const createSocket = vi.fn(() => nextSocket);

    const socket = openRealtimeConnection({
      refs,
      setters: { setSocketMode, setConnected },
      transport: "cloudflare",
      url: "ws://localhost:8787",
      mode: "practice",
      attachHandlers,
      createSocket
    });

    expect(previousSocket.disconnect).toHaveBeenCalledOnce();
    expect(createSocket).toHaveBeenCalledWith({ transport: "cloudflare", url: "ws://localhost:8787" });
    expect(socket).toBe(nextSocket);
    expect(refs.socketRef.current).toBe(nextSocket);
    expect(refs.socketModeRef.current).toBe("practice");
    expect(refs.storedRoomJoinInFlightRef.current).toBe(false);
    expect(setSocketMode).toHaveBeenCalledWith("practice");
    expect(setConnected).not.toHaveBeenCalled();
    expect(attachHandlers).toHaveBeenCalledWith(nextSocket, "practice");
  });

  it("builds a room-specific websocket URL", () => {
    expect(getRoomRealtimeUrl("wss://example.com/base", "ABC123")).toBe(
      "wss://example.com/rooms/ABC123/socket"
    );
  });

  it("disconnects the current connection and resets refs", () => {
    const socket = createFakeSocket();
    const refs = {
      socketRef: { current: socket as RealtimeSocket | null },
      socketModeRef: { current: "room" as "practice" | "room" | null },
      storedRoomJoinInFlightRef: { current: true }
    };
    const setSocketMode = vi.fn();
    const setConnected = vi.fn();

    disconnectRealtimeConnection({ refs, setters: { setSocketMode, setConnected } });

    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(refs.socketRef.current).toBeNull();
    expect(refs.socketModeRef.current).toBeNull();
    expect(refs.storedRoomJoinInFlightRef.current).toBe(false);
    expect(setSocketMode).toHaveBeenCalledWith(null);
    expect(setConnected).toHaveBeenCalledWith(false);
  });

  it("only releases a practice socket from the practice flow", () => {
    const socket = createFakeSocket();
    const refs = {
      socketRef: { current: socket as RealtimeSocket | null },
      socketModeRef: { current: "room" as "practice" | "room" | null },
      storedRoomJoinInFlightRef: { current: false }
    };
    const setSocketMode = vi.fn();
    const setConnected = vi.fn();

    expect(disconnectPracticeRealtimeConnection({ refs, setters: { setSocketMode, setConnected } })).toBe(false);
    expect(socket.disconnect).not.toHaveBeenCalled();

    refs.socketModeRef.current = "practice";
    expect(disconnectPracticeRealtimeConnection({ refs, setters: { setSocketMode, setConnected } })).toBe(true);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(refs.socketRef.current).toBeNull();
    expect(refs.socketModeRef.current).toBeNull();
    expect(setSocketMode).toHaveBeenCalledWith(null);
    expect(setConnected).toHaveBeenCalledWith(false);
  });
});
