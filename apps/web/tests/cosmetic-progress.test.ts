import { describe, expect, it } from "vitest";
import {
  awardStyleCoins,
  calculateStyleCoinReward,
  COSMETIC_PROGRESS_STORAGE_KEY,
  createMatchRewardKey,
  createPracticeRewardKey,
  DEFAULT_COSMETIC_PROGRESS,
  equipCosmetic,
  LEGACY_PLAYER_REWARDS_STORAGE_KEY,
  loadCosmeticProgress,
  persistCosmeticProgress,
  purchaseCosmetic,
} from "../lib/cosmetic-progress";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("cosmetic progress", () => {
  it("starts with the initial owned cosmetics and default equipment", () => {
    const progress = loadCosmeticProgress(createStorage());

    expect(progress).toEqual(DEFAULT_COSMETIC_PROGRESS);
    expect(progress.ownedHeadAccessoryIds).toEqual(["none", "cap", "headband"]);
    expect(progress.ownedHeldItemIds).toEqual(["none", "wood-sword"]);
    expect(progress.headAccessoryId).toBe("cap");
    expect(progress.heldItemId).toBe("wood-sword");
  });

  it("sanitizes saved progress and keeps required initial cosmetics", () => {
    const storage = createStorage({
      [COSMETIC_PROGRESS_STORAGE_KEY]: JSON.stringify({
        version: 2,
        styleCoins: 123.9,
        ownedHeadAccessoryIds: ["sunglasses", "sunglasses", "invalid"],
        ownedHeldItemIds: ["umbrella", "invalid"],
        headAccessoryId: "invalid",
        heldItemId: "umbrella",
        claimedRewardKeys: ["match:one", "", "match:one"],
      }),
    });

    expect(loadCosmeticProgress(storage)).toEqual({
      version: 2,
      styleCoins: 123,
      ownedHeadAccessoryIds: ["none", "cap", "headband", "sunglasses"],
      ownedHeldItemIds: ["none", "wood-sword", "umbrella"],
      headAccessoryId: "cap",
      heldItemId: "umbrella",
      claimedRewardKeys: ["match:one"],
    });
  });

  it("migrates legacy points and known head cosmetics", () => {
    const storage = createStorage({
      [LEGACY_PLAYER_REWARDS_STORAGE_KEY]: JSON.stringify({
        points: 85,
        unlockedAccessoryIds: ["sunglasses", "unknown"],
        claimedDailyKeys: ["2026-07-30:race"],
      }),
    });

    const progress = loadCosmeticProgress(storage);
    expect(progress.styleCoins).toBe(85);
    expect(progress.ownedHeadAccessoryIds).toContain("sunglasses");
    expect(progress.ownedHeadAccessoryIds).not.toContain("unknown");
    expect(progress.claimedRewardKeys).toEqual(["legacy:2026-07-30:race"]);
  });

  it("persists a progress snapshot", () => {
    const storage = createStorage();
    const progress = { ...DEFAULT_COSMETIC_PROGRESS, styleCoins: 42 };

    persistCosmeticProgress(storage, progress);

    expect(loadCosmeticProgress(storage)).toEqual(progress);
  });

  it("purchases without auto-equipping and rejects duplicate or unaffordable purchases", () => {
    const funded = { ...DEFAULT_COSMETIC_PROGRESS, styleCoins: 100 };
    const purchase = purchaseCosmetic(funded, {
      slot: "head",
      id: "sunglasses",
    });

    expect(purchase.ok).toBe(true);
    if (!purchase.ok) {
      throw new Error("expected purchase to succeed");
    }
    expect(purchase.price).toBe(75);
    expect(purchase.progress.styleCoins).toBe(25);
    expect(purchase.progress.ownedHeadAccessoryIds).toContain("sunglasses");
    expect(purchase.progress.headAccessoryId).toBe("cap");
    expect(purchaseCosmetic(purchase.progress, {
      slot: "head",
      id: "sunglasses",
    })).toMatchObject({ ok: false, reason: "already-owned" });
    expect(purchaseCosmetic(DEFAULT_COSMETIC_PROGRESS, {
      slot: "held",
      id: "umbrella",
    })).toMatchObject({ ok: false, reason: "insufficient-coins" });
  });

  it("equips only owned cosmetics", () => {
    expect(equipCosmetic(DEFAULT_COSMETIC_PROGRESS, {
      slot: "head",
      id: "headband",
    }).headAccessoryId).toBe("headband");
    expect(equipCosmetic(DEFAULT_COSMETIC_PROGRESS, {
      slot: "head",
      id: "crown",
    })).toBe(DEFAULT_COSMETIC_PROGRESS);
  });
});

describe("style coin rewards", () => {
  it("calculates completion and performance bonuses", () => {
    expect(calculateStyleCoinReward({
      rewardKey: "practice:1",
      source: "practice",
      completed: true,
      accuracy: 94,
      mistakes: 1,
    })).toEqual({
      completion: 10,
      victory: 0,
      highAccuracy: 0,
      perfect: 0,
      total: 10,
    });
    expect(calculateStyleCoinReward({
      rewardKey: "daily:1",
      source: "daily",
      completed: true,
      accuracy: 95,
      mistakes: 1,
    }).total).toBe(30);
    expect(calculateStyleCoinReward({
      rewardKey: "match:1",
      source: "match",
      completed: true,
      won: true,
      accuracy: 100,
      mistakes: 0,
    })).toEqual({
      completion: 20,
      victory: 10,
      highAccuracy: 5,
      perfect: 5,
      total: 40,
    });
  });

  it("gives no reward for incomplete play and never claims its key", () => {
    const reward = awardStyleCoins(DEFAULT_COSMETIC_PROGRESS, {
      rewardKey: "match:forfeit",
      source: "match",
      completed: false,
      won: true,
      accuracy: 100,
      mistakes: 0,
    });

    expect(reward.awarded).toBe(false);
    expect(reward.breakdown.total).toBe(0);
    expect(reward.progress.claimedRewardKeys).not.toContain("match:forfeit");
  });

  it("awards the same result only once", () => {
    const input = {
      rewardKey: "match:ABCD:2:player-1",
      source: "match" as const,
      completed: true,
      won: false,
      accuracy: 100,
      mistakes: 0,
    };
    const first = awardStyleCoins(DEFAULT_COSMETIC_PROGRESS, input);
    const duplicate = awardStyleCoins(first.progress, input);

    expect(first.awarded).toBe(true);
    expect(first.progress.styleCoins).toBe(30);
    expect(duplicate.awarded).toBe(false);
    expect(duplicate.progress.styleCoins).toBe(30);
  });

  it("creates stable reward keys", () => {
    expect(createMatchRewardKey("ab12", 3.8, "player-1"))
      .toBe("match:AB12:3:player-1");
    expect(createMatchRewardKey("ab12", -2, "player-1"))
      .toBe("match:AB12:0:player-1");
    expect(createPracticeRewardKey("session-1"))
      .toBe("practice:session-1");
  });
});
