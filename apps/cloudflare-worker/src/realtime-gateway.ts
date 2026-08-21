import type { AckResponse, DeviceKind, PromptCategory, RoomState } from "@type-battle/shared";
import { createRoomCode, validateNickname } from "@type-battle/shared";
import { startDailyPractice, startPractice } from "@type-battle/shared/room-engine";
import type {
  CloudflareClientMessageType,
  CloudflareServerMessage,
  MatchmakingJoinResponse,
  MatchmakingMatchedPayload,
  QuickMatchHostReadyPayload
} from "@type-battle/shared/cloudflare-events";
import { CLOUDFLARE_CLIENT_MESSAGE_TYPES } from "@type-battle/shared/cloudflare-events";
import { readCloudflareClientIp } from "./client-ip.js";
import {
  MatchmakingQueue,
  type MatchmakingMatch,
  type MatchmakingTicket
} from "./matchmaking-queue.js";
import {
  isAssignedMatchmakingHostConnected,
  MATCHMAKING_ROOM_BOOTSTRAP_PATH,
  MATCHMAKING_ROOM_CLEANUP_PATH
} from "./matchmaking-room-bootstrap.js";
import { resolveRoomRoute } from "./room-routing.js";

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

type MatchmakingJoinPayload = {
  guestId: string;
  sessionId: string;
  nickname: string;
  deviceKind: DeviceKind;
  blockedGuestIds: string[];
};

type MatchmakingCancelPayload = {
  guestId: string;
  sessionId: string;
  ticketId: string;
  matchId?: string;
};

type ParsedMatchmakingJoinPayload =
  | { ok: true; value: MatchmakingJoinPayload }
  | { ok: false; error: string };

type RealtimeGatewayEnv = {
  ROOMS?: DurableObjectNamespace;
};

type PendingMatch = {
  matchId: string;
  roomCode: string;
  host: MatchmakingTicket;
  guest: MatchmakingTicket;
  hostReadyDeadlineAt: number;
  timer: ReturnType<typeof setTimeout>;
};

export type RoomRateLimitAction = "create" | "join";

export type RoomRateLimitInput = {
  action: RoomRateLimitAction;
  clientIp: string;
  guestId: string;
};

export type RoomRateLimitResult = { ok: true } | { ok: false; error: string };

type PersistedRateLimitRecord = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  windowMs: number;
  max: number;
};

type RateLimitDimension = "ip" | "guest";

const OPEN_STATE = 1;
const INVALID_MESSAGE_ERROR = "リクエストの形式が正しくありません。";
const MAX_WEB_SOCKET_MESSAGE_BYTES = 16 * 1024;
const MAX_MESSAGE_ID_LENGTH = 80;
const MAX_GATEWAY_SOCKETS = 256;
const MAX_MATCHMAKING_GUEST_ID_LENGTH = 80;
const MAX_MATCHMAKING_BLOCKED_GUEST_IDS = 100;
const MAX_MATCHMAKING_SESSION_ID_LENGTH = 96;
const MAX_PENDING_MATCHES = 64;
const MATCHMAKING_HOST_READY_MS = 10_000;
const MATCHMAKING_ROOM_CODE_ATTEMPTS = 5;
// Leave enough headroom for classrooms and offices sharing one public IP while
// preventing one address from occupying the Durable Object's entire capacity.
const MAX_GATEWAY_SOCKETS_PER_CLIENT_IP = 32;
const GATEWAY_SOCKET_IDLE_MS = 15 * 60_000;
const ROOM_COMMAND_ERROR = "Room commands must use /rooms/:roomCode/socket.";
export const GATEWAY_ROOM_RATE_LIMIT_PATH = "/__internal/room-rate-limit";
const RATE_LIMIT_STORAGE_PREFIX = "rate-limit:v1:";
const RATE_LIMIT_CLEANUP_BUCKET_MS = 5 * 60_000;
const ROOM_RATE_LIMIT_CONFIG: Record<RoomRateLimitAction, Record<RateLimitDimension, RateLimitConfig>> = {
  create: {
    ip: { windowMs: 10 * 60 * 1000, max: 30 },
    guest: { windowMs: 10 * 60 * 1000, max: 10 }
  },
  join: {
    ip: { windowMs: 10 * 60 * 1000, max: 100 },
    guest: { windowMs: 10 * 60 * 1000, max: 30 }
  }
};

