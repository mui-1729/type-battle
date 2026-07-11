import type { AckResponse, PromptCategory } from "@type-battle/shared";
import { startDailyPractice, startPractice } from "@type-battle/shared/room-engine";
import type {
  CloudflareClientMessageType,
  CloudflareServerMessage
} from "@type-battle/shared/cloudflare-events";
import { CLOUDFLARE_CLIENT_MESSAGE_TYPES } from "@type-battle/shared/cloudflare-events";
import { resolveRoomRoute } from "./room-routing.js";
import { RateLimiter } from "./rate-limiter.js";

type CloudflareSocketLike = {
  readyState: number;
  accept(): void;
  addEventListener(type: "message", handler: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", handler: (event: CloseEvent) => void): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
};

type SocketState = {
  socketId: string;
  clientIp: string;
  idleTimer?: ReturnType<typeof setTimeout>;
};

type AttachSocketOptions = {
  clientIp?: string;
};

type ParsedClientMessage = {
  id: string;
  type: string;
  payload: unknown;
};

type PracticePayload = {
  nickname: string;
  category: PromptCategory;
};

type DailyPracticePayload = {
  nickname: string;
};

export type RoomRateLimitAction = "create" | "join";

export type RoomRateLimitInput = {
  action: RoomRateLimitAction;
  clientIp: string;
  guestId: string;
};

export type RoomRateLimitResult = { ok: true } | { ok: false; error: string };

const OPEN_STATE = 1;
const INVALID_MESSAGE_ERROR = "リクエストの形式が正しくありません。";
const MAX_WEB_SOCKET_MESSAGE_BYTES = 16 * 1024;
const MAX_MESSAGE_ID_LENGTH = 80;
const MAX_GATEWAY_SOCKETS = 256;
const GATEWAY_SOCKET_IDLE_MS = 60_000;
const ROOM_COMMAND_ERROR = "Room commands must use /rooms/:roomCode/socket.";
export const GATEWAY_ROOM_RATE_LIMIT_PATH = "/__internal/room-rate-limit";

const ROOM_LIFECYCLE_COMMANDS = new Set<CloudflareClientMessageType>([
  "client:room:create",
  "client:room:join",
  "client:room:leave",
  "client:player:ready",
  "client:room:setPromptCategory",
  "client:room:setBotDifficulty",
  "client:room:setMatchRule",
  "client:match:start",
  "client:typing:progress",
  "client:typing:finish",
  "client:match:rematch"
]);

export class RealtimeGatewayDurableObject {
  private readonly sockets = new Map<string, CloudflareSocketLike>();
  private readonly socketStates = new Map<string, SocketState>();
  private readonly roomCreateIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  private readonly roomCreateGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
  private readonly roomJoinIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 100 });
  private readonly roomJoinGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
  readonly ready: Promise<void>;

  constructor(private readonly state: DurableObjectState) {
    this.ready = this.state.blockConcurrencyWhile(async () => {});
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    const url = new URL(request.url);
    const route = resolveRoomRoute(url.pathname);

    if (url.pathname === GATEWAY_ROOM_RATE_LIMIT_PATH) {
      return this.handleRoomRateLimitRequest(request);
    }

    if (route?.action === "state") {
      return new Response("Room state is handled by room authority.", { status: 410 });
    }

    if (isWebSocketUpgrade(request)) {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === "/ready") {
      return this.handleReadinessRequest();
    }

    if (url.pathname === "/metrics") {
      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-gateway",
        sockets: this.sockets.size,
        socketStates: this.socketStates.size
      });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-gateway",
        sockets: this.sockets.size
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.ready;
  }

  attachSocket(socket: CloudflareSocketLike, options: AttachSocketOptions = {}): string {
    const socketId = crypto.randomUUID();
    if (this.sockets.size >= MAX_GATEWAY_SOCKETS) {
      socket.accept();
      socket.close(1013, "Gateway connection limit exceeded.");
      return socketId;
    }

    this.sockets.set(socketId, socket);
    this.socketStates.set(socketId, {
      socketId,
      clientIp: normalizeClientIp(options.clientIp)
    });
    socket.accept();

    socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(socketId, event.data);
    });

    socket.addEventListener("close", () => {
      this.detachSocket(socketId);
    });
    this.scheduleSocketIdleTimeout(socketId);

    return socketId;
  }

  private async handleReadinessRequest(): Promise<Response> {
    const key = "__readiness";
    const value = new Date().toISOString();

    try {
      await this.state.storage.put(key, value);
      const stored = await this.state.storage.get<string>(key);
      await this.state.storage.delete(key);

      if (stored !== value) {
        return Response.json({ ok: false, error: "storage verification failed" }, { status: 503 });
      }

      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-gateway",
        check: "readiness",
        timestamp: value
      });
    } catch (error) {
      console.warn(JSON.stringify({
        event: "readiness_failed",
        error: error instanceof Error ? error.message : String(error)
      }));
      return Response.json({ ok: false, error: "readiness failed" }, { status: 503 });
    }
  }

  private async handleRoomRateLimitRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return Response.json({ ok: false, error: INVALID_MESSAGE_ERROR } satisfies RoomRateLimitResult, {
        status: 400
      });
    }

    const input = parseRoomRateLimitInput(payload);

    if (!input) {
      return Response.json({ ok: false, error: INVALID_MESSAGE_ERROR } satisfies RoomRateLimitResult, {
        status: 400
      });
    }

    return Response.json(this.checkRoomRequestRateLimit(input));
  }

  private checkRoomRequestRateLimit(input: RoomRateLimitInput): RoomRateLimitResult {
    const clientIp = normalizeClientIp(input.clientIp);
    const guestId = input.guestId.trim();

    if (!guestId) {
      return { ok: false, error: INVALID_MESSAGE_ERROR };
    }

    if (input.action === "create") {
      if (!this.roomCreateIpLimiter.isAllowed(clientIp)) {
        return {
          ok: false,
          error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)"
        };
      }

      if (!this.roomCreateGuestLimiter.isAllowed(guestId)) {
        return {
          ok: false,
          error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
        };
      }

      return { ok: true };
    }

    if (!this.roomJoinIpLimiter.isAllowed(clientIp)) {
      return {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)"
      };
    }

    if (!this.roomJoinGuestLimiter.isAllowed(guestId)) {
      return {
        ok: false,
        error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
      };
    }

    return { ok: true };
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.attachSocket(server as unknown as CloudflareSocketLike, {
      clientIp: readClientIp(request.headers)
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private async handleSocketMessage(socketId: string, rawMessage: unknown): Promise<void> {
    this.scheduleSocketIdleTimeout(socketId);
    if (typeof rawMessage !== "string") {
      return;
    }

    if (byteLength(rawMessage) > MAX_WEB_SOCKET_MESSAGE_BYTES) {
      this.sockets.get(socketId)?.close(1009, "Message too large.");
      this.detachSocket(socketId);
      return;
    }

    const message = parseClientMessage(rawMessage);

    if (!message) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    if (!isCloudflareClientMessageType(message.type)) {
      this.sendError(socketId, INVALID_MESSAGE_ERROR);
      return;
    }

    if (ROOM_LIFECYCLE_COMMANDS.has(message.type)) {
      this.sendAck(socketId, message.id, message.type, {
        ok: false,
        error: ROOM_COMMAND_ERROR
      });
      return;
    }

    switch (message.type) {
      case "client:practice:start":
        await this.handlePracticeStart(socketId, message.id, message.payload);
        return;
      case "client:practice:dailyStart":
        await this.handleDailyPracticeStart(socketId, message.id, message.payload);
        return;
      default:
        return;
    }
  }

  private async handlePracticeStart(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parsePracticePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:practice:start", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const practice = startPractice(parsedPayload.nickname, parsedPayload.category);
    this.sendAck(socketId, messageId, "client:practice:start", { ok: true, data: practice });
  }

  private async handleDailyPracticeStart(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsedPayload = parseDailyPracticePayload(payload);

    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:practice:dailyStart", { ok: false, error: INVALID_MESSAGE_ERROR });
      return;
    }

    const practice = startDailyPractice(parsedPayload.nickname);
    this.sendAck(socketId, messageId, "client:practice:dailyStart", { ok: true, data: practice });
  }

  private sendAck(
    socketId: string,
    replyTo: string,
    command: CloudflareClientMessageType,
    payload: AckResponse<unknown>
  ): void {
    this.sendMessage(socketId, {
      id: crypto.randomUUID(),
      type: "server:ack",
      replyTo,
      command,
      payload
    } as CloudflareServerMessage);
  }

  private sendError(socketId: string, message: string): void {
    this.sendMessage(socketId, {
      id: crypto.randomUUID(),
      type: "server:error",
      payload: { message }
    });
  }

  private sendMessage(socketId: string, message: CloudflareServerMessage): void {
    const socket = this.sockets.get(socketId);

    if (!socket || socket.readyState !== OPEN_STATE) {
      this.detachSocket(socketId);
      return;
    }

    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.detachSocket(socketId);
    }
  }

  private detachSocket(socketId: string): void {
    const socketState = this.socketStates.get(socketId);
    if (socketState?.idleTimer) {
      clearTimeout(socketState.idleTimer);
    }
    this.sockets.delete(socketId);
    this.socketStates.delete(socketId);
  }

  private scheduleSocketIdleTimeout(socketId: string): void {
    const socketState = this.socketStates.get(socketId);
    if (!socketState) {
      return;
    }

    if (socketState.idleTimer) {
      clearTimeout(socketState.idleTimer);
    }
    socketState.idleTimer = setTimeout(() => {
      const socket = this.sockets.get(socketId);
      this.detachSocket(socketId);
      if (socket?.readyState === OPEN_STATE) {
        socket.close(1008, "Idle connection closed.");
      }
    }, GATEWAY_SOCKET_IDLE_MS);
    this.socketStates.set(socketId, socketState);
  }
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function parseClientMessage(rawMessage: string): ParsedClientMessage | null {
  let message: unknown;

  try {
    message = JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(message)) {
    return null;
  }

  if (
    typeof message.id !== "string" ||
    message.id.length === 0 ||
    message.id.length > MAX_MESSAGE_ID_LENGTH ||
    typeof message.type !== "string"
  ) {
    return null;
  }

  return {
    id: message.id,
    type: message.type,
    payload: message.payload
  };
}

