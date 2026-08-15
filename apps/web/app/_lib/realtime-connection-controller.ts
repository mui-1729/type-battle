import {
  createRealtimeSocket,
  type RealtimeSocket,
  type RealtimeTransport
} from "./realtime-client";
import { getPracticeSocketToRelease } from "./practice-socket-lifecycle";

export type RealtimeConnectionMode = "practice" | "room";

type RefBox<T> = {
  current: T;
};

type ConnectionRefs = {
  socketRef: RefBox<RealtimeSocket | null>;
  socketModeRef: RefBox<RealtimeConnectionMode | null>;
  storedRoomJoinInFlightRef: RefBox<boolean>;
};

type ConnectionSetters = {
  setSocketMode: (mode: RealtimeConnectionMode | null) => void;
  setConnected: (connected: boolean) => void;
};

type CreateSocket = typeof createRealtimeSocket;

export function openRealtimeConnection({
  refs,
  setters,
  transport,
  url,
  mode,
  attachHandlers,
  createSocket = createRealtimeSocket
}: {
  refs: ConnectionRefs;
  setters: ConnectionSetters;
  transport: RealtimeTransport;
  url: string;
  mode: RealtimeConnectionMode;
  attachHandlers: (socket: RealtimeSocket, mode: RealtimeConnectionMode) => void;
  createSocket?: CreateSocket;
}): RealtimeSocket {
  const previousSocket = refs.socketRef.current;
  refs.socketRef.current = null;
  refs.storedRoomJoinInFlightRef.current = false;
  previousSocket?.disconnect();

  const socket = createSocket({ transport, url });
  refs.socketRef.current = socket;
  refs.socketModeRef.current = mode;
  setters.setSocketMode(mode);
  attachHandlers(socket, mode);
  return socket;
}

export function getRoomRealtimeUrl(realtimeUrl: string, roomCode: string): string {
  return new URL(`/rooms/${roomCode}/socket`, realtimeUrl).toString();
}

export function disconnectRealtimeConnection({
  refs,
  setters
}: {
  refs: ConnectionRefs;
  setters: ConnectionSetters;
}): void {
  const socket = refs.socketRef.current;
  refs.socketRef.current = null;
  refs.socketModeRef.current = null;
  refs.storedRoomJoinInFlightRef.current = false;
  socket?.disconnect();
  setters.setSocketMode(null);
  setters.setConnected(false);
}

export function disconnectPracticeRealtimeConnection({
  refs,
  setters
}: {
  refs: ConnectionRefs;
  setters: ConnectionSetters;
}): boolean {
  const socket = getPracticeSocketToRelease(refs.socketRef.current, refs.socketModeRef.current);
  if (!socket) {
    return false;
  }

  refs.socketRef.current = null;
  refs.socketModeRef.current = null;
  socket.disconnect();
  setters.setSocketMode(null);
  setters.setConnected(false);
  return true;
}
