import {
  DEFAULT_EQUIPMENT,
  HEAD_ACCESSORY_CATALOG,
  HELD_ITEM_CATALOG,
  INITIAL_OWNED_HEAD_ACCESSORY_IDS,
  INITIAL_OWNED_HELD_ITEM_IDS,
  isHeadAccessoryId,
  isHeldItemId,
  type HeadAccessoryId,
  type HeldItemId,
} from "@type-battle/shared";

export const COSMETIC_PROGRESS_STORAGE_KEY = "type-battle:cosmetic-progress:v2";
export const LEGACY_PLAYER_REWARDS_STORAGE_KEY = "type-battle:rewards:v1";

export type CosmeticProgress = {
  version: 2;
  styleCoins: number;
  ownedHeadAccessoryIds: HeadAccessoryId[];
  ownedHeldItemIds: HeldItemId[];
  headAccessoryId: HeadAccessoryId;
  heldItemId: HeldItemId;
  claimedRewardKeys: string[];
};

export type CosmeticPurchase =
  | {
      ok: true;
      progress: CosmeticProgress;
      price: number;
    }
  | {
      ok: false;
      progress: CosmeticProgress;
      reason: "already-owned" | "insufficient-coins" | "unknown-cosmetic";
    };

export type StyleCoinRewardInput = {
  rewardKey: string;
  source: "practice" | "daily" | "match";
  completed: boolean;
  won?: boolean;
  accuracy: number;
  mistakes: number;
};

export type StyleCoinRewardBreakdown = {
  completion: number;
  victory: number;
  highAccuracy: number;
  perfect: number;
  total: number;
};

export type StyleCoinRewardResult = {
  progress: CosmeticProgress;
  awarded: boolean;
  breakdown: StyleCoinRewardBreakdown;
};

export const DEFAULT_COSMETIC_PROGRESS: CosmeticProgress = {
  version: 2,
  styleCoins: 0,
  ownedHeadAccessoryIds: [...INITIAL_OWNED_HEAD_ACCESSORY_IDS],
  ownedHeldItemIds: [...INITIAL_OWNED_HELD_ITEM_IDS],
  headAccessoryId: DEFAULT_EQUIPMENT.headAccessoryId,
  heldItemId: DEFAULT_EQUIPMENT.heldItemId,
  claimedRewardKeys: [],
};

type CosmeticStorage = Pick<Storage, "getItem">;

export function loadCosmeticProgress(storage: CosmeticStorage): CosmeticProgress {
  const stored = parseProgress(storage.getItem(COSMETIC_PROGRESS_STORAGE_KEY));
  if (stored) {
    return stored;
  }
  return migrateLegacyProgress(storage.getItem(LEGACY_PLAYER_REWARDS_STORAGE_KEY));
}