function isCloudflareClientMessageType(type: string): type is CloudflareClientMessageType {
  return CLOUDFLARE_CLIENT_MESSAGE_TYPES.includes(type as CloudflareClientMessageType);
}

function parseRoomRateLimitInput(payload: unknown): RoomRateLimitInput | null {
  if (!isRecord(payload)) {
    return null;
  }

  const action = payload.action;
  const clientIp = readString(payload.clientIp);
  const guestId = readString(payload.guestId);

  if ((action !== "create" && action !== "join") || !clientIp || !guestId) {
    return null;
  }

  return {
    action,
    clientIp,
    guestId
  };
}

function parsePracticePayload(payload: unknown): PracticePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nickname = readString(payload.nickname);
  const category = readPromptCategory(payload.category);

  if (!nickname || !category) {
    return null;
  }

  return {
    nickname,
    category
  };
}

function parseDailyPracticePayload(payload: unknown): DailyPracticePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nickname = readString(payload.nickname);

  if (!nickname) {
    return null;
  }

  return { nickname };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readPromptCategory(value: unknown): PromptCategory | null {
  return value === "short" || value === "standard" || value === "long" ? value : null;
}

function normalizeClientIp(clientIp: string | undefined): string {
  const trimmed = clientIp?.trim();
  return trimmed ? trimmed : "unknown";
}

function readClientIp(headers: Headers): string {
  const connectingIp = headers.get("cf-connecting-ip");

  if (connectingIp) {
    return connectingIp;
  }

  const forwardedFor = headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return "unknown";
}
