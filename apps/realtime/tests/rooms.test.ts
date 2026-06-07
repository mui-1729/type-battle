import { describe, expect, it } from "vitest";
import {
  createRoom,
  finishTyping,
  joinRoom,
  leaveBySocket,
  markPlaying,
  startMatch,
  updateProgress
} from "../src/rooms";

describe("rooms", () => {
  it("creates a room and lets a second player join", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_join",
      socketId: "socket_alice_join"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_join",
      socketId: "socket_bob_join"
    });

    expect("error" in joined).toBe(false);

    if ("error" in joined) {
      return;
    }

    expect(joined.room.players).toHaveLength(2);
  });

  it("starts a match and produces a result after both players finish", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_finish",
      socketId: "socket_alice_finish"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_finish",
      socketId: "socket_bob_finish"
    });

    expect("error" in joined).toBe(false);

    const started = startMatch("socket_alice_finish", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    const playing = markPlaying(created.room.roomCode);
    expect(playing?.status).toBe("playing");

    const promptLength = started.room.prompt?.text.length ?? 0;
    updateProgress("socket_alice_finish", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    const firstFinish = finishTyping("socket_alice_finish", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    expect(firstFinish && "hostPlayerId" in firstFinish).toBe(true);

    const result = finishTyping("socket_bob_finish", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    expect(result && "players" in result && "prompt" in result).toBe(true);
  });

  it("allows an existing guest to rejoin a playing room", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_rejoin",
      socketId: "socket_alice_rejoin_1"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_rejoin",
      socketId: "socket_bob_rejoin"
    });

    expect("error" in joined).toBe(false);

    const started = startMatch("socket_alice_rejoin_1", created.room.roomCode);
    expect("error" in started).toBe(false);
    expect(markPlaying(created.room.roomCode)?.status).toBe("playing");

    const rejoined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Alice",
      guestId: "guest_alice_rejoin",
      socketId: "socket_alice_rejoin_2"
    });

    expect("error" in rejoined).toBe(false);

    if ("error" in rejoined) {
      return;
    }

    expect(rejoined.playerId).toBe("guest_alice_rejoin");
    expect(rejoined.room.status).toBe("playing");
  });

  it("keeps a waiting room available for reload rejoin", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_waiting_rejoin",
      socketId: "socket_alice_waiting_rejoin_1"
    });

    leaveBySocket("socket_alice_waiting_rejoin_1");

    const rejoined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Alice",
      guestId: "guest_alice_waiting_rejoin",
      socketId: "socket_alice_waiting_rejoin_2"
    });

    expect("error" in rejoined).toBe(false);

    if ("error" in rejoined) {
      return;
    }

    expect(rejoined.room.roomCode).toBe(created.room.roomCode);
    expect(rejoined.room.players[0]?.connected).toBe(true);
  });
});