export function persistCosmeticProgress(
  storage: Pick<Storage, "setItem">,
  progress: CosmeticProgress,
): void {
  storage.setItem(COSMETIC_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function purchaseCosmetic(
  progress: CosmeticProgress,
  selection:
    | { slot: "head"; id: HeadAccessoryId }
    | { slot: "held"; id: HeldItemId },
): CosmeticPurchase {
  const catalog = selection.slot === "head" ? HEAD_ACCESSORY_CATALOG : HELD_ITEM_CATALOG;
  const cosmetic = catalog.find((entry) => entry.id === selection.id);
  if (!cosmetic) {
    return { ok: false, progress, reason: "unknown-cosmetic" };
  }

  const owned = selection.slot === "head"
    ? progress.ownedHeadAccessoryIds.includes(selection.id as HeadAccessoryId)
    : progress.ownedHeldItemIds.includes(selection.id as HeldItemId);
  if (owned) {
    return { ok: false, progress, reason: "already-owned" };
  }
  if (progress.styleCoins < cosmetic.price) {
    return { ok: false, progress, reason: "insufficient-coins" };
  }

  return {
    ok: true,
    price: cosmetic.price,
    progress: selection.slot === "head"
      ? {
          ...progress,
          styleCoins: progress.styleCoins - cosmetic.price,
          ownedHeadAccessoryIds: [
            ...progress.ownedHeadAccessoryIds,
            selection.id as HeadAccessoryId,
          ],
        }
      : {
          ...progress,
          styleCoins: progress.styleCoins - cosmetic.price,
          ownedHeldItemIds: [
            ...progress.ownedHeldItemIds,
            selection.id as HeldItemId,
          ],
        },
  };
}

export function equipCosmetic(
  progress: CosmeticProgress,
  selection:
    | { slot: "head"; id: HeadAccessoryId }
    | { slot: "held"; id: HeldItemId },
): CosmeticProgress {
  if (selection.slot === "head") {
    return progress.ownedHeadAccessoryIds.includes(selection.id)
      ? { ...progress, headAccessoryId: selection.id }
      : progress;
  }
  return progress.ownedHeldItemIds.includes(selection.id)
    ? { ...progress, heldItemId: selection.id }
    : progress;
}

export function awardStyleCoins(
  progress: CosmeticProgress,
  input: StyleCoinRewardInput,
): StyleCoinRewardResult {
  const breakdown = calculateStyleCoinReward(input);
  if (
    breakdown.total === 0
    || progress.claimedRewardKeys.includes(input.rewardKey)
  ) {
    return { progress, awarded: false, breakdown };
  }

  return {
    awarded: true,
    breakdown,
    progress: {
      ...progress,
      styleCoins: progress.styleCoins + breakdown.total,
      claimedRewardKeys: [...progress.claimedRewardKeys, input.rewardKey],
    },
  };
}

export function calculateStyleCoinReward(
  input: StyleCoinRewardInput,
): StyleCoinRewardBreakdown {
  if (!input.completed) {
    return {
      completion: 0,
      victory: 0,
      highAccuracy: 0,
      perfect: 0,
      total: 0,
    };
  }

  const completion = input.source === "practice"
    ? 10
    : input.source === "daily"
      ? 25
      : 20;
  const victory = input.source === "match" && input.won ? 10 : 0;
  const safeAccuracy = Number.isFinite(input.accuracy)
    ? Math.max(0, Math.min(input.accuracy, 100))
    : 0;
  const safeMistakes = Number.isFinite(input.mistakes)
    ? Math.max(0, Math.floor(input.mistakes))
    : 0;
  const highAccuracy = safeAccuracy >= 95 ? 5 : 0;
  const perfect = safeAccuracy === 100 && safeMistakes === 0 ? 5 : 0;

  return {
    completion,
    victory,
    highAccuracy,
    perfect,
    total: completion + victory + highAccuracy + perfect,
  };
}

export function createMatchRewardKey(
  roomCode: string,
  round: number,
  playerId: string,
): string {
  return `match:${roomCode.toUpperCase()}:${Math.max(0, Math.floor(round))}:${playerId}`;
}

export function createPracticeRewardKey(practiceId: string): string {
  return `practice:${practiceId}`;
}

function parseProgress(raw: string | null): CosmeticProgress | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CosmeticProgress>;
    const ownedHeadAccessoryIds = uniqueValidIds(
      parsed.ownedHeadAccessoryIds,
      isHeadAccessoryId,
      INITIAL_OWNED_HEAD_ACCESSORY_IDS,
    );
    const ownedHeldItemIds = uniqueValidIds(
      parsed.ownedHeldItemIds,
      isHeldItemId,
      INITIAL_OWNED_HELD_ITEM_IDS,
    );
    const headAccessoryId = isHeadAccessoryId(parsed.headAccessoryId)
      && ownedHeadAccessoryIds.includes(parsed.headAccessoryId)
      ? parsed.headAccessoryId
      : DEFAULT_EQUIPMENT.headAccessoryId;
    const heldItemId = isHeldItemId(parsed.heldItemId)
      && ownedHeldItemIds.includes(parsed.heldItemId)
      ? parsed.heldItemId
      : DEFAULT_EQUIPMENT.heldItemId;

    return {
      version: 2,
      styleCoins: toSafeCoinAmount(parsed.styleCoins),
      ownedHeadAccessoryIds,
      ownedHeldItemIds,
      headAccessoryId,
      heldItemId,
      claimedRewardKeys: uniqueStrings(parsed.claimedRewardKeys),
    };
  } catch {
    return null;
  }
}

function migrateLegacyProgress(raw: string | null): CosmeticProgress {
  const fallback = cloneDefaultProgress();
  if (!raw) {
    return fallback;
  }

  try {
    const legacy = JSON.parse(raw) as {
      points?: unknown;
      unlockedAccessoryIds?: unknown;
      claimedDailyKeys?: unknown;
    };
    const legacyOwned = Array.isArray(legacy.unlockedAccessoryIds)
      ? legacy.unlockedAccessoryIds.filter(isHeadAccessoryId)
      : [];
    return {
      ...fallback,
      styleCoins: toSafeCoinAmount(legacy.points),
      ownedHeadAccessoryIds: [
        ...new Set([...fallback.ownedHeadAccessoryIds, ...legacyOwned]),
      ],
      claimedRewardKeys: Array.isArray(legacy.claimedDailyKeys)
        ? uniqueStrings(legacy.claimedDailyKeys).map((key) => `legacy:${key}`)
        : [],
    };
  } catch {
    return fallback;
  }
}

function uniqueValidIds<Id extends string>(
  value: unknown,
  guard: (entry: unknown) => entry is Id,
  required: readonly Id[],
): Id[] {
  const saved = Array.isArray(value) ? value.filter(guard) : [];
  return [...new Set([...required, ...saved])];
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => (
        typeof entry === "string" && entry.length > 0
      )))]
    : [];
}

function toSafeCoinAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function cloneDefaultProgress(): CosmeticProgress {
  return {
    ...DEFAULT_COSMETIC_PROGRESS,
    ownedHeadAccessoryIds: [...DEFAULT_COSMETIC_PROGRESS.ownedHeadAccessoryIds],
    ownedHeldItemIds: [...DEFAULT_COSMETIC_PROGRESS.ownedHeldItemIds],
    claimedRewardKeys: [],
  };
}