const ROOM_LIFECYCLE_COMMANDS = new Set<CloudflareClientMessageType>([
  "client:room:create",
  "client:room:join",
  "client:room:leave",
  "client:player:ready",
  "client:player:reaction",
  "client:player:equipment",
  "client:room:setPromptCategory",
  "client:room:setBotDifficulty",
  "client:room:setMatchRule",
  "client:match:start",
  "client:typing:progress",
  "client:typing:finish",
  "client:match:rematch"
]);

const ROOM_COMMANDS_WITH_ACK = new Set<CloudflareClientMessageType>([
  "client:room:create",
  "client:room:join",
  "client:player:reaction",
  "client:room:setPromptCategory",
  "client:room:setBotDifficulty",
  "client:room:setMatchRule",
  "client:match:start",
  "client:match:rematch"
]);

export class RealtimeGatewayDurableObject {
  private readonly sockets = new Map<string, CloudflareSocketLike>();
  private readonly socketStates = new Map<string, SocketState>();
  private readonly matchmakingQueue = new MatchmakingQueue();
  private readonly matchmakingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingMatches = new Map<string, PendingMatch>();
  private socketEventChain: Promise<void> = Promise.resolve();
  readonly ready: Promise<void>;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: RealtimeGatewayEnv = {}
  ) {
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
        socketStates: this.socketStates.size,
        matchmakingTickets: this.matchmakingQueue.size,
        matchmakingPendingMatches: this.pendingMatches.size
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
    await this.cleanupExpiredRateLimits();
  }

  attachSocket(socket: CloudflareSocketLike, options: AttachSocketOptions = {}): string {
    const socketId = crypto.randomUUID();
    const clientIp = normalizeClientIp(options.clientIp);
    const hasClientIp = Boolean(options.clientIp?.trim());
    const clientSocketCount = hasClientIp
      ? Array.from(this.socketStates.values())
          .filter((state) => state.clientIp === clientIp)
          .length
      : 0;
    if (
      this.sockets.size >= MAX_GATEWAY_SOCKETS ||
      (hasClientIp && clientSocketCount >= MAX_GATEWAY_SOCKETS_PER_CLIENT_IP)
    ) {
      socket.accept();
      socket.close(1013, "Gateway connection limit exceeded.");
      return socketId;
    }

    this.sockets.set(socketId, socket);
    this.socketStates.set(socketId, {
      socketId,
      clientIp
    });
    socket.accept();

    socket.addEventListener("message", (event) => {
      this.enqueueSocketEvent(socketId, () => this.handleSocketMessage(socketId, event.data));
    });

    socket.addEventListener("close", () => {
      this.enqueueSocketEvent(socketId, () => {
        this.detachSocket(socketId);
      });
    });
    this.scheduleSocketIdleTimeout(socketId);

    return socketId;
  }

  private enqueueSocketEvent(socketId: string, operation: () => void | Promise<void>): void {
    const current = this.socketEventChain
      .then(operation)
      .catch((error: unknown) => {
        console.warn(JSON.stringify({
          event: "gateway_socket_event_failed",
          socketId,
          error: error instanceof Error ? error.message : String(error)
        }));
      });
    this.socketEventChain = current;
    this.state.waitUntil(current);
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

    return Response.json(await this.checkRoomRequestRateLimit(input));
  }

  private async checkRoomRequestRateLimit(input: RoomRateLimitInput): Promise<RoomRateLimitResult> {
    const clientIp = normalizeClientIp(input.clientIp);
    const guestId = input.guestId.trim();

    if (!guestId) {
      return { ok: false, error: INVALID_MESSAGE_ERROR };
    }

    const now = Date.now();
    const config = ROOM_RATE_LIMIT_CONFIG[input.action];
    return await this.state.storage.transaction(async (transaction) => {
      const ipResult = await consumeRateLimit(
        transaction,
        createRateLimitStorageKey(input.action, "ip", clientIp),
        config.ip,
        now
      );

      if (!ipResult.allowed) {
        await scheduleRateLimitCleanup(transaction, ipResult.resetAt, now);
        return {
          ok: false,
          error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)"
        } satisfies RoomRateLimitResult;
      }

      const guestResult = await consumeRateLimit(
        transaction,
        createRateLimitStorageKey(input.action, "guest", guestId),
        config.guest,
        now
      );

      await scheduleRateLimitCleanup(
        transaction,
        Math.min(ipResult.resetAt, guestResult.resetAt),
        now
      );
      return guestResult.allowed
        ? { ok: true } satisfies RoomRateLimitResult
        : {
            ok: false,
            error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)"
          } satisfies RoomRateLimitResult;
    });
  }

  private async cleanupExpiredRateLimits(): Promise<void> {
    const now = Date.now();
    await this.state.storage.transaction(async (transaction) => {
      const records = await transaction.list<PersistedRateLimitRecord>({
        prefix: RATE_LIMIT_STORAGE_PREFIX
      });
      let nextResetAt: number | null = null;

      for (const [key, record] of records) {
        if (!isPersistedRateLimitRecord(record) || record.resetAt <= now) {
          await transaction.delete(key);
          continue;
        }

        if (nextResetAt === null || record.resetAt < nextResetAt) {
          nextResetAt = record.resetAt;
        }
      }

      if (nextResetAt === null) {
        await transaction.deleteAlarm();
      } else {
        await transaction.setAlarm(ceilToBucket(nextResetAt, RATE_LIMIT_CLEANUP_BUCKET_MS));
      }
    });
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
      clientIp: readCloudflareClientIp(request.headers)
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
      if (ROOM_COMMANDS_WITH_ACK.has(message.type)) {
        this.sendAck(socketId, message.id, message.type, {
          ok: false,
          error: ROOM_COMMAND_ERROR
        });
      } else {
        this.sendError(socketId, ROOM_COMMAND_ERROR);
      }
      return;
    }

    switch (message.type) {
      case "client:practice:start":
        await this.handlePracticeStart(socketId, message.id, message.payload);
        return;
      case "client:practice:dailyStart":
        await this.handleDailyPracticeStart(socketId, message.id, message.payload);
        return;
      case "client:matchmaking:join":
        await this.handleMatchmakingJoin(socketId, message.id, message.payload);
        return;
      case "client:matchmaking:cancel":
        this.handleMatchmakingCancel(socketId, message.id, message.payload);
        return;
      case "client:matchmaking:hostReady":
        await this.handleMatchmakingHostReady(socketId, message.id, message.payload);
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

  private async handleMatchmakingJoin(socketId: string, messageId: string, payload: unknown): Promise<void> {
    const parsedPayload = parseMatchmakingJoinPayload(payload);
    if (!parsedPayload.ok) {
      this.sendAck(socketId, messageId, "client:matchmaking:join", {
        ok: false,
        error: parsedPayload.error
      });
      return;
    }

    if (this.pendingMatches.size >= MAX_PENDING_MATCHES) {
      this.sendAck(socketId, messageId, "client:matchmaking:join", {
        ok: false,
        error: "マッチング処理が混雑しています。しばらくしてから再試行してください。"
      });
      return;
    }

    const { guestId, sessionId, nickname, deviceKind, blockedGuestIds } = parsedPayload.value;
    const existingTicket = this.matchmakingQueue
      .snapshot()
      .find((ticket) => ticket.guestId === guestId);

    if (
      existingTicket &&
      (existingTicket.socketId !== socketId || existingTicket.sessionId !== sessionId)
    ) {
      this.sendAck(socketId, messageId, "client:matchmaking:join", {
        ok: false,
        error: "このゲストは別の接続ですでに検索中です。"
      });
      return;
    }

    this.clearMatchmakingTimeout(guestId);
    const result = this.matchmakingQueue.join({
      guestId,
      sessionId,
      socketId,
      nickname,
      deviceKind,
      blockedGuestIds
    });

    if (result.kind === "queued") {
      this.scheduleMatchmakingTimeout(result.ticket);
      const response: MatchmakingJoinResponse = {
        status: "queued",
        ticketId: result.ticket.ticketId,
        expiresAt: result.ticket.expiresAt
      };
      this.sendAck(socketId, messageId, "client:matchmaking:join", { ok: true, data: response });
      return;
    }

    this.clearMatchmakingTimeout(result.match.host.guestId);
    this.clearMatchmakingTimeout(result.match.guest.guestId);
    const pending = await this.bootstrapMatch(result.match);
    if (!pending) {
      this.sendAck(socketId, messageId, "client:matchmaking:join", {
        ok: false,
        error: "対戦ルームを準備できませんでした。もう一度お試しください。"
      });
      this.sendMatchmakingFailure(result.match.host, "bootstrap", true);
      return;
    }

    const hostPayload = {
      ...createMatchedPayload(pending, "host"),
      role: "host" as const,
      hostReadyDeadlineAt: pending.hostReadyDeadlineAt
    };
    this.sendMessage(pending.host.socketId, {
      id: crypto.randomUUID(),
      type: "server:matchmaking:assignedHost",
      payload: hostPayload
    });
    this.sendAck(socketId, messageId, "client:matchmaking:join", {
      ok: true,
      data: {
        status: "waitingHost",
        role: "guest",
        ticketId: pending.guest.ticketId,
        matchId: pending.matchId,
        hostReadyDeadlineAt: pending.hostReadyDeadlineAt,
        opponent: {
          id: pending.host.guestId,
          nickname: pending.host.nickname
        }
      }
    });
  }

  private handleMatchmakingCancel(socketId: string, messageId: string, payload: unknown): void {
    const parsedPayload = parseMatchmakingCancelPayload(payload);
    if (!parsedPayload) {
      this.sendAck(socketId, messageId, "client:matchmaking:cancel", {
        ok: false,
        error: INVALID_MESSAGE_ERROR
      });
      return;
    }

    const ticket = this.matchmakingQueue
      .snapshot()
      .find((candidate) => candidate.guestId === parsedPayload.guestId);
    if (
      ticket &&
      ticket.socketId === socketId &&
      ticket.sessionId === parsedPayload.sessionId &&
      ticket.ticketId === parsedPayload.ticketId
    ) {
      this.matchmakingQueue.cancelGuest(parsedPayload.guestId);
      this.clearMatchmakingTimeout(parsedPayload.guestId);
      this.sendAck(socketId, messageId, "client:matchmaking:cancel", {
        ok: true,
        data: { cancelled: true }
      });
      return;
    }

    const pending = [...this.pendingMatches.values()].find((candidate) =>
      (!parsedPayload.matchId || candidate.matchId === parsedPayload.matchId) &&
      [candidate.host, candidate.guest].some((party) =>
        party.socketId === socketId &&
        party.guestId === parsedPayload.guestId &&
        party.sessionId === parsedPayload.sessionId &&
        party.ticketId === parsedPayload.ticketId
      )
    );
    if (!pending) {
      this.sendAck(socketId, messageId, "client:matchmaking:cancel", {
        ok: true,
        data: { cancelled: false }
      });
      return;
    }

    this.clearPendingMatch(pending.matchId);
    this.cleanupPendingRoom(pending);
    const other = pending.host.socketId === socketId ? pending.guest : pending.host;
    this.sendMatchmakingFailure(other, "cancelled", true, pending.matchId);
    this.sendAck(socketId, messageId, "client:matchmaking:cancel", {
      ok: true,
      data: { cancelled: true }
    });
  }

  private async handleMatchmakingHostReady(
    socketId: string,
    messageId: string,
    payload: unknown
  ): Promise<void> {
    const parsed = parseMatchmakingHostReadyPayload(payload);
    const pending = parsed ? this.pendingMatches.get(parsed.matchId) : undefined;
    if (
      !parsed ||
      !pending ||
      pending.host.socketId !== socketId ||
      pending.host.ticketId !== parsed.ticketId ||
      !this.env.ROOMS
    ) {
      this.sendAck(socketId, messageId, "client:matchmaking:hostReady", {
        ok: true,
        data: { accepted: false }
      });
      return;
    }

    try {
      const response = await this.env.ROOMS.getByName(pending.roomCode).fetch(
        new Request("https://type-battle.internal/health")
      );
      const state = await response.json() as { room?: RoomState | null };
      if (!isAssignedMatchmakingHostConnected(state.room, pending.host.guestId)) {
        this.sendAck(socketId, messageId, "client:matchmaking:hostReady", {
          ok: true,
          data: { accepted: false }
        });
        return;
      }
    } catch {
      this.sendAck(socketId, messageId, "client:matchmaking:hostReady", {
        ok: true,
        data: { accepted: false }
      });
      return;
    }

    this.clearPendingMatch(pending.matchId);
    this.sendMessage(pending.guest.socketId, {
      id: crypto.randomUUID(),
      type: "server:matchmaking:matched",
      payload: createMatchedPayload(pending, "guest")
    });
    this.sendAck(socketId, messageId, "client:matchmaking:hostReady", {
      ok: true,
      data: { accepted: true }
    });
  }

  private async bootstrapMatch(match: MatchmakingMatch): Promise<PendingMatch | null> {
    if (!this.env.ROOMS) {
      return null;
    }

    for (let attempt = 0; attempt < MATCHMAKING_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const roomCode = attempt === 0 ? match.roomCode : createRoomCode();
      try {
        const response = await this.env.ROOMS.getByName(roomCode).fetch(new Request(
          `https://type-battle.internal${MATCHMAKING_ROOM_BOOTSTRAP_PATH}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomCode,
              host: toBootstrapPlayer(match.host),
              guest: toBootstrapPlayer(match.guest)
            })
          }
        ));
        if (response.status === 409) {
          continue;
        }
        if (!response.ok) {
          return null;
        }

        const matchId = crypto.randomUUID();
        const hostReadyDeadlineAt = Date.now() + MATCHMAKING_HOST_READY_MS;
        const timer = setTimeout(() => {
          const current = this.pendingMatches.get(matchId);
          if (!current) return;
          this.pendingMatches.delete(matchId);
          this.cleanupPendingRoom(current);
          for (const party of [current.host, current.guest]) {
            this.sendMessage(party.socketId, {
              id: crypto.randomUUID(),
              type: "server:matchmaking:timeout",
              payload: {
                ticketId: party.ticketId,
                matchId,
                phase: "host",
                fallback: "com"
              }
            });
          }
        }, MATCHMAKING_HOST_READY_MS);
        const pending: PendingMatch = {
          matchId,
          roomCode,
          host: match.host,
          guest: match.guest,
          hostReadyDeadlineAt,
          timer
        };
        this.pendingMatches.set(matchId, pending);
        return pending;
      } catch {
        return null;
      }
    }

    return null;
  }

  private clearPendingMatch(matchId: string): PendingMatch | null {
    const pending = this.pendingMatches.get(matchId) ?? null;
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingMatches.delete(matchId);
    }
    return pending;
  }

  private cleanupPendingRoom(pending: PendingMatch): void {
    if (!this.env.ROOMS) return;
    const operation = this.env.ROOMS.getByName(pending.roomCode).fetch(new Request(
      `https://type-battle.internal${MATCHMAKING_ROOM_CLEANUP_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: pending.roomCode,
          hostGuestId: pending.host.guestId,
          guestGuestId: pending.guest.guestId
        })
      }
    ));
    this.state.waitUntil(operation.catch(() => undefined));
  }

  private sendMatchmakingFailure(
    ticket: MatchmakingTicket,
    reason: "bootstrap" | "cancelled" | "disconnected" | "capacity",
    retryable: boolean,
    matchId?: string
  ): void {
    this.sendMessage(ticket.socketId, {
      id: crypto.randomUUID(),
      type: "server:matchmaking:failed",
      payload: {
        ticketId: ticket.ticketId,
        ...(matchId ? { matchId } : {}),
        reason,
        retryable
      }
    });
  }

  private scheduleMatchmakingTimeout(ticket: MatchmakingTicket): void {
    this.clearMatchmakingTimeout(ticket.guestId);
    const delay = Math.max(0, ticket.expiresAt - Date.now());
    const timer = setTimeout(() => {
      this.matchmakingTimeouts.delete(ticket.guestId);
      const currentTicket = this.matchmakingQueue
        .snapshot()
        .find((candidate) => candidate.guestId === ticket.guestId);
      if (!currentTicket || currentTicket.ticketId !== ticket.ticketId) {
        return;
      }

      this.matchmakingQueue.cancelGuest(ticket.guestId);
      this.sendMessage(ticket.socketId, {
        id: crypto.randomUUID(),
        type: "server:matchmaking:timeout",
        payload: {
          ticketId: ticket.ticketId,
          phase: "queue",
          fallback: "com"
        }
      });
    }, delay);
    this.matchmakingTimeouts.set(ticket.guestId, timer);
  }

  private clearMatchmakingTimeout(guestId: string): void {
    const timer = this.matchmakingTimeouts.get(guestId);
    if (timer) {
      clearTimeout(timer);
      this.matchmakingTimeouts.delete(guestId);
    }
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
    for (const ticket of this.matchmakingQueue.removeSocket(socketId)) {
      this.clearMatchmakingTimeout(ticket.guestId);
    }
    for (const pending of [...this.pendingMatches.values()]) {
      if (pending.host.socketId !== socketId && pending.guest.socketId !== socketId) {
        continue;
      }
      this.clearPendingMatch(pending.matchId);
      this.cleanupPendingRoom(pending);
      const other = pending.host.socketId === socketId ? pending.guest : pending.host;
      this.sendMatchmakingFailure(other, "disconnected", true, pending.matchId);
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

function createMatchedPayload(match: PendingMatch, role: "host" | "guest"): MatchmakingMatchedPayload {
  const player = role === "host" ? match.host : match.guest;
  const opponent = role === "host" ? match.guest : match.host;
  return {
    roomCode: match.roomCode,
    role,
    ticketId: player.ticketId,
    matchId: match.matchId,
    opponent: {
      id: opponent.guestId,
      nickname: opponent.nickname
    }
  };
}

function toBootstrapPlayer(ticket: MatchmakingTicket) {
  return {
    guestId: ticket.guestId,
    sessionId: ticket.sessionId,
    nickname: ticket.nickname,
    deviceKind: ticket.deviceKind
  };
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

function parseMatchmakingJoinPayload(payload: unknown): ParsedMatchmakingJoinPayload {
  if (!isRecord(payload)) {
    return { ok: false, error: INVALID_MESSAGE_ERROR };
  }

  const guestId = readBoundedString(payload.guestId, MAX_MATCHMAKING_GUEST_ID_LENGTH);
  const sessionId = readBoundedString(payload.sessionId, MAX_MATCHMAKING_SESSION_ID_LENGTH);
  const nickname = readString(payload.nickname);
  const deviceKind = readDeviceKind(payload.deviceKind);
  if (!guestId || !sessionId || !nickname || !deviceKind) {
    return { ok: false, error: INVALID_MESSAGE_ERROR };
  }

  const nicknameError = validateNickname(nickname);
  if (nicknameError) {
    return { ok: false, error: nicknameError };
  }

  const blockedGuestIds = readBlockedGuestIds(payload.blockedGuestIds);
  if (!blockedGuestIds) {
    return { ok: false, error: INVALID_MESSAGE_ERROR };
  }

  return {
    ok: true,
    value: {
      guestId,
      sessionId,
      nickname,
      deviceKind,
      blockedGuestIds
    }
  };
}

function parseMatchmakingCancelPayload(payload: unknown): MatchmakingCancelPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const guestId = readBoundedString(payload.guestId, MAX_MATCHMAKING_GUEST_ID_LENGTH);
  const sessionId = readBoundedString(payload.sessionId, MAX_MATCHMAKING_SESSION_ID_LENGTH);
  const ticketId = readBoundedString(payload.ticketId, MAX_MATCHMAKING_SESSION_ID_LENGTH);
  const matchId = payload.matchId === undefined
    ? undefined
    : readBoundedString(payload.matchId, MAX_MATCHMAKING_SESSION_ID_LENGTH);
  return guestId && sessionId && ticketId && (payload.matchId === undefined || matchId)
    ? { guestId, sessionId, ticketId, ...(matchId ? { matchId } : {}) }
    : null;
}

function parseMatchmakingHostReadyPayload(payload: unknown): QuickMatchHostReadyPayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  const ticketId = readBoundedString(payload.ticketId, MAX_MATCHMAKING_SESSION_ID_LENGTH);
  const matchId = readBoundedString(payload.matchId, MAX_MATCHMAKING_SESSION_ID_LENGTH);
  return ticketId && matchId ? { ticketId, matchId } : null;
}

function readBlockedGuestIds(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const guestIds: string[] = [];
  for (const candidate of value.slice(0, MAX_MATCHMAKING_BLOCKED_GUEST_IDS)) {
    const guestId = readBoundedString(candidate, MAX_MATCHMAKING_GUEST_ID_LENGTH);
    if (!guestId) {
      return null;
    }
    guestIds.push(guestId);
  }
  return guestIds;
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

function readBoundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function readPromptCategory(value: unknown): PromptCategory | null {
  return value === "short" || value === "standard" || value === "long" ? value : null;
}

function readDeviceKind(value: unknown): DeviceKind | null {
  return value === "mobile" || value === "desktop" ? value : null;
}

function normalizeClientIp(clientIp: string | undefined): string {
  const trimmed = clientIp?.trim();
  return trimmed ? trimmed : "unknown";
}

function createRateLimitStorageKey(
  action: RoomRateLimitAction,
  dimension: RateLimitDimension,
  value: string
): string {
  return `${RATE_LIMIT_STORAGE_PREFIX}${action}:${dimension}:${encodeURIComponent(value)}`;
}

async function consumeRateLimit(
  transaction: DurableObjectTransaction,
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<{ allowed: boolean; resetAt: number }> {
  const stored = await transaction.get<unknown>(key);
  const record = isPersistedRateLimitRecord(stored) && now < stored.resetAt
    ? stored
    : { count: 0, resetAt: now + config.windowMs };

  if (record.count >= config.max) {
    return { allowed: false, resetAt: record.resetAt };
  }

  await transaction.put<PersistedRateLimitRecord>(key, {
    count: record.count + 1,
    resetAt: record.resetAt
  });
  return { allowed: true, resetAt: record.resetAt };
}

async function scheduleRateLimitCleanup(
  transaction: DurableObjectTransaction,
  resetAt: number,
  now: number
): Promise<void> {
  const currentAlarm = await transaction.getAlarm();
  const cleanupAt = ceilToBucket(resetAt, RATE_LIMIT_CLEANUP_BUCKET_MS);
  if (currentAlarm === null || (currentAlarm > now && cleanupAt < currentAlarm)) {
    await transaction.setAlarm(cleanupAt);
  }
}

function isPersistedRateLimitRecord(value: unknown): value is PersistedRateLimitRecord {
  return isRecord(value) &&
    typeof value.count === "number" &&
    Number.isSafeInteger(value.count) &&
    value.count >= 0 &&
    typeof value.resetAt === "number" &&
    Number.isFinite(value.resetAt);
}

function ceilToBucket(timestamp: number, bucketMs: number): number {
  return Math.ceil(timestamp / bucketMs) * bucketMs;
}
