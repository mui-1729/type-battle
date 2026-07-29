import { describe, expect, it } from "vitest";
import {
  DEFAULT_EQUIPMENT,
  HEAD_ACCESSORY_CATALOG,
  HEAD_ACCESSORY_IDS,
  HELD_ITEM_CATALOG,
  HELD_ITEM_IDS,
  INITIAL_OWNED_HEAD_ACCESSORY_IDS,
  INITIAL_OWNED_HELD_ITEM_IDS,
  isHeadAccessoryId,
  isHeldItemId
} from "../src/cosmetics.js";

describe("cosmetic catalog", () => {
  it("keeps ids unique and the allowlist guards exact", () => {
    expect(new Set(HEAD_ACCESSORY_IDS).size).toBe(HEAD_ACCESSORY_CATALOG.length);
    expect(new Set(HELD_ITEM_IDS).size).toBe(HELD_ITEM_CATALOG.length);
    expect(HEAD_ACCESSORY_IDS.every(isHeadAccessoryId)).toBe(true);
    expect(HELD_ITEM_IDS.every(isHeldItemId)).toBe(true);
    expect(["", "cap ", 1, null].some(isHeadAccessoryId)).toBe(false);
    expect(["", "wood-sword ", 1, null].some(isHeldItemId)).toBe(false);
  });

  it("keeps prices inside each rarity band, except the free none option", () => {
    const bands = {
      normal: [50, 100],
      rare: [150, 250],
      epic: [350, 500],
      legendary: [750, 1000]
    } as const;

    for (const cosmetic of [...HEAD_ACCESSORY_CATALOG, ...HELD_ITEM_CATALOG]) {
      expect(cosmetic.slot === "head" || cosmetic.slot === "held").toBe(true);
      expect(cosmetic.name.length).toBeGreaterThan(0);
      if (cosmetic.id === "none") {
        expect(cosmetic.price).toBe(0);
      } else {
        const [minimum, maximum] = bands[cosmetic.rarity];
        expect(cosmetic.price).toBeGreaterThanOrEqual(minimum);
        expect(cosmetic.price).toBeLessThanOrEqual(maximum);
      }
    }
  });

  it("defines the initial inventory and equipped pair", () => {
    expect(INITIAL_OWNED_HEAD_ACCESSORY_IDS).toEqual(["none", "cap", "headband"]);
    expect(INITIAL_OWNED_HELD_ITEM_IDS).toEqual(["none", "wood-sword"]);
    expect(INITIAL_OWNED_HEAD_ACCESSORY_IDS).toContain(DEFAULT_EQUIPMENT.headAccessoryId);
    expect(INITIAL_OWNED_HELD_ITEM_IDS).toContain(DEFAULT_EQUIPMENT.heldItemId);
  });
});
