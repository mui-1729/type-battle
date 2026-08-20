import { describe, expect, it } from "vitest";
import {
  BLOCKED_PLAYERS_STORAGE_KEY,
  blockPlayer,
  canBlockPlayer,
  isPlayerBlocked,
  loadBlockedPlayers,
  unblockPlayer
} from "../lib/blocked-players";

function createStorage(initial?: string) {
  const values = new Map<string, string>(initial ? [[BLOCKED_PLAYERS_STORAGE_KEY, initial]] : []);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("blocked players", () => {
  it("persists and restores a blocked opponent", () => {
    const storage = createStorage();
    blockPlayer(storage, { id: "guest_rival", nickname: "Rival", blockedAt: 123 });

    expect(loadBlockedPlayers(storage)).toEqual([{ id: "guest_rival", nickname: "Rival", blockedAt: 123 }]);
    expect(isPlayerBlocked(storage, "guest_rival")).toBe(true);
  });

  it("updates an existing block without duplicating it", () => {
    const storage = createStorage();
    blockPlayer(storage, { id: "guest_rival", nickname: "Before", blockedAt: 100 });
    blockPlayer(storage, { id: "guest_rival", nickname: "After", blockedAt: 200 });

    expect(loadBlockedPlayers(storage)).toEqual([{ id: "guest_rival", nickname: "After", blockedAt: 200 }]);
  });

  it("unblocks an opponent", () => {
    const storage = createStorage();
    blockPlayer(storage, { id: "guest_rival", nickname: "Rival", blockedAt: 123 });

    expect(unblockPlayer(storage, "guest_rival")).toEqual([]);
    expect(isPlayerBlocked(storage, "guest_rival")).toBe(false);
  });

  it("ignores corrupt storage entries", () => {
    const storage = createStorage(
      JSON.stringify([
        { id: "guest_valid", nickname: "Valid", blockedAt: 123 },
        { id: "", nickname: "Empty", blockedAt: 123 },
        { id: "bot_com_1", nickname: "COM", blockedAt: 123 },
        { id: "guest_missing_time", nickname: "Missing" }
      ])
    );

    expect(loadBlockedPlayers(storage)).toEqual([{ id: "guest_valid", nickname: "Valid", blockedAt: 123 }]);
  });

  it("does not allow blocking self or COM", () => {
    expect(canBlockPlayer("guest_self", "guest_self")).toBe(false);
    expect(canBlockPlayer("bot_com_1", "guest_self")).toBe(false);
    expect(canBlockPlayer("guest_rival", "guest_self")).toBe(true);
  });
});
