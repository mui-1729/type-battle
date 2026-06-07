import { describe, expect, it } from "vitest";
import {
  createRoom,
  finishTyping,
  joinRoom,
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
});
