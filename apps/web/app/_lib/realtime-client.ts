import type { AckResponse, ClientToServerEvents, ServerToClientEvents } from "@type-battle/shared";
import type {
  CloudflareClientEventName,
  CloudflareClientMessage,
  CloudflareInboundMessage,
  CloudflareServerEventName
} from "@type-battle/shared";

export type RealtimeTransport = "cloudflare";

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
const RECONNECT_MAX_DELAY_MS = 15_000;
const ACK_TIMEOUT_MS = 10_000;
const MAX_OUTBOUND_QUEUE_MESSAGES = 20;
const MAX_OUTBOUND_QUEUE_BYTES = 32 * 1024;

type PendingAck = {
  callback: (response: AckResponse<unknown>) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type QueuedMessage = {
  id: string;
  event: CloudflareClientEventName;
  serialized: string;
  bytes: number;
};

export function createRealtimeSocket(config: { transport: RealtimeTransport; url: string }): RealtimeSocket {
  void config.transport;
  return createCloudflareRealtimeSocket(config.url);
}

export function resolveRealtimeTransport(config: {
  requestedTransport?: string | null | undefined;
  nodeEnv?: string | null | undefined;
}): RealtimeTransport {
  void config.requestedTransport;
  void config.nodeEnv;
  return "cloudflare";
}

export function getDefaultRealtimeUrl(transport: RealtimeTransport, location: Location): string | null {
  void transport;

  if (!location.hostname || location.hostname === "vercel.app" || location.hostname.endsWith(".vercel.app")) {
    return null;
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.hostname}:8787`;
}

function createCloudflareRealtimeSocket(url: string): RealtimeSocket {
  const listeners = new Map<string, Set<AnyListener>>();
  const pendingAcks = new Map<string, PendingAck>();
  const outboundMessages: QueuedMessage[] = [];
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
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
        socket.send(message.serialized);
      }
    }
  };

  const failPendingAcks = (message: string) => {
    for (const [id, ack] of pendingAcks.entries()) {
      clearTimeout(ack.timeout);
      ack.callback({ ok: false, error: message });
      removeQueuedMessage(id);
    }

    pendingAcks.clear();
  };

  const removeQueuedMessage = (id: string) => {
    const index = outboundMessages.findIndex((message) => message.id === id);
    if (index >= 0) {
      outboundMessages.splice(index, 1);
    }
  };

  const addPendingAck = (id: string, ack: (response: AckResponse<unknown>) => void) => {
    const timeout = setTimeout(() => {
      pendingAcks.delete(id);
      removeQueuedMessage(id);
      ack({ ok: false, error: "Realtime request timed out." });
    }, ACK_TIMEOUT_MS);

    pendingAcks.set(id, {
      callback: ack,
      timeout
    });
  };

  const scheduleReconnect = () => {
    if (reconnectTimer || manuallyClosed) {
      return;
    }

    const baseDelay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_DELAY_MS * 2 ** reconnectAttempts);
    const jitter = Math.floor(Math.random() * 250);
    reconnectAttempts += 1;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;

      if (!manuallyClosed) {
        connect();
      }
    }, baseDelay + jitter);
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
      const ackMessage = parsed as {
        id: string;
        type: "server:ack";
        replyTo?: string;
        payload?: AckResponse<unknown>;
        response?: AckResponse<unknown>;
      };
      const replyTo = ackMessage.replyTo ?? ackMessage.id;
      const ackPayload = ackMessage.payload ?? ackMessage.response;
      const ack = pendingAcks.get(replyTo);

      if (ack && ackPayload) {
        clearTimeout(ack.timeout);
        ack.callback(ackPayload);
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
      reconnectAttempts = 0;
      notify("connect");
      flushOutboundMessages();
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
        addPendingAck(id, ack);
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

      if (!isReplayableWhenDisconnected(wireEvent)) {
        if (ack) {
          const pending = pendingAcks.get(id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingAcks.delete(id);
          }
          ack({ ok: false, error: "Realtime connection is not ready." });
        }
        return;
      }

      const queuedMessage: QueuedMessage = {
        id,
        event: wireEvent,
        serialized: serializedMessage,
        bytes: serializedMessage.length
      };
      outboundMessages.push(queuedMessage);

      while (
        outboundMessages.length > MAX_OUTBOUND_QUEUE_MESSAGES ||
        outboundMessages.reduce((total, message) => total + message.bytes, 0) > MAX_OUTBOUND_QUEUE_BYTES
      ) {
        const dropped = outboundMessages.shift();
        if (dropped) {
          const pending = pendingAcks.get(dropped.id);
          if (pending) {
            clearTimeout(pending.timeout);
            pending.callback({ ok: false, error: "Realtime outbound queue overflowed." });
            pendingAcks.delete(dropped.id);
          }
        }
      }
    },
    disconnect() {
      manuallyClosed = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      outboundMessages.length = 0;
      failPendingAcks("Realtime connection closed.");

      if (socket) {
        socket.close();
        socket = null;
      }
    }
  };
}

function isReplayableWhenDisconnected(event: CloudflareClientEventName): boolean {
  return (
    event === "client:room:create" ||
    event === "client:room:join" ||
    event === "client:practice:start" ||
    event === "client:practice:dailyStart"
  );
}
