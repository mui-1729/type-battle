import { describe, expect, it } from "vitest";
import { getUnlockedAccessoryIndices } from "../lib/player-accessories";
import {
  claimPerfectReward,
  DEFAULT_PLAYER_REWARDS,
  loadPlayerRewards,
  persistPlayerRewards
} from "../lib/player-rewards";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("player rewards", () => {
  it("keeps versioned rewards and unlocks accessories by points", () => {
    const storage = createStorage();
    const awarded = claimPerfectReward(DEFAULT_PLAYER_REWARDS, {
      dateKey: "2026-07-16",
      source: "match",
      matchRule: "race",
      officialPreset: true,
      perfect: true,
      forfeited: false
    });

    persistPlayerRewards(storage, awarded.rewards);
    const loaded = loadPlayerRewards(storage);
    expect(loaded.points).toBe(1);
    expect(getUnlockedAccessoryIndices(5, loaded.unlockedAccessoryIds)).toContain(3);
  });

  it("allows each official rule only once per day and rejects custom or forfeited wins", () => {
    const options = {
      dateKey: "2026-07-16",
      source: "match" as const,
      matchRule: "race" as const,
      officialPreset: true,
      perfect: true,
      forfeited: false
    };
    const first = claimPerfectReward(DEFAULT_PLAYER_REWARDS, options);
    const duplicate = claimPerfectReward(first.rewards, options);
    expect(first.awarded).toBe(true);
    expect(duplicate.awarded).toBe(false);
    expect(claimPerfectReward(first.rewards, { ...options, officialPreset: false }).awarded).toBe(false);
    expect(claimPerfectReward(first.rewards, { ...options, forfeited: true }).awarded).toBe(false);
  });
});
