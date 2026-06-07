import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { validateNickname } from "@type-battle/shared";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState
} from "@type-battle/shared";
import {
  createRoom,
  finishTyping,
  joinRoom,
  leaveBySocket,
  markPlaying,
  rematch,
  setReady,
  startMatch,
  updateProgress
} from "./rooms.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://127.0.0.1:3000";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "type-battle-realtime" });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN
  }
});

io.on("connection", (socket) => {
  socket.on("room:create", (payload, ack) => {
    const error = validateNickname(payload.nickname);

    if (error) {
      ack({ ok: false, error });
      return;
    }

    const { room, playerId } = createRoom({
      nickname: payload.nickname,
      guestId: payload.guestId,
      socketId: socket.id
    });

    socket.join(room.roomCode);
    ack({ ok: true, data: { roomCode: room.roomCode, playerId, room } });
    emitRoomState(room);
  });

  socket.on("room:join", (payload, ack) => {
    const error = validateNickname(payload.nickname);

    if (error) {
      ack({ ok: false, error });
      return;
    }

    const result = joinRoom({
      roomCode: payload.roomCode,
      nickname: payload.nickname,
      guestId: payload.guestId,
      socketId: socket.id
    });

    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }

    socket.join(result.room.roomCode);
    ack({ ok: true, data: { playerId: result.playerId, room: result.room } });
    emitRoomState(result.room);
  });

  socket.on("room:leave", (payload) => {
    socket.leave(payload.roomCode.toUpperCase());
    const room = leaveBySocket(socket.id);

    if (room) {
      emitRoomState(room);
    }
  });

  socket.on("player:ready", (payload) => {
    const room = setReady(socket.id, payload.roomCode, payload.ready);

    if (room) {
      emitRoomState(room);
    }
  });

  socket.on("match:start", (payload, ack) => {
    const result = startMatch(socket.id, payload.roomCode);

    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }

    ack({ ok: true, data: result.room });
    io.to(result.room.roomCode).emit("match:countdown", {
      room: result.room,
      serverStartAt: result.room.serverStartAt ?? Date.now()
    });

    scheduleMatchStart(result.room);
  });

  socket.on("typing:progress", (payload) => {
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

    io.to(result.roomCode).emit("match:result", result);
  });

  socket.on("match:rematch", (payload, ack) => {
    const result = rematch(socket.id, payload.roomCode);

    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }

    ack({ ok: true, data: result.room });
    emitRoomState(result.room);
  });

  socket.on("disconnect", () => {
    const room = leaveBySocket(socket.id);

    if (room) {
      emitRoomState(room);
    }
  });
});

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`Realtime server listening on http://127.0.0.1:${PORT}`);
});

function emitRoomState(room: RoomState): void {
  io.to(room.roomCode).emit("room:state", room);
}

function scheduleMatchStart(room: RoomState): void {
  const delay = Math.max((room.serverStartAt ?? Date.now()) - Date.now(), 0);

  setTimeout(() => {
    const playingRoom = markPlaying(room.roomCode);

    if (playingRoom) {
      io.to(playingRoom.roomCode).emit("match:started", playingRoom);
    }
  }, delay);
}
