import type { AckResponse, RoomState } from "@type-battle/shared";
import {
  advanceBot,
  createRoom,
  checkExpiredTimeAttackMatches,
  checkForForfeits,
  cleanupExpiredRooms,
  getRoom,
  explicitLeaveBySocket,
  joinRoom,
  leaveBySocket,
  markPlaying,
  rematch,
  restoreRoomState,
  rooms,
  setBotDifficulty,
  setMatchRule,
  setPromptCategory,
  setReady,
  startDailyPractice,
  startMatch,
  startPractice,
  updateProgress,
  finishTyping
} from "@type-battle/shared/room-engine";
import { normalizeNickname, validateNickname } from "@type-battle/shared";
import type {
  CloudflareClientMessage,
  CloudflareClientMessageType,
  CloudflareServerEventEnvelope,
  CloudflareServerEventType,
  CloudflareServerMessage
} from "@type-battle/shared/cloudflare-events";
import { normalizeRoomCode, resolveRoomRoute } from "./room-routing.js";

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
  roomCode?: string;
};

const OPEN_STATE = 1;
const ROOM_STORAGE_PREFIX = "room:";
const BOT_TICK_MS = 500;
const ROOM_CLEANUP_INTERVAL_MS = 10_000;
const TIME_ATTACK_POLL_INTERVAL_MS = 1_000;

type GatewayTimers = {
  countdown?: ReturnType<typeof setTimeout>;
  bot?: ReturnType<typeof setInterval>;
};

export class RealtimeGatewayDurableObject {
  private readonly sockets = new Map<string, CloudflareSocketLike>();
  private readonly socketStates = new Map<string, SocketState>();
  private readonly roomSockets = new Map<string, Set<string>>();
  private readonly timers = new Map<string, GatewayTimers>();
  private readonly persistedRoomCodes = new Set<string>();
  readonly ready: Promise<void>;

