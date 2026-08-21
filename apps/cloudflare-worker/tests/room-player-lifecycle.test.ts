import { describe, expect, it } from "vitest";
import type { MatchStatus, PlayerState } from "@type-battle/shared";
import {
  disconnectPlayer,
  ensureConnectedHost,
  forfeitExpiredDisconnectedPlayers,
  forfeitPlayer,
  removePlayerAndReassignHost,
  type LifecyclePlayer,
  type LifecycleRoom
} from "../src/room-player-lifecycle.js";

type TestRoom = LifecycleRoom<LifecyclePlayer>;

function createPlayer(id: string, overrides: Partial<PlayerState & { disconnectedAt: number }> = {}): LifecyclePlayer {
  return {
    id,
    nickname: id,
    connected: true,
    ready: true,
    isHost: id === "host",
    isBot: false,
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    maxStreak: 0,
    currentStreak: 0,
    wpm: 0,
    accuracy: 100,
    ...overrides
  };
}

function createRoom(players: LifecyclePlayer[], status: MatchStatus = "waiting"): TestRoom {
  return {
    hostPlayerId: "host",
    status,
    players: new Map(players.map((player) => [player.id, player]))
  };
}

describe("room player lifecycle", () => {
  it("moves host to a connected human after disconnect", () => {
    const host = createPlayer("host");
    const guest = createPlayer("guest", { isHost: false });
    const room = createRoom([host, guest]);

    disconnectPlayer(host, 1000);
    ensureConnectedHost(room);

    expect(host.connected).toBe(false);
    expect(host.ready).toBe(false);
    expect(host.disconnectedAt).toBe(1000);
    expect(room.hostPlayerId).toBe("guest");
  });

  it("never assigns host to a bot", () => {
    const host = createPlayer("host", { connected: false });
    const bot = createPlayer("bot", { connected: true, isBot: true, isHost: false });
    const room = createRoom([host, bot]);

    ensureConnectedHost(room);

    expect(room.hostPlayerId).toBe("host");
  });

  it("marks an explicit leave as a terminal forfeit", () => {
    const player = createPlayer("host", { finishTimeMs: 200 });

    forfeitPlayer(player, 3000);

    expect(player.connected).toBe(false);
    expect(player.finishStatus).toBe("forfeited");
    expect(player.forfeited).toBe(true);
    expect(player.finishedAt).toBe(3000);
    expect(player.finishTimeMs).toBeUndefined();
  });

  it("forfeits only disconnected players beyond the grace period", () => {
    const expired = createPlayer("host", { connected: false, disconnectedAt: 1000 });
    const recent = createPlayer("guest", { connected: false, disconnectedAt: 4500, isHost: false });
    const room = createRoom([expired, recent], "playing");

    expect(forfeitExpiredDisconnectedPlayers(room, 5000, 3000)).toBe(true);
    expect(expired.finishStatus).toBe("forfeited");
    expect(recent.finishStatus).toBeUndefined();
  });

  it("removes a player and reassigns host atomically", () => {
    const room = createRoom([
      createPlayer("host"),
      createPlayer("guest", { isHost: false })
    ]);

    removePlayerAndReassignHost(room, "host");

    expect(room.players.has("host")).toBe(false);
    expect(room.hostPlayerId).toBe("guest");
  });
});
