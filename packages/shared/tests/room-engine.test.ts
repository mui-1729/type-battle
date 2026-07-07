import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRoom,
  cleanupExpiredRooms,
  checkForForfeits,
  joinRoom,
  metrics,
  rooms,
  restoreRoomState,
  setMatchRule,
  setRoomEngineConfig,
  startMatch,
  leaveBySocket
} from "../src/room-engine.js";
import type { RoomState } from "@type-battle/shared";

const defaultRoomEngineConfig = {
  timeAttackMs: 30_000,
  waitingRoomTtlMs: 30 * 60 * 1000,
  finishedRoomTtlMs: 10 * 60 * 1000,
  countdownDisconnectGraceMs: 10_000,
  playingDisconnectGraceMs: 20_000
};

function resetRoomEngineState(): void {
  rooms.clear();
  metrics.matchesStarted = 0;
  metrics.matchesFinished = 0;
  metrics.disconnectCount = 0;
  metrics.serverErrors = 0;
  setRoomEngineConfig(defaultRoomEngineConfig);
}

afterEach(() => {
  resetRoomEngineState();
});

beforeEach(() => {
  resetRoomEngineState();
});

describe("room engine config", () => {
  it("uses the configured time attack duration when starting a match", () => {
    setRoomEngineConfig({ timeAttackMs: 5_000 });

    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_time_attack_config",
      socketId: "socket_alice_time_attack_config"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_time_attack_config",
      socketId: "socket_bob_time_attack_config"
    });

    expect("error" in joined).toBe(false);

    const rule = setMatchRule("socket_alice_time_attack_config", created.room.roomCode, "timeAttack");
    expect("error" in rule).toBe(false);

    const started = startMatch("socket_alice_time_attack_config", created.room.roomCode);
    expect("error" in started).toBe(false);
    if ("error" in started) {
      throw new Error(started.error);
    }

    expect(started.room.matchEndsAt).toBe(started.room.serverStartAt! + 5_000);
  });

  it("cancels countdown after the disconnect grace expires", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_countdown_grace",
      socketId: "socket_alice_countdown_grace"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_countdown_grace",
      socketId: "socket_bob_countdown_grace"
    });

    expect("error" in joined).toBe(false);

    const started = startMatch("socket_alice_countdown_grace", created.room.roomCode);
    expect("error" in started).toBe(false);

    leaveBySocket("socket_alice_countdown_grace");

    const room = rooms.get(created.room.roomCode.toUpperCase());
    const player = room?.players.get("guest_alice_countdown_grace");

    expect(room).toBeDefined();
    expect(player).toBeDefined();

    if (!room || !player) {
      throw new Error("expected room and player to exist");
    }
    player.disconnectedAt = Date.now() - 11_000;

    const updatedRooms = checkForForfeits();

    expect(updatedRooms).toHaveLength(1);
    expect(updatedRooms[0]?.status).toBe("waiting");
    expect(updatedRooms[0]?.serverStartAt).toBeUndefined();
  });

  it("expires waiting and finished rooms using the documented TTLs", () => {
    const waitingRoom = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_waiting_ttl",
      socketId: "socket_alice_waiting_ttl"
    });

    const waiting = rooms.get(waitingRoom.room.roomCode.toUpperCase());
    expect(waiting).toBeDefined();
    if (!waiting) {
      throw new Error("expected waiting room to exist");
    }

    waiting.lastActivityAt = Date.now() - 30 * 60 * 1000 - 1;
    cleanupExpiredRooms();
    expect(rooms.has(waitingRoom.room.roomCode.toUpperCase())).toBe(false);

    const finishedRoom = createRoom({
      nickname: "Bob",
      guestId: "guest_bob_finished_ttl",
      socketId: "socket_bob_finished_ttl"
    });

    const finished = rooms.get(finishedRoom.room.roomCode.toUpperCase());
    expect(finished).toBeDefined();
    if (!finished) {
      throw new Error("expected finished room to exist");
    }

    finished.status = "finished";
    finished.lastActivityAt = Date.now() - 10 * 60 * 1000 - 1;
    cleanupExpiredRooms();
    expect(rooms.has(finishedRoom.room.roomCode.toUpperCase())).toBe(false);
  });
});

describe("room state restoration", () => {
  it("resets human players to disconnected while keeping bots active", () => {
    const room: RoomState = {
      roomCode: "ab12cd",
      hostPlayerId: "guest-alice",
      status: "countdown",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      serverStartAt: Date.now() + 3_000,
      players: [
        {
          id: "guest-alice",
          nickname: "Alice",
          connected: true,
          ready: true,
          isHost: true,
          isBot: false,
          progressIndex: 5,
          correctCharacters: 5,
          totalTypedCharacters: 5,
          mistakes: 0,
          maxStreak: 1,
          currentStreak: 1,
          wpm: 120,
          accuracy: 100
        },
        {
          id: "bot_com_1",
          nickname: "COM",
          connected: true,
          ready: true,
          isHost: false,
          isBot: true,
          progressIndex: 2,
          correctCharacters: 2,
          totalTypedCharacters: 2,
          mistakes: 0,
          maxStreak: 1,
          currentStreak: 1,
          wpm: 80,
          accuracy: 100
        }
      ],
      maxPlayers: 2
    };

    restoreRoomState(room);

    const restored = rooms.get("AB12CD");

    expect(restored).toBeDefined();
    if (!restored) {
      throw new Error("expected restored room to exist");
    }

    expect(restored.players.get("guest-alice")?.connected).toBe(false);
    expect(restored.players.get("guest-alice")?.ready).toBe(false);
    expect(restored.players.get("guest-alice")?.disconnectedAt).toBeDefined();
    expect(restored.players.get("bot_com_1")?.connected).toBe(true);
    expect(restored.players.get("bot_com_1")?.ready).toBe(true);
  });
});
