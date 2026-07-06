import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRoom,
  cleanupExpiredRooms,
  checkForForfeits,
  joinRoom,
  metrics,
  rooms,
  setMatchRule,
  setRoomEngineConfig,
  startMatch,
  leaveBySocket
} from "../src/room-engine.js";

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
