import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { AckResponse, ClientToServerEvents, ServerToClientEvents } from "@type-battle/shared";
import type {
  CloudflareClientEventName,
  CloudflareClientMessage,
  CloudflareInboundMessage,
  CloudflareServerEventName
} from "@type-battle/shared";

export type RealtimeTransport = "socketio" | "cloudflare";

type ConnectionEvents = {
  connect: () => void;
  disconnect: () => void;
};

type RealtimeEventMap = ConnectionEvents & ServerToClientEvents;
type RealtimeEventName = keyof RealtimeEventMap;
type RealtimeEventHandler<K extends RealtimeEventName> = RealtimeEventMap[K];
type ClientEmitArgs<K extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[K]> extends [infer Payload, infer Ack]
  ? [payload: Payload, ack: Ack]
  : Parameters<ClientToServerEvents[K]> extends [infer Payload]
    ? [payload: Payload]
    : never;

export type RealtimeSocket = {
  on<K extends RealtimeEventName>(event: K, handler: RealtimeEventHandler<K>): void;
  off<K extends RealtimeEventName>(event: K, handler?: RealtimeEventHandler<K>): void;
  emit<K extends keyof ClientToServerEvents>(event: K, ...args: ClientEmitArgs<K>): void;
  disconnect(): void;
};

type AnyListener = (...args: unknown[]) => void;

const CLOUDFLARE_CLIENT_EVENT_MAP: Record<keyof ClientToServerEvents, CloudflareClientEventName> = {
  "room:create": "client:room:create",
  "room:join": "client:room:join",
  "room:leave": "client:room:leave",
  "player:ready": "client:player:ready",
  "room:setPromptCategory": "client:room:setPromptCategory",
  "room:setBotDifficulty": "client:room:setBotDifficulty",
  "room:setMatchRule": "client:room:setMatchRule",
  "match:start": "client:match:start",
  "typing:progress": "client:typing:progress",
  "typing:finish": "client:typing:finish",
  "match:rematch": "client:match:rematch",
  "practice:start": "client:practice:start",
  "practice:dailyStart": "client:practice:dailyStart"
};

const CLOUDFLARE_SERVER_EVENT_TO_APP_EVENT: Record<CloudflareServerEventName, keyof ServerToClientEvents> = {
  "server:room:state": "room:state",
  "server:player:progress": "player:progress",
  "server:match:countdown": "match:countdown",
  "server:match:started": "match:started",
  "server:match:result": "match:result",
  "server:error": "match:error"
};

const RECONNECT_DELAY_MS = 1_000;

export function createRealtimeSocket(config: { transport: RealtimeTransport; url: string }): RealtimeSocket {
  return config.transport === "cloudflare"
    ? createCloudflareRealtimeSocket(config.url)
    : createSocketIoRealtimeSocket(config.url);
}

export function getDefaultRealtimeUrl(transport: RealtimeTransport, location: Location): string | null {
  if (!location.hostname || location.hostname === "vercel.app" || location.hostname.endsWith(".vercel.app")) {
    return null;
  }

  if (transport === "cloudflare") {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.hostname}:8787`;
  }

  const protocol = location.protocol === "https:" ? "https" : "http";
  return `${protocol}://${location.hostname}:3001`;
}

function createSocketIoRealtimeSocket(url: string): RealtimeSocket {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, {
    transports: ["websocket"]
  });

  return {
    on: socket.on.bind(socket) as RealtimeSocket["on"],
    off: socket.off.bind(socket) as RealtimeSocket["off"],
    emit: socket.emit.bind(socket) as RealtimeSocket["emit"],
    disconnect() {
      socket.disconnect();
    }
  };
}

function createCloudflareRealtimeSocket(url: string): RealtimeSocket {
  const listeners = new Map<string, Set<AnyListener>>();
  const pendingAcks = new Map<string, (response: AckResponse<unknown>) => void>();
  const outboundMessages: string[] = [];
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manuallyClosed = false;

  const notify = <K extends RealtimeEventName>(event: K, ...args: Parameters<RealtimeEventMap[K]>) => {
    const eventListeners = listeners.get(event);

    if (!eventListeners) {
      return;
    }

    for (const listener of eventListeners) {
      listener(...args);
    }
  };

  const flushOutboundMessages = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (outboundMessages.length > 0) {
      const message = outboundMessages.shift();

      if (message) {
        socket.send(message);
      }
    }
  };

  const failPendingAcks = (message: string) => {
    for (const ack of pendingAcks.values()) {
      ack({ ok: false, error: message });
    }

    pendingAcks.clear();
  };

  const scheduleReconnect = () => {
    if (reconnectTimer || manuallyClosed) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;

      if (!manuallyClosed) {
        connect();
      }
    }, RECONNECT_DELAY_MS);
  };

  const handleMessage = (event: MessageEvent) => {
    if (typeof event.data !== "string") {
      return;
    }

    let parsed: CloudflareInboundMessage;

    try {
      parsed = JSON.parse(event.data) as CloudflareInboundMessage;
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return;
    }

    if (parsed.type === "server:ack") {
      const replyTo = ("replyTo" in parsed ? parsed.replyTo : parsed.id) as string;
      const ackPayload = ("payload" in parsed ? parsed.payload : parsed.response) as AckResponse<unknown>;
      const ack = pendingAcks.get(replyTo);

      if (ack) {
        ack(ackPayload);
        pendingAcks.delete(replyTo);
      }

      return;
    }

    if (parsed.type === "server:error") {
      notify("match:error", parsed.payload);
      return;
    }

    const appEvent = CLOUDFLARE_SERVER_EVENT_TO_APP_EVENT[parsed.type];

    if (!appEvent) {
      return;
    }

    notify(appEvent, parsed.payload as never);
  };

  const connect = () => {
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      flushOutboundMessages();
      notify("connect");
    });
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", () => {
      notify("disconnect");

      if (!manuallyClosed) {
        failPendingAcks("Realtime connection closed.");
        scheduleReconnect();
      }

      socket = null;
    });
    socket.addEventListener("error", () => {
      notify("match:error", { message: "Realtime connection error." });
    });
  };

  connect();

  return {
    on(event, handler) {
      const eventListeners = listeners.get(event) ?? new Set<AnyListener>();
      eventListeners.add(handler as AnyListener);
      listeners.set(event, eventListeners);
    },
    off(event, handler) {
      const eventListeners = listeners.get(event);

      if (!eventListeners) {
        return;
      }

      if (handler) {
        eventListeners.delete(handler as AnyListener);
      } else {
        eventListeners.clear();
      }

      if (eventListeners.size === 0) {
        listeners.delete(event);
      }
    },
    emit(event, ...args) {
      const wireEvent = CLOUDFLARE_CLIENT_EVENT_MAP[event];
      const payload = args[0];
      const ack = args[1] as ((response: AckResponse<unknown>) => void) | undefined;
      const id = globalThis.crypto?.randomUUID?.() ?? `message_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      if (ack) {
        pendingAcks.set(id, ack);
      }

      const message: CloudflareClientMessage = {
        id,
        type: wireEvent,
        payload: payload as never
      };
      const serializedMessage = JSON.stringify(message);

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(serializedMessage);
        return;
      }

      outboundMessages.push(serializedMessage);
    },
    disconnect() {
      manuallyClosed = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      outboundMessages.length = 0;
      pendingAcks.clear();

      if (socket) {
        socket.close();
        socket = null;
      }
    }
  };
}
