import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRoom,
  joinRoom,
  getRoom,
  metrics,
  rooms,
  restoreRoomState,
  setMatchRule,
  setRoomEngineConfig,
  startMatch
} from "../src/room-engine.js";

afterEach(() => {
  rooms.clear();
  metrics.matchesStarted = 0;
  metrics.matchesFinished = 0;
  metrics.disconnectCount = 0;
  metrics.serverErrors = 0;
  setRoomEngineConfig({ timeAttackMs: 30_000 });
});

beforeEach(() => {
  rooms.clear();
  metrics.matchesStarted = 0;
  metrics.matchesFinished = 0;
  metrics.disconnectCount = 0;
  metrics.serverErrors = 0;
  setRoomEngineConfig({ timeAttackMs: 30_000 });
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
      return;
    }

    expect(started.room.matchEndsAt).toBe(started.room.serverStartAt! + 5_000);
  });

  it("restores disconnected players with a timestamp", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_restore",
      socketId: "socket_alice_restore"
    });

    restoreRoomState(created.room);

    const restored = getRoom(created.room.roomCode);

    expect(restored).not.toBeNull();
    expect(restored?.players[0]).toEqual(
      expect.objectContaining({
        connected: false,
        disconnectedAt: expect.any(Number)
      })
    );
  });
});
