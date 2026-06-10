import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { validateNickname } from "@type-battle/shared";
import type {
  AckResponse,
  ClientToServerEvents,
  Prompt,
  PromptCategory,
  ServerToClientEvents,
  RoomState
} from "@type-battle/shared";
import {
  BOT_TICK_MS,
  advanceBot,
  checkForForfeits,
  cleanupExpiredRooms,
  createRoom,
  finishTyping,
  getMetrics,
  joinRoom,
  leaveBySocket,
  markPlaying,
  rematch,
  setBotDifficulty,
  setPromptCategory,
  setReady,
  startMatch,
  startPractice,
  updateProgress
} from "./rooms.js";
import { logger } from "./logger.js";
import { getPersistenceStatus } from "./persistence.js";
import { checkProgressLimit, checkRoomCreateLimit, checkRoomJoinLimit } from "./rate-limiter.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://127.0.0.1:3000";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "type-battle-realtime",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? "development",
    metrics: getMetrics(),
    database: getPersistenceStatus()
  });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN
  }
});

io.on("connection", (socket) => {
  logger.info({ event: "socket_connect", socketId: socket.id, ip: socket.handshake.address });

  socket.on("room:create", (payload, ack) => {
    const rateLimit = checkRoomCreateLimit(socket.handshake.address, payload.guestId);
    if (!rateLimit.allowed) {
      ack({ ok: false, error: rateLimit.error! });
      return;
    }

    const error = validateNickname(payload.nickname);

    if (error) {
      ack({ ok: false, error });
      return;
    }

    const { room, playerId } = createRoom({
      nickname: payload.nickname,
      guestId: payload.guestId,
      socketId: socket.id,
      sessionId: payload.sessionId
    });

    socket.join(room.roomCode);
    logger.info({
      event: "room_create",
      roomCode: room.roomCode,
      hostPlayerId: playerId,
      guestId: payload.guestId,
      sessionId: payload.sessionId
    });
    ack({ ok: true, data: { roomCode: room.roomCode, playerId, room } });
    emitRoomState(room);
  });

  socket.on("room:join", (payload, ack) => {
    const rateLimit = checkRoomJoinLimit(socket.handshake.address, payload.guestId);
    if (!rateLimit.allowed) {
      ack({ ok: false, error: rateLimit.error! });
      return;
    }

    const error = validateNickname(payload.nickname);

    if (error) {
      ack({ ok: false, error });
      return;
    }

    const result = joinRoom({
      roomCode: payload.roomCode,
      nickname: payload.nickname,
      guestId: payload.guestId,
      socketId: socket.id,
      sessionId: payload.sessionId
    });

    if ("error" in result) {
      logger.warn({
        event: "room_join_failed",
        roomCode: payload.roomCode,
        guestId: payload.guestId,
        sessionId: payload.sessionId,
        error: result.error
      });
      ack({ ok: false, error: result.error });
      return;
    }

    socket.join(result.room.roomCode);
    logger.info({
      event: "room_join",
      roomCode: result.room.roomCode,
      playerId: result.playerId,
      guestId: payload.guestId,
      sessionId: payload.sessionId
    });
    ack({ ok: true, data: { playerId: result.playerId, room: result.room } });
    emitRoomState(result.room);
  });

  socket.on("room:leave", (payload) => {
    socket.leave(payload.roomCode.toUpperCase());
    const room = leaveBySocket(socket.id);

    if (room) {
      logger.info({ event: "room_leave", roomCode: room.roomCode, socketId: socket.id });
      emitRoomState(room);
    }
  });

  socket.on("player:ready", (payload) => {
    const room = setReady(socket.id, payload.roomCode, payload.ready);

    if (room) {
      emitRoomState(room);
    }
  });

  socket.on("room:setPromptCategory", (payload, ack) => {
    const result = setPromptCategory(socket.id, payload.roomCode, payload.category);

    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }

    emitRoomState(result.room);
    ack({ ok: true, data: result.room });
  });

  socket.on("room:setBotDifficulty", (payload, ack) => {
    const result = setBotDifficulty(socket.id, payload.roomCode, payload.difficulty);

    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }

    emitRoomState(result.room);
    ack({ ok: true, data: result.room });
  });

  socket.on("match:start", (payload, ack) => {
    const result = startMatch(socket.id, payload.roomCode);

    if ("error" in result) {
      logger.warn({
        event: "match_start_failed",
        roomCode: payload.roomCode,
        socketId: socket.id,
        error: result.error
      });
      ack({ ok: false, error: result.error });
      return;
    }

    logger.info({
      event: "match_countdown",
      roomCode: result.room.roomCode,
      playerCount: result.room.players.length
    });
    ack({ ok: true, data: result.room });
    io.to(result.room.roomCode).emit("match:countdown", {
      room: result.room,
      serverStartAt: result.room.serverStartAt ?? Date.now()
    });

    scheduleMatchStart(result.room);
  });

  socket.on("typing:progress", (payload) => {
    if (!checkProgressLimit(socket.id)) {
      return;
    }
    const room = updateProgress(socket.id, payload);

    if (room) {
      io.to(room.roomCode).emit("player:progress", room);
    }
  });

  socket.on("typing:finish", (payload) => {
    const result = finishTyping(socket.id, payload);

    if (!result) {
      return;
    }

    if ("hostPlayerId" in result) {
      io.to(result.roomCode).emit("player:progress", result);
      return;
    }

    logger.info({
      event: "match_finish",
      roomCode: result.roomCode,
      rankings: result.players.map(p => ({ id: p.id, rank: p.rank, wpm: p.wpm }))
    });
    io.to(result.roomCode).emit("match:result", result);
  });

  socket.on("match:rematch", (payload, ack) => {
    const result = rematch(socket.id, payload.roomCode);

    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }

    logger.info({ event: "match_rematch", roomCode: result.room.roomCode });
    ack({ ok: true, data: result.room });
    emitRoomState(result.room);
  });

  socket.on("practice:start", (payload: { nickname: string; category: PromptCategory }, ack: (response: AckResponse<{ practiceId: string; prompt: Prompt; startedAt: number }>) => void) => {
    const practice = startPractice(payload.nickname, payload.category);
    logger.info({ event: "practice_start", practiceId: practice.practiceId, category: payload.category });
    ack({ ok: true, data: practice });
  });

  socket.on("disconnect", () => {
    const room = leaveBySocket(socket.id);

    if (room) {
      logger.info({ event: "socket_disconnect", socketId: socket.id, roomCode: room.roomCode });
      emitRoomState(room);
    } else {
      logger.info({ event: "socket_disconnect", socketId: socket.id });
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  logger.info({ event: "server_start", port: PORT, env: process.env.NODE_ENV ?? "development" });
});

setInterval(cleanupExpiredRooms, 10000);
setInterval(() => {
  for (const room of checkForForfeits()) {
    logger.info({ event: "room_forfeit", roomCode: room.roomCode });
    emitRoomState(room);
  }
}, process.env.NODE_ENV === "test" ? 1000 : 5000);

function emitRoomState(room: RoomState): void {
  io.to(room.roomCode).emit("room:state", room);
}

function scheduleMatchStart(room: RoomState): void {
  const delay = Math.max((room.serverStartAt ?? Date.now()) - Date.now(), 0);

  setTimeout(() => {
    const playingRoom = markPlaying(room.roomCode);

    if (playingRoom) {
      logger.info({ event: "match_start", roomCode: playingRoom.roomCode });
      io.to(playingRoom.roomCode).emit("match:started", playingRoom);
      scheduleBotProgress(playingRoom);
    }
  }, delay);
}

function scheduleBotProgress(room: RoomState): void {
  const hasBot = room.players.some((player) => player.isBot);

  if (!hasBot) {
    return;
  }

  const interval = setInterval(() => {
    const outcome = advanceBot(room.roomCode);

    if (!outcome) {
      clearInterval(interval);
      return;
    }

    if (outcome.type === "result") {
      io.to(outcome.result.roomCode).emit("match:result", outcome.result);
      clearInterval(interval);
      return;
    }

    io.to(outcome.room.roomCode).emit("player:progress", outcome.room);
  }, BOT_TICK_MS);
}
