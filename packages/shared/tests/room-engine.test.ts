import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRoom as createRoomImpl,
  joinRoom as joinRoomImpl,
  rooms,
  resetRoomEngineState,
  setReady,
  setMatchRule,
  setRoomEngineConfig,
  startMatch
} from "../src/room-engine.js";

function testSessionId(guestId: string): string {
  return `session:${guestId}`;
}

function createRoom(input: Parameters<typeof createRoomImpl>[0]): ReturnType<typeof createRoomImpl> {
  return createRoomImpl({
    ...input,
    sessionId: input.sessionId ?? testSessionId(input.guestId)
  });
}

function joinRoom(input: Parameters<typeof joinRoomImpl>[0]): ReturnType<typeof joinRoomImpl> {
  return joinRoomImpl({
    ...input,
    sessionId: input.sessionId ?? testSessionId(input.guestId)
  });
}

afterEach(() => {
  resetRoomEngineState();
  setRoomEngineConfig({ timeAttackMs: 30_000 });
});

beforeEach(() => {
  resetRoomEngineState();
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

  it("invalidates the previous socket when an existing player rejoins", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_rebind",
      socketId: "socket_alice_rebind_1"
    });

    const rejoined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Alice",
      guestId: "guest_alice_rebind",
      socketId: "socket_alice_rebind_2"
    });

    expect("error" in rejoined).toBe(false);

    expect(setReady("socket_alice_rebind_1", created.room.roomCode, true)).toBeNull();
    expect(setReady("socket_alice_rebind_2", created.room.roomCode, true)).not.toBeNull();
  });

  it("rejects a rejoin from another session", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_session_guard",
      socketId: "socket_alice_session_guard_1",
      sessionId: "session-alice"
    });

    const rejected = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Alice",
      guestId: "guest_alice_session_guard",
      socketId: "socket_alice_session_guard_2",
      sessionId: "session-intruder"
    });

    expect(rejected).toEqual({
      error: "このプレイヤーは別のセッションで使用されています。"
    });
  });
});