  constructor(private readonly state: DurableObjectState) {
    this.ready = this.state.blockConcurrencyWhile(async () => {
      await this.restoreRooms();
    });

    setInterval(() => {
      void this.cleanupStaleRooms();
    }, ROOM_CLEANUP_INTERVAL_MS);

    setInterval(() => {
      void this.handleForfeits();
    }, ROOM_CLEANUP_INTERVAL_MS / 2);

    setInterval(() => {
      void this.handleTimeAttackExpirations();
    }, TIME_ATTACK_POLL_INTERVAL_MS);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    const url = new URL(request.url);
    const route = resolveRoomRoute(url.pathname);

    if (route?.action === "state") {
      return this.handleStateRequest(request, route.roomCode);
    }

    if (isWebSocketUpgrade(request)) {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      const currentRooms = [...rooms.values()].length;
      const activeSockets = this.sockets.size;

      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-worker",
        rooms: currentRooms,
        sockets: activeSockets
      });
    }

    return new Response("Not found", { status: 404 });
  }

  attachSocket(socket: CloudflareSocketLike): string {
    const socketId = crypto.randomUUID();
    this.sockets.set(socketId, socket);
    this.socketStates.set(socketId, { socketId });
    socket.accept();

    socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(socketId, event.data);
    });

    socket.addEventListener("close", () => {
      void this.handleSocketClose(socketId);
    });

    return socketId;
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.attachSocket(server as unknown as CloudflareSocketLike);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private async handleSocketMessage(socketId: string, rawMessage: unknown): Promise<void> {
    if (typeof rawMessage !== "string") {
      return;
    }

    let message: CloudflareClientMessage;

    try {
      message = JSON.parse(rawMessage) as CloudflareClientMessage;
    } catch {
      return;
    }

    if (!message || typeof message !== "object" || !("type" in message) || !("id" in message)) {
      return;
    }

    switch (message.type) {
      case "client:room:create":
        await this.handleCreateRoom(socketId, message);
        return;
      case "client:room:join":
        await this.handleJoinRoom(socketId, message);
        return;
      case "client:room:leave":
        await this.handleLeaveRoom(socketId, message);
        return;
      case "client:player:ready":
        await this.handleSetReady(socketId, message);
        return;
      case "client:room:setPromptCategory":
        await this.handleSetPromptCategory(socketId, message);
        return;
      case "client:room:setBotDifficulty":
        await this.handleSetBotDifficulty(socketId, message);
        return;
      case "client:room:setMatchRule":
        await this.handleSetMatchRule(socketId, message);
        return;
      case "client:match:start":
        await this.handleStartMatch(socketId, message);
        return;
      case "client:typing:progress":
        await this.handleTypingProgress(socketId, message);
        return;
      case "client:typing:finish":
        await this.handleTypingFinish(socketId, message);
        return;
      case "client:match:rematch":
        await this.handleRematch(socketId, message);
        return;
      case "client:practice:start":
        await this.handlePracticeStart(socketId, message);
        return;
      case "client:practice:dailyStart":
        await this.handleDailyPracticeStart(socketId, message);
        return;
      default:
        return;
    }
  }

  private async handleSocketClose(socketId: string): Promise<void> {
    const roomCode = this.socketStates.get(socketId)?.roomCode;
    this.detachSocket(socketId);

    const room = leaveBySocket(socketId);

    if (room) {
      this.broadcastRoomState(room);
      await this.persistRoom(room.roomCode);
      return;
    }

    if (roomCode) {
      await this.persistRoom(roomCode);
    }
  }

  private async handleCreateRoom(socketId: string, message: CloudflareClientMessage & { type: "client:room:create" }): Promise<void> {
    const error = validateNickname(message.payload.nickname);

    if (error) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error });
      return;
    }

    const result = createRoom({
      nickname: normalizeNickname(message.payload.nickname),
      guestId: message.payload.guestId,
      socketId,
      sessionId: message.payload.sessionId,
      ...(message.payload.deviceKind ? { deviceKind: message.payload.deviceKind } : {})
    });

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, message.id, message.type, {
      ok: true,
      data: {
        roomCode: result.room.roomCode,
        playerId: result.playerId,
        room: result.room
      }
    });
    this.broadcastRoomState(result.room);
    await this.persistRoom(result.room.roomCode);
  }

  private async handleJoinRoom(socketId: string, message: CloudflareClientMessage & { type: "client:room:join" }): Promise<void> {
    const error = validateNickname(message.payload.nickname);

    if (error) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error });
      return;
    }

    const result = joinRoom({
      roomCode: message.payload.roomCode,
      nickname: normalizeNickname(message.payload.nickname),
      guestId: message.payload.guestId,
      socketId,
      sessionId: message.payload.sessionId,
      ...(message.payload.deviceKind ? { deviceKind: message.payload.deviceKind } : {})
    });

    if ("error" in result) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, message.id, message.type, {
      ok: true,
      data: {
        playerId: result.playerId,
        room: result.room
      }
    });
    this.broadcastRoomState(result.room);
    await this.persistRoom(result.room.roomCode);
  }

  private async handleLeaveRoom(socketId: string, message: CloudflareClientMessage & { type: "client:room:leave" }): Promise<void> {
    const roomCode = this.socketStates.get(socketId)?.roomCode ?? normalizeRoomCode(message.payload.roomCode);
    const room = explicitLeaveBySocket(socketId);
    this.detachSocketFromRoom(socketId);

    if (room) {
      this.broadcastRoomState(room);
      await this.persistRoom(room.roomCode);
      return;
    }

    await this.persistRoom(roomCode);
  }

  private async handleSetReady(socketId: string, message: CloudflareClientMessage & { type: "client:player:ready" }): Promise<void> {
    const room = setReady(socketId, message.payload.roomCode, message.payload.ready);

    if (!room) {
      return;
    }

    this.setSocketRoom(socketId, room.roomCode);
    this.broadcastRoomState(room);
    await this.persistRoom(room.roomCode);
  }

  private async handleSetPromptCategory(
    socketId: string,
    message: CloudflareClientMessage & { type: "client:room:setPromptCategory" }
  ): Promise<void> {
    const result = setPromptCategory(socketId, message.payload.roomCode, message.payload.category);

    if ("error" in result) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.broadcastRoomState(result.room);
    await this.persistRoom(result.room.roomCode);
  }

  private async handleSetBotDifficulty(
    socketId: string,
    message: CloudflareClientMessage & { type: "client:room:setBotDifficulty" }
  ): Promise<void> {
    const result = setBotDifficulty(socketId, message.payload.roomCode, message.payload.difficulty);

    if ("error" in result) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.broadcastRoomState(result.room);
    await this.persistRoom(result.room.roomCode);
  }

  private async handleSetMatchRule(
    socketId: string,
    message: CloudflareClientMessage & { type: "client:room:setMatchRule" }
  ): Promise<void> {
    const result = setMatchRule(socketId, message.payload.roomCode, message.payload.rule);

    if ("error" in result) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.broadcastRoomState(result.room);
    await this.persistRoom(result.room.roomCode);
  }

  private async handleStartMatch(socketId: string, message: CloudflareClientMessage & { type: "client:match:start" }): Promise<void> {
    const result = startMatch(socketId, message.payload.roomCode);

    if ("error" in result) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, message.id, message.type, { ok: true, data: result.room });
    this.broadcastToRoom(result.room.roomCode, {
      id: crypto.randomUUID(),
      type: "server:match:countdown",
      payload: {
        room: result.room,
        serverStartAt: result.room.serverStartAt ?? Date.now()
      }
    });
    await this.persistRoom(result.room.roomCode);
    this.scheduleMatchStart(result.room.roomCode);
  }

  private async handleTypingProgress(
    socketId: string,
    message: CloudflareClientMessage & { type: "client:typing:progress" }
  ): Promise<void> {
    const result = updateProgress(socketId, message.payload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.setSocketRoom(socketId, result.roomCode);
      this.broadcastRoomState(result);
      await this.persistRoom(result.roomCode);
      return;
    }

    this.broadcastToRoom(result.roomCode, {
      id: crypto.randomUUID(),
      type: "server:match:result",
      payload: result
    });
    await this.persistRoom(result.roomCode);
  }

  private async handleTypingFinish(
    socketId: string,
    message: CloudflareClientMessage & { type: "client:typing:finish" }
  ): Promise<void> {
    const result = finishTyping(socketId, message.payload);

    if (!result) {
      return;
    }

    if ("status" in result) {
      this.setSocketRoom(socketId, result.roomCode);
      this.broadcastRoomState(result);
      await this.persistRoom(result.roomCode);
      return;
    }

    this.broadcastToRoom(result.roomCode, {
      id: crypto.randomUUID(),
      type: "server:match:result",
      payload: result
    });
    await this.persistRoom(result.roomCode);
  }

  private async handleRematch(socketId: string, message: CloudflareClientMessage & { type: "client:match:rematch" }): Promise<void> {
    const result = rematch(socketId, message.payload.roomCode);

    if ("error" in result) {
      this.sendAck(socketId, message.id, message.type, { ok: false, error: result.error });
      return;
    }

    this.setSocketRoom(socketId, result.room.roomCode);
    this.sendAck(socketId, message.id, message.type, { ok: true, data: result.room });
    this.broadcastRoomState(result.room);
    await this.persistRoom(result.room.roomCode);
  }

  private async handlePracticeStart(
    socketId: string,
    message: CloudflareClientMessage & { type: "client:practice:start" }
  ): Promise<void> {
    const practice = startPractice(message.payload.nickname, message.payload.category);
    this.sendAck(socketId, message.id, message.type, { ok: true, data: practice });
  }

  private async handleDailyPracticeStart(
    socketId: string,
    message: CloudflareClientMessage & { type: "client:practice:dailyStart" }
  ): Promise<void> {
    const practice = startDailyPractice(message.payload.nickname);
    this.sendAck(socketId, message.id, message.type, { ok: true, data: practice });
  }

  private broadcastRoomState(room: RoomState): void {
    this.broadcastToRoom(room.roomCode, {
      id: crypto.randomUUID(),
      type: "server:room:state",
      payload: room
    });
  }

  private broadcastToRoom<TType extends CloudflareServerEventType>(
    roomCode: string,
    message: CloudflareServerEventEnvelope<TType>
  ): void {
    const socketIds = this.roomSockets.get(roomCode.toUpperCase());

    if (!socketIds) {
      return;
    }

    for (const socketId of [...socketIds]) {
      this.sendMessage(socketId, message);
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

  private setSocketRoom(socketId: string, roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const currentRoomCode = this.socketStates.get(socketId)?.roomCode;

    if (currentRoomCode && currentRoomCode !== normalizedRoomCode) {
      this.detachSocketFromRoom(socketId);
    }

    const socketState = this.socketStates.get(socketId) ?? { socketId };
    socketState.roomCode = normalizedRoomCode;
    this.socketStates.set(socketId, socketState);

    const sockets = this.roomSockets.get(normalizedRoomCode) ?? new Set<string>();
    sockets.add(socketId);
    this.roomSockets.set(normalizedRoomCode, sockets);
  }

  private detachSocketFromRoom(socketId: string): void {
    const roomCode = this.socketStates.get(socketId)?.roomCode;

    if (!roomCode) {
      return;
    }

    const sockets = this.roomSockets.get(roomCode);
    sockets?.delete(socketId);

    if (sockets && sockets.size === 0) {
      this.roomSockets.delete(roomCode);
    }

    const state = this.socketStates.get(socketId);

    if (state) {
      delete state.roomCode;
      this.socketStates.set(socketId, state);
    }
  }

  private detachSocket(socketId: string): void {
    this.detachSocketFromRoom(socketId);
    this.sockets.delete(socketId);
    this.socketStates.delete(socketId);
  }

  private async persistRoom(roomCode: string): Promise<void> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = getRoom(normalizedRoomCode);
    const storageKey = `${ROOM_STORAGE_PREFIX}${normalizedRoomCode}`;

    try {
      if (!room) {
        await this.state.storage.delete(storageKey);
        this.persistedRoomCodes.delete(normalizedRoomCode);
        return;
      }

      await this.state.storage.put(storageKey, room);
      this.persistedRoomCodes.add(normalizedRoomCode);
    } catch {
      // Persistence failures should not break live room handling.
    }
  }

  private async restoreRooms(): Promise<void> {
    rooms.clear();
    this.persistedRoomCodes.clear();
    const storedRooms = await this.state.storage.list<RoomState>({ prefix: ROOM_STORAGE_PREFIX });

    for (const [key, room] of storedRooms) {
      if (!room || typeof room !== "object") {
        continue;
      }

      restoreRoomStateIfValid(room);
      this.persistedRoomCodes.add(key.slice(ROOM_STORAGE_PREFIX.length));
    }
  }

  private scheduleMatchStart(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    this.clearRoomTimers(normalizedRoomCode);

    const room = getRoom(normalizedRoomCode);

    if (!room?.serverStartAt) {
      return;
    }

    const timers = this.timers.get(normalizedRoomCode) ?? {};
    timers.countdown = setTimeout(() => {
      const playingRoom = markPlaying(normalizedRoomCode);

      if (!playingRoom) {
        return;
      }

      this.broadcastToRoom(normalizedRoomCode, {
        id: crypto.randomUUID(),
        type: "server:match:started",
        payload: playingRoom
      });
      this.broadcastRoomState(playingRoom);
      void this.persistRoom(normalizedRoomCode);
      this.scheduleBotProgress(normalizedRoomCode);
    }, Math.max(room.serverStartAt - Date.now(), 0));
    this.timers.set(normalizedRoomCode, timers);
  }

  private scheduleBotProgress(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = getRoom(normalizedRoomCode);
    const hasBot = Boolean(room?.players.some((player) => player.isBot));

    if (!room || !hasBot) {
      return;
    }

    const timers = this.timers.get(normalizedRoomCode) ?? {};
    if (timers.bot) {
      clearInterval(timers.bot);
    }

    timers.bot = setInterval(() => {
      const outcome = advanceBot(normalizedRoomCode);

      if (!outcome) {
        const currentRoom = getRoom(normalizedRoomCode);

        if (!currentRoom || currentRoom.status !== "playing") {
          this.clearRoomTimers(normalizedRoomCode);
        }

        return;
      }

      if (outcome.type === "result") {
        this.broadcastToRoom(normalizedRoomCode, {
          id: crypto.randomUUID(),
          type: "server:match:result",
          payload: outcome.result
        });
        const currentRoom = getRoom(normalizedRoomCode);
        if (currentRoom) {
          this.broadcastRoomState(currentRoom);
        }
        void this.persistRoom(normalizedRoomCode);
        this.clearRoomTimers(normalizedRoomCode);
        return;
      }

      this.broadcastRoomState(outcome.room);
      void this.persistRoom(normalizedRoomCode);
    }, BOT_TICK_MS);

    this.timers.set(normalizedRoomCode, timers);
  }

  private clearRoomTimers(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const timers = this.timers.get(normalizedRoomCode);

    if (!timers) {
      return;
    }

    if (timers.countdown) {
      clearTimeout(timers.countdown);
    }

    if (timers.bot) {
      clearInterval(timers.bot);
    }

    this.timers.delete(normalizedRoomCode);
  }

  private async cleanupStaleRooms(): Promise<void> {
    const before = new Set(rooms.keys());
    cleanupExpiredRooms();

    for (const roomCode of before) {
      if (rooms.has(roomCode)) {
        continue;
      }

      this.clearRoomTimers(roomCode);
      await this.persistRoom(roomCode);
    }
  }

  private async handleForfeits(): Promise<void> {
    for (const room of checkForForfeits()) {
      this.broadcastRoomState(room);
      await this.persistRoom(room.roomCode);
    }
  }

  private async handleTimeAttackExpirations(): Promise<void> {
    for (const result of checkExpiredTimeAttackMatches()) {
      this.broadcastToRoom(result.roomCode, {
        id: crypto.randomUUID(),
        type: "server:match:result",
        payload: result
      });
      const currentRoom = getRoom(result.roomCode);
      if (currentRoom) {
        this.broadcastRoomState(currentRoom);
      }
      this.clearRoomTimers(result.roomCode);
      await this.persistRoom(result.roomCode);
    }
  }

  private async handleStateRequest(request: Request, roomCode: string): Promise<Response> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (request.method === "GET") {
      const room = getRoom(normalizedRoomCode);

      if (!room) {
        return new Response("Not found", { status: 404 });
      }

      return Response.json({
        ok: true,
        room
      });
    }

    if (request.method !== "POST" && request.method !== "PUT") {
      return new Response("Method not allowed", { status: 405 });
    }

    const room = await parseRoomState(request, normalizedRoomCode);

    if (!room) {
      return new Response("Invalid room state", { status: 400 });
    }

    restoreRoomStateIfValid(room);
    this.broadcastRoomState(room);
    await this.persistRoom(room.roomCode);

    return Response.json({
      ok: true,
      roomCode: room.roomCode,
      connectedSockets: this.roomSockets.get(room.roomCode)?.size ?? 0
    });
  }
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function restoreRoomStateIfValid(room: RoomState): void {
  if (typeof room.roomCode !== "string") {
    return;
  }

  const normalizedRoom = normalizeRoomCode(room.roomCode);
  if (!normalizedRoom) {
    return;
  }

  restoreRoomState({
    ...room,
    roomCode: normalizedRoom
  });
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
