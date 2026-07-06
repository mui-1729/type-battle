import type {
  AckResponse,
  CloudflareClientMessage,
  CloudflareClientMessageType,
  CloudflareResponsePayload,
  CloudflareServerEventName,
  CloudflareServerEventPayload,
  RoomState,
} from "@type-battle/shared";
import { validateNickname } from "@type-battle/shared";
import {
  BOT_TICK_MS,
  advanceBot,
  checkExpiredTimeAttackMatches,
  checkForForfeits,
  cleanupExpiredRooms,
  createRoom,
  explicitLeaveBySocket,
  finishTyping,
  joinRoom,
  leaveBySocket,
  markPlaying,
  rematch,
  rooms as engineRooms,
  setBotDifficulty,
  setMatchRule,
  setPromptCategory,
  setReady,
  startDailyPractice,
  startMatch,
  startPractice,
  updateProgress
} from "@type-battle/shared/room-engine";
import { RoomSocketHub } from "./room-socket-hub.js";
import { normalizeRoomCode, resolveRoomRoute } from "./room-routing.js";

export interface Env {
  ROOMS: DurableObjectNamespace;
  ROOM_STATE_WRITE_TOKEN: string;
}

const REALTIME_DO_NAME = "realtime";
const ROOM_STATE_STORAGE_PREFIX = "room-state:";
const MAINTENANCE_INTERVAL_MS = 5_000;

type SocketContext = {
  socketId: string;
  roomCode?: string;
};

type RoomTimers = {
  countdown?: ReturnType<typeof setTimeout>;
  botTick?: ReturnType<typeof setInterval>;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-worker",
        timestamp: new Date().toISOString()
      });
    }

    const route = resolveRoomRoute(url.pathname);

    if (route?.action === "state" && (request.method === "POST" || request.method === "PUT")) {
      if (!isAuthorizedStateWrite(request, env)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const roomStub = env.ROOMS.get(env.ROOMS.idFromName(REALTIME_DO_NAME));
    return roomStub.fetch(request);
  }
} satisfies ExportedHandler<Env>;

export class RoomDurableObject {
  private readonly roomHubs = new Map<string, RoomSocketHub>();
  private readonly socketContexts = new WeakMap<WebSocket, SocketContext>();
  private readonly roomTimers = new Map<string, RoomTimers>();
  private maintenanceStarted = false;

