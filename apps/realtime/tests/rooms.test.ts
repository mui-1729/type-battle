import { describe, expect, it } from "vitest";
import {
  createRoom,
  setBotDifficulty,
  finishTyping,
  getRoom,
  joinRoom,
  leaveBySocket,
  markPlaying,
  checkForForfeits,
  checkExpiredTimeAttackMatches,
  explicitLeaveBySocket,
  rematch,
  startMatch,
  setMatchRule,
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

  it("stores device kinds for joined players", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_device",
      socketId: "socket_alice_device",
      deviceKind: "mobile"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_device",
      socketId: "socket_bob_device",
      deviceKind: "mobile"
    });

    expect("error" in joined).toBe(false);

    if ("error" in joined) {
      return;
    }

    expect(created.room.players[0]?.deviceKind).toBe("mobile");
    expect(joined.room.players[0]?.deviceKind).toBe("mobile");
    expect(joined.room.players[1]?.deviceKind).toBe("mobile");
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

    const promptLength = started.room.prompt?.typing.romaji.length ?? 0;
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

  it("frees a waiting room slot when a player explicitly leaves", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_explicit_leave",
      socketId: "socket_alice_explicit_leave"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_explicit_leave",
      socketId: "socket_bob_explicit_leave"
    });

    expect("error" in joined).toBe(false);

    const afterLeave = explicitLeaveBySocket("socket_bob_explicit_leave");
    expect(afterLeave?.players).toHaveLength(1);

    const replacement = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Charlie",
      guestId: "guest_charlie_explicit_leave",
      socketId: "socket_charlie_explicit_leave"
    });

    expect("error" in replacement).toBe(false);

    if ("error" in replacement) {
      return;
    }

    expect(replacement.room.players).toHaveLength(2);
    expect(replacement.room.players.some((player) => player.id === "guest_charlie_explicit_leave")).toBe(true);
  });

  it("adds a COM player with difficulty in nickname when a host starts alone", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_com",
      socketId: "socket_alice_com"
    });

    const difficulty = setBotDifficulty("socket_alice_com", created.room.roomCode, "hard");
    expect("error" in difficulty).toBe(false);

    const started = startMatch("socket_alice_com", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    expect(started.room.players).toHaveLength(2);
    expect(started.room.players.some((player) => player.isBot && player.nickname === "COM (Hard)")).toBe(true);
  });

  it("tracks streaks during typing and resets them on rematch", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_streak",
      socketId: "socket_alice_streak"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_streak",
      socketId: "socket_bob_streak"
    });

    expect("error" in joined).toBe(false);

    const started = startMatch("socket_alice_streak", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    expect(markPlaying(created.room.roomCode)?.status).toBe("playing");

    updateProgress("socket_alice_streak", {
      roomCode: created.room.roomCode,
      progressIndex: 1,
      correctCharacters: 1,
      totalTypedCharacters: 1,
      mistakes: 0
    });

    updateProgress("socket_alice_streak", {
      roomCode: created.room.roomCode,
      progressIndex: 2,
      correctCharacters: 2,
      totalTypedCharacters: 2,
      mistakes: 0
    });

    const roomAfterTyping = getRoom(created.room.roomCode);
    const aliceAfterTyping = roomAfterTyping?.players.find((player) => player.id === "guest_alice_streak");

    expect(aliceAfterTyping?.currentStreak).toBe(2);
    expect(aliceAfterTyping?.maxStreak).toBe(2);

    const promptLength = started.room.prompt?.typing.romaji.length ?? 0;
    finishTyping("socket_alice_streak", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });
    finishTyping("socket_bob_streak", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    const rematched = rematch("socket_alice_streak", created.room.roomCode);
    expect("error" in rematched).toBe(false);

    if ("error" in rematched) {
      return;
    }

    const roomAfterRematch = getRoom(created.room.roomCode);
    const aliceAfterRematch = roomAfterRematch?.players.find((player) => player.id === "guest_alice_streak");

    expect(aliceAfterRematch?.currentStreak).toBe(0);
    expect(aliceAfterRematch?.maxStreak).toBe(0);
  });

  it("chooses a different prompt on rematch when another option exists", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_prompt_cycle",
      socketId: "socket_alice_prompt_cycle"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_prompt_cycle",
      socketId: "socket_bob_prompt_cycle"
    });

    expect("error" in joined).toBe(false);

    const started = startMatch("socket_alice_prompt_cycle", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    expect(markPlaying(created.room.roomCode)?.status).toBe("playing");

    const firstPromptId = started.room.prompt?.id;
    expect(rooms.get(created.room.roomCode.toUpperCase())?.promptHistory).toContain(firstPromptId);
    const promptLength = started.room.prompt?.typing.romaji.length ?? 0;

    finishTyping("socket_alice_prompt_cycle", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });
    finishTyping("socket_bob_prompt_cycle", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    const rematched = rematch("socket_alice_prompt_cycle", created.room.roomCode);
    expect("error" in rematched).toBe(false);

    if ("error" in rematched) {
      return;
    }

    expect(rematched.room.prompt?.id).not.toBe(firstPromptId);
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

  it("finishes a time attack match when the timer expires", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_time_attack",
      socketId: "socket_alice_time_attack"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_time_attack",
      socketId: "socket_bob_time_attack"
    });

    expect("error" in joined).toBe(false);

    const rule = setMatchRule("socket_alice_time_attack", created.room.roomCode, "timeAttack");
    expect("error" in rule).toBe(false);

    const started = startMatch("socket_alice_time_attack", created.room.roomCode);
    expect("error" in started).toBe(false);
    expect(markPlaying(created.room.roomCode)?.status).toBe("playing");

    updateProgress("socket_alice_time_attack", {
      roomCode: created.room.roomCode,
      progressIndex: 2,
      correctCharacters: 2,
      totalTypedCharacters: 2,
      mistakes: 0
    });

    const room = rooms.get(created.room.roomCode.toUpperCase());
    if (room) {
      room.matchEndsAt = Date.now() - 1;
    }

    const results = checkExpiredTimeAttackMatches();
    expect(results).toHaveLength(1);
    expect(results[0]?.players[0]?.id).toBe("guest_alice_time_attack");
    expect(getRoom(created.room.roomCode)?.status).toBe("finished");
  });

  it("allows the host to change the match rule after a match finishes and before rematch", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_midgame_rule",
      socketId: "socket_alice_midgame_rule"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_midgame_rule",
      socketId: "socket_bob_midgame_rule"
    });

    expect("error" in joined).toBe(false);

    const started = startMatch("socket_alice_midgame_rule", created.room.roomCode);
    expect("error" in started).toBe(false);
    expect(markPlaying(created.room.roomCode)?.status).toBe("playing");

    const promptLength = started.room.prompt?.typing.romaji.length ?? 0;
    updateProgress("socket_alice_midgame_rule", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    finishTyping("socket_alice_midgame_rule", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    finishTyping("socket_bob_midgame_rule", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    expect(getRoom(created.room.roomCode)?.status).toBe("finished");

    const switched = setMatchRule("socket_alice_midgame_rule", created.room.roomCode, "timeAttack");
    expect("error" in switched).toBe(false);

    if ("error" in switched) {
      return;
    }

    expect(switched.room.matchRule).toBe("timeAttack");

    const rematched = rematch("socket_alice_midgame_rule", created.room.roomCode);
    expect("error" in rematched).toBe(false);

    if ("error" in rematched) {
      return;
    }

    expect(rematched.room.status).toBe("waiting");
    expect(rematched.room.matchRule).toBe("timeAttack");
  });

  it("finishes an hp battle match when a player deals lethal damage", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_hp_battle",
      socketId: "socket_alice_hp_battle"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_hp_battle",
      socketId: "socket_bob_hp_battle"
    });

    expect("error" in joined).toBe(false);

    const rule = setMatchRule("socket_alice_hp_battle", created.room.roomCode, "hpBattle");
    expect("error" in rule).toBe(false);

    const started = startMatch("socket_alice_hp_battle", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    expect(markPlaying(created.room.roomCode)?.status).toBe("playing");
    expect(started.room.players.every((player) => player.maxHp === player.hp)).toBe(true);

    const promptLength = started.room.prompt?.typing.romaji.length ?? 0;
    const outcome = updateProgress("socket_alice_hp_battle", {
      roomCode: created.room.roomCode,
      progressIndex: promptLength,
      correctCharacters: promptLength,
      totalTypedCharacters: promptLength,
      mistakes: 0
    });

    expect(outcome && "status" in outcome).toBe(false);

    if (!outcome || "status" in outcome) {
      return;
    }

    expect(outcome.players[0]?.id).toBe("guest_alice_hp_battle");
    expect(outcome.players[1]?.hp).toBe(0);
    expect(getRoom(created.room.roomCode)?.status).toBe("finished");
  });
});
