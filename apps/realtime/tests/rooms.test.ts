import { describe, expect, it } from "vitest";
import {
  createRoom,
  finishTyping,
  getRoom,
  joinRoom,
  leaveBySocket,
  markPlaying,
  checkForForfeits,
  startMatch,
  updateProgress,
  rooms
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
    
    // Join another player so room is not deleted when Alice leaves
    joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_waiting_rejoin",
      socketId: "socket_bob_waiting_rejoin"
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
    // Find Alice in the players array (she's the one with guest_alice_waiting_rejoin)
    const alice = rejoined.room.players.find(p => p.id === "guest_alice_waiting_rejoin");
    expect(alice?.connected).toBe(true);
  });

  it("keeps a single-host waiting room available for reload rejoin", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_solo_waiting_rejoin",
      socketId: "socket_alice_solo_waiting_rejoin_1"
    });

    leaveBySocket("socket_alice_solo_waiting_rejoin_1");

    const rejoined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Alice",
      guestId: "guest_alice_solo_waiting_rejoin",
      socketId: "socket_alice_solo_waiting_rejoin_2"
    });

    expect("error" in rejoined).toBe(false);

    if ("error" in rejoined) {
      return;
    }

    expect(rejoined.playerId).toBe("guest_alice_solo_waiting_rejoin");
    expect(rejoined.room.roomCode).toBe(created.room.roomCode);
    expect(rejoined.room.players).toHaveLength(1);
    expect(rejoined.room.players[0]?.connected).toBe(true);
    expect(rejoined.room.players[0]?.isHost).toBe(true);
  });

  it("adds a COM player with difficulty in nickname when a host starts alone", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_com",
      socketId: "socket_alice_com"
    });

    const started = startMatch("socket_alice_com", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    expect(started.room.players).toHaveLength(2);
    expect(started.room.players.some((player) => player.isBot && player.nickname === "COM (Normal)")).toBe(true);
  });

  it("forfeits a disconnected player after grace period", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_forfeit",
      socketId: "socket_alice_forfeit"
    });

    startMatch("socket_alice_forfeit", created.room.roomCode);
    markPlaying(created.room.roomCode);
    
    // Simulate disconnect
    leaveBySocket("socket_alice_forfeit");
    
    // Manually set disconnectedAt in the past
    const room = rooms.get(created.room.roomCode.toUpperCase());
    const player = room?.players.get("guest_alice_forfeit");
    if (player) {
      player.disconnectedAt = Date.now() - 40000; // 40 seconds ago
    }
    
    checkForForfeits();
    
    const updatedRoom = getRoom(created.room.roomCode);
    expect(updatedRoom?.status).toBe("finished");
    expect(updatedRoom?.players[0]?.finishTimeMs).toBe(Infinity);
  });
});