  constructor(private readonly state: DurableObjectState) {
    this.startMaintenanceIfNeeded();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get("Upgrade")?.toLowerCase();

    if (upgradeHeader === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    const route = resolveRoomRoute(url.pathname);

    if (route?.action === "state" && (request.method === "POST" || request.method === "PUT")) {
      const response = await this.handleRoomStateWrite(request, route.roomCode);
      if (response) {
        return response;
      }
    }

    if (route?.action === "socket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    return new Response("Not found", { status: 404 });
  }

  acceptSocket(socket: WebSocket): void {
    const socketId = this.createSocketId();
    this.socketContexts.set(socket, { socketId });

    if (socket.readyState === 0) {
      socket.accept();
    }

    socket.onmessage = (event) => {
      this.handleSocketMessage(socket, event);
    };

    socket.onclose = () => {
      this.handleSocketClose(socket);
    };
  }

  private async handleRoomStateWrite(request: Request, roomCode: string): Promise<Response | null> {
    const room = await parseRoomState(request, roomCode);

    if (!room) {
      return new Response("Invalid room state", { status: 400 });
    }

    try {
      await this.state.storage.put(roomStateStorageKey(room.roomCode), room);
      this.broadcastRoomState(room);
    } catch {
      return new Response("Failed to persist room state", { status: 500 });
    }

    return Response.json({
      ok: true,
      roomCode: normalizeRoomCode(room.roomCode),
      connectedSockets: this.getRoomHub(room.roomCode).connectedCount
    });
  }

  private handleWebSocketUpgrade(): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.acceptSocket(server);

    const responseInit: ResponseInit & { webSocket: WebSocket } = {
      status: 101,
      webSocket: client
    };

    return new Response(null, responseInit);
  }

  private handleSocketMessage(socket: WebSocket, event: MessageEvent): void {
    if (typeof event.data !== "string") {
      return;
    }

    const message = parseClientMessage(event.data);

    if (!message) {
      this.sendServerError(socket, "Invalid Cloudflare realtime message.");
      return;
    }

    switch (message.type) {
      case "client:room:create":
        this.handleCreateRoom(socket, message);
        break;
      case "client:room:join":
        this.handleJoinRoom(socket, message);
        break;
      case "client:room:leave":
        this.handleLeaveRoom(socket, message);
        break;
      case "client:player:ready":
        this.handleReady(socket, message);
        break;
      case "client:room:setPromptCategory":
        this.handleSetPromptCategory(socket, message);
        break;
      case "client:room:setBotDifficulty":
        this.handleSetBotDifficulty(socket, message);
        break;
      case "client:room:setMatchRule":
        this.handleSetMatchRule(socket, message);
        break;
      case "client:match:start":
        this.handleStartMatch(socket, message);
        break;
      case "client:typing:progress":
        this.handleTypingProgress(socket, message);
        break;
      case "client:typing:finish":
        this.handleTypingFinish(socket, message);
        break;
      case "client:match:rematch":
        this.handleRematch(socket, message);
        break;
      case "client:practice:start":
        this.handlePracticeStart(socket, message);
        break;
      case "client:practice:dailyStart":
        this.handleDailyPracticeStart(socket, message);
        break;
      default:
        this.sendServerError(socket, "Unsupported Cloudflare realtime command.");
    }
  }

  private handleSocketClose(socket: WebSocket): void {
    const context = this.socketContexts.get(socket);

    if (!context) {
      return;
    }

    const roomCode = context.roomCode;
    this.detachSocketFromRoom(socket);

    const room = leaveBySocket(context.socketId);

    if (room) {
      this.broadcastRoomState(room);
      return;
    }

    if (roomCode && !engineRooms.has(roomCode)) {
      this.cleanupRoom(roomCode);
    }
  }

  private handleCreateRoom(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:room:create" }>
  ): void {
    const nicknameError = validateNickname(message.payload.nickname);

    if (nicknameError) {
      this.sendAckError(socket, message, nicknameError);
      return;
    }

    const context = this.getSocketContext(socket);

    const created = createRoom({
      nickname: message.payload.nickname,
      guestId: message.payload.guestId,
      socketId: context.socketId,
      sessionId: message.payload.sessionId,
      ...(message.payload.deviceKind ? { deviceKind: message.payload.deviceKind } : {})
    });

    this.sendAck(socket, message, {
      roomCode: created.room.roomCode,
      playerId: created.playerId,
      room: created.room
    });
    this.broadcastRoomState(created.room);
    this.attachSocketToRoom(socket, created.room.roomCode);
  }

  private handleJoinRoom(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:room:join" }>
  ): void {
    const nicknameError = validateNickname(message.payload.nickname);

    if (nicknameError) {
      this.sendAckError(socket, message, nicknameError);
      return;
    }

    const context = this.getSocketContext(socket);

    const joined = joinRoom({
      roomCode: message.payload.roomCode,
      nickname: message.payload.nickname,
      guestId: message.payload.guestId,
      socketId: context.socketId,
      sessionId: message.payload.sessionId,
      ...(message.payload.deviceKind ? { deviceKind: message.payload.deviceKind } : {})
    });

    if ("error" in joined) {
      this.sendAckError(socket, message, joined.error);
      return;
    }

    this.sendAck(socket, message, {
      playerId: joined.playerId,
      room: joined.room
    });
    this.broadcastRoomState(joined.room);
    this.attachSocketToRoom(socket, joined.room.roomCode);
  }

  private handleLeaveRoom(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:room:leave" }>
  ): void {
    const context = this.getSocketContext(socket);
    if (!context.roomCode) {
      return;
    }

    this.detachSocketFromRoom(socket);
    const room = explicitLeaveBySocket(context.socketId);

    if (room) {
      this.broadcastRoomState(room);
      return;
    }

    if (!engineRooms.has(normalizeRoomCode(message.payload.roomCode))) {
      this.cleanupRoom(message.payload.roomCode);
    }
  }

  private handleReady(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:player:ready" }>
  ): void {
    const room = setReady(this.getSocketContext(socket).socketId, message.payload.roomCode, message.payload.ready);

    if (room) {
      this.broadcastRoomState(room);
    }
  }

  private handleSetPromptCategory(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:room:setPromptCategory" }>
  ): void {
    const result = setPromptCategory(this.getSocketContext(socket).socketId, message.payload.roomCode, message.payload.category);

    if ("error" in result) {
      this.sendAckError(socket, message, result.error);
      return;
    }

    this.broadcastRoomState(result.room);
    this.sendAck(socket, message, result.room);
  }

  private handleSetBotDifficulty(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:room:setBotDifficulty" }>
  ): void {
    const result = setBotDifficulty(this.getSocketContext(socket).socketId, message.payload.roomCode, message.payload.difficulty);

    if ("error" in result) {
      this.sendAckError(socket, message, result.error);
      return;
    }

    this.broadcastRoomState(result.room);
    this.sendAck(socket, message, result.room);
  }

  private handleSetMatchRule(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:room:setMatchRule" }>
  ): void {
    const result = setMatchRule(this.getSocketContext(socket).socketId, message.payload.roomCode, message.payload.rule);

    if ("error" in result) {
      this.sendAckError(socket, message, result.error);
      return;
    }

    this.broadcastRoomState(result.room);
    this.sendAck(socket, message, result.room);
  }

  private handleStartMatch(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:match:start" }>
  ): void {
    const result = startMatch(this.getSocketContext(socket).socketId, message.payload.roomCode);

    if ("error" in result) {
      this.sendAckError(socket, message, result.error);
      return;
    }

    this.sendAck(socket, message, result.room);
    this.broadcastServerEvent("server:match:countdown", {
      room: result.room,
      serverStartAt: result.room.serverStartAt ?? Date.now()
    });
    this.scheduleMatchStart(result.room);
  }

  private handleTypingProgress(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:typing:progress" }>
  ): void {
    const result = updateProgress(this.getSocketContext(socket).socketId, message.payload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.broadcastServerEvent("server:player:progress", result);
      return;
    }

    this.broadcastServerEvent("server:match:result", result);
    this.clearRoomTimers(result.roomCode);
  }

  private handleTypingFinish(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:typing:finish" }>
  ): void {
    const result = finishTyping(this.getSocketContext(socket).socketId, message.payload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.broadcastServerEvent("server:player:progress", result);
      return;
    }

    this.broadcastServerEvent("server:match:result", result);
    this.clearRoomTimers(result.roomCode);
  }

  private handleRematch(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:match:rematch" }>
  ): void {
    const result = rematch(this.getSocketContext(socket).socketId, message.payload.roomCode);

    if ("error" in result) {
      this.sendAckError(socket, message, result.error);
      return;
    }

    this.clearRoomTimers(result.room.roomCode);
    this.sendAck(socket, message, result.room);
    this.broadcastRoomState(result.room);
  }

  private handlePracticeStart(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:practice:start" }>
  ): void {
    const practice = startPractice(message.payload.nickname, message.payload.category);
    this.sendAck(socket, message, practice);
  }

  private handleDailyPracticeStart(
    socket: WebSocket,
    message: Extract<CloudflareClientMessage, { type: "client:practice:dailyStart" }>
  ): void {
    const practice = startDailyPractice(message.payload.nickname);
    this.sendAck(socket, message, practice);
  }

  private attachSocketToRoom(socket: WebSocket, roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const context = this.getSocketContext(socket);
    context.roomCode = normalizedRoomCode;
    this.getRoomHub(normalizedRoomCode).attach(socket);
  }

  private detachSocketFromRoom(socket: WebSocket): void {
    const context = this.socketContexts.get(socket);

    if (!context?.roomCode) {
      return;
    }

    const hub = this.roomHubs.get(context.roomCode);
    hub?.detach(socket);
    delete context.roomCode;
  }

  private broadcastRoomState(room: RoomState): void {
    this.getRoomHub(room.roomCode).setRoomState(room);
  }

  private broadcastServerEvent<TType extends CloudflareServerEventName>(
    type: TType,
    payload: CloudflareServerEventPayload<TType>
  ): void {
    const roomCode = extractRoomCodeFromServerPayload(payload);

    if (!roomCode) {
      return;
    }

    this.getRoomHub(roomCode).broadcastMessage(
      serializeServerEvent(type, payload, roomCode)
    );
  }

  private scheduleMatchStart(room: RoomState): void {
    this.clearCountdownTimer(room.roomCode);
    this.clearBotTimer(room.roomCode);

    const delay = Math.max((room.serverStartAt ?? Date.now()) - Date.now(), 0);
    const countdownTimer = setTimeout(() => {
      this.roomTimers.delete(normalizeRoomCode(room.roomCode));
      const playingRoom = markPlaying(room.roomCode);

      if (!playingRoom) {
        return;
      }

      this.broadcastServerEvent("server:match:started", playingRoom);

      if (playingRoom.players.some((player) => player.isBot)) {
        this.scheduleBotTicks(playingRoom.roomCode);
      }
    }, delay);

    this.roomTimers.set(normalizeRoomCode(room.roomCode), {
      countdown: countdownTimer
    });
  }

  private scheduleBotTicks(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    this.clearBotTimer(normalizedRoomCode);

    const botTimer = setInterval(() => {
      const outcome = advanceBot(normalizedRoomCode);

      if (!outcome) {
        this.clearBotTimer(normalizedRoomCode);
        return;
      }

      if (outcome.type === "progress") {
        this.broadcastServerEvent("server:player:progress", outcome.room);
        return;
      }

      this.broadcastServerEvent("server:match:result", outcome.result);
      this.clearRoomTimers(normalizedRoomCode);
    }, BOT_TICK_MS);

    this.ensureRoomTimers(normalizedRoomCode).botTick = botTimer;
  }

  private clearRoomTimers(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    this.clearCountdownTimer(normalizedRoomCode);
    this.clearBotTimer(normalizedRoomCode);
    this.roomTimers.delete(normalizedRoomCode);
  }

  private clearCountdownTimer(roomCode: string): void {
    const timers = this.roomTimers.get(normalizeRoomCode(roomCode));

    if (timers?.countdown) {
      clearTimeout(timers.countdown);
      delete timers.countdown;
    }
  }

  private clearBotTimer(roomCode: string): void {
    const timers = this.roomTimers.get(normalizeRoomCode(roomCode));

    if (timers?.botTick) {
      clearInterval(timers.botTick);
      delete timers.botTick;
    }
  }

  private cleanupRoom(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    this.clearRoomTimers(normalizedRoomCode);
    this.roomHubs.delete(normalizedRoomCode);
  }

  private cleanupDanglingRooms(): void {
    for (const roomCode of this.roomHubs.keys()) {
      if (!engineRooms.has(roomCode)) {
        this.cleanupRoom(roomCode);
      }
    }
  }

  private getRoomHub(roomCode: string): RoomSocketHub {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const existingHub = this.roomHubs.get(normalizedRoomCode);

    if (existingHub) {
      return existingHub;
    }

    const hub = new RoomSocketHub(normalizedRoomCode);
    this.roomHubs.set(normalizedRoomCode, hub);
    return hub;
  }

  private getSocketContext(socket: WebSocket): SocketContext {
    let context = this.socketContexts.get(socket);

    if (!context) {
      context = { socketId: this.createSocketId() };
      this.socketContexts.set(socket, context);
    }

    return context;
  }

  private createSocketId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `socket_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private ensureRoomTimers(roomCode: string): RoomTimers {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const existing = this.roomTimers.get(normalizedRoomCode);

    if (existing) {
      return existing;
    }

    const timers: RoomTimers = {};
    this.roomTimers.set(normalizedRoomCode, timers);
    return timers;
  }

  private sendAck<TType extends CloudflareClientMessageType>(
    socket: WebSocket,
    request: Extract<CloudflareClientMessage, { type: TType }>,
    payload: CloudflareResponsePayload<TType>
  ): void {
    this.sendRawMessage(
      socket,
      JSON.stringify({
        id: request.id,
        type: "server:ack",
        replyTo: request.id,
        command: request.type,
        payload: {
          ok: true,
          data: payload
        } satisfies AckResponse<CloudflareResponsePayload<TType>>
      })
    );
  }

  private sendAckError<TType extends CloudflareClientMessageType>(
    socket: WebSocket,
    request: Extract<CloudflareClientMessage, { type: TType }>,
    error: string
  ): void {
    this.sendRawMessage(
      socket,
      JSON.stringify({
        id: request.id,
        type: "server:ack",
        replyTo: request.id,
        command: request.type,
        payload: {
          ok: false,
          error
        } satisfies AckResponse<CloudflareResponsePayload<TType>>
      })
    );
  }

  private sendServerError(socket: WebSocket, message: string): void {
    this.sendRawMessage(
      socket,
      JSON.stringify({
        id: `server:error:${Date.now()}`,
        type: "server:error",
        payload: {
          message
        }
      })
    );
  }

  private sendRawMessage(socket: WebSocket, data: string): void {
    try {
      socket.send(data);
    } catch {
      this.detachSocketFromRoom(socket);
    }
  }

  private startMaintenanceIfNeeded(): void {
    if (this.maintenanceStarted) {
      return;
    }

    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
      this.maintenanceStarted = true;
      return;
    }

    this.maintenanceStarted = true;
    setInterval(() => {
      cleanupExpiredRooms();

      for (const room of checkForForfeits()) {
        this.broadcastRoomState(room);
      }

      for (const result of checkExpiredTimeAttackMatches()) {
        this.broadcastServerEvent("server:match:result", result);
        this.clearRoomTimers(result.roomCode);
      }

      this.cleanupDanglingRooms();
    }, MAINTENANCE_INTERVAL_MS);
  }
}

function isAuthorizedStateWrite(request: Request, env: Env): boolean {
  if (!env.ROOM_STATE_WRITE_TOKEN) {
    return false;
  }

  return request.headers.get("Authorization") === `Bearer ${env.ROOM_STATE_WRITE_TOKEN}`;
}

function roomStateStorageKey(roomCode: string): string {
  return `${ROOM_STATE_STORAGE_PREFIX}${normalizeRoomCode(roomCode)}`;
}

function serializeServerEvent<TType extends CloudflareServerEventName>(
  type: TType,
  payload: CloudflareServerEventPayload<TType>,
  roomCode: string | null
): string {
  return JSON.stringify({
    id: roomCode ? `${type}:${normalizeRoomCode(roomCode)}` : `${type}:${Date.now()}`,
    type,
    payload
  });
}

function extractRoomCodeFromServerPayload(payload: CloudflareServerEventPayload<CloudflareServerEventName>): string | null {
  if (isRoomState(payload)) {
    return payload.roomCode;
  }

  if (isRoomStateContainer(payload)) {
    return payload.room.roomCode;
  }

  if (isMatchResult(payload)) {
    return payload.roomCode;
  }

  return null;
}

function isRoomState(payload: unknown): payload is RoomState {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "roomCode" in payload &&
    "players" in payload &&
    "status" in payload
  );
}

function isRoomStateContainer(
  payload: CloudflareServerEventPayload<CloudflareServerEventName>
): payload is { room: RoomState; serverStartAt: number } {
  return typeof payload === "object" && payload !== null && "room" in payload && "serverStartAt" in payload;
}

function isMatchResult(payload: unknown): payload is { roomCode: string } {
  return typeof payload === "object" && payload !== null && "roomCode" in payload;
}

function parseClientMessage(data: string): CloudflareClientMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const message = parsed as Partial<CloudflareClientMessage>;

  if (typeof message.id !== "string" || typeof message.type !== "string" || !("payload" in message)) {
    return null;
  }

  return message as CloudflareClientMessage;
}

async function parseRoomState(request: Request, expectedRoomCode: string): Promise<RoomState | null> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const room = payload as RoomState;

  if (typeof room.roomCode !== "string") {
    return null;
  }

  const roomCode = normalizeRoomCode(room.roomCode);

  if (roomCode !== expectedRoomCode) {
    return null;
  }

  return {
    ...room,
    roomCode: expectedRoomCode
  };
}
