import type { MatchRule } from "@type-battle/shared";

export const PLAYER_REWARDS_STORAGE_KEY = "type-battle:rewards:v1";

export type PlayerRewards = {
  version: 1;
  points: number;
  unlockedAccessoryIds: string[];
  claimedDailyKeys: string[];
};

export const DEFAULT_PLAYER_REWARDS: PlayerRewards = {
  version: 1,
  points: 0,
  unlockedAccessoryIds: ["none", "cap", "headband"],
  claimedDailyKeys: []
};

export function loadPlayerRewards(storage: Pick<Storage, "getItem">): PlayerRewards {
  const raw = storage.getItem(PLAYER_REWARDS_STORAGE_KEY);
  if (!raw) return cloneDefaultRewards();

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerRewards>;
    const points = typeof parsed.points === "number" && Number.isFinite(parsed.points) ? Math.max(0, Math.floor(parsed.points)) : 0;
    const unlocked = Array.isArray(parsed.unlockedAccessoryIds)
      ? parsed.unlockedAccessoryIds.filter((value): value is string => typeof value === "string")
      : [];
    const claimed = Array.isArray(parsed.claimedDailyKeys)
      ? parsed.claimedDailyKeys.filter((value): value is string => typeof value === "string").slice(-100)
      : [];
    return {
      version: 1,
      points,
      unlockedAccessoryIds: [...new Set(["none", "cap", "headband", ...unlocked])],
      claimedDailyKeys: [...new Set(claimed)]
    };
  } catch {
    return cloneDefaultRewards();
  }
}

export function persistPlayerRewards(storage: Pick<Storage, "setItem">, rewards: PlayerRewards): void {
  storage.setItem(PLAYER_REWARDS_STORAGE_KEY, JSON.stringify(rewards));
}

export function isAccessoryUnlocked(rewards: PlayerRewards, accessoryId: string): boolean {
  return rewards.unlockedAccessoryIds.includes(accessoryId);
}

export function claimPerfectReward(
  rewards: PlayerRewards,
  options: {
    dateKey: string;
    source: "match" | "daily";
    matchRule?: MatchRule;
    officialPreset: boolean;
    perfect: boolean;
    forfeited: boolean;
  }
): { rewards: PlayerRewards; awarded: boolean } {
  if (!options.officialPreset || !options.perfect || options.forfeited) {
    return { rewards, awarded: false };
  }

  const claimKey = options.source === "daily" ? `daily:${options.dateKey}` : `match:${options.dateKey}:${options.matchRule ?? "unknown"}`;
  if (rewards.claimedDailyKeys.includes(claimKey)) {
    return { rewards, awarded: false };
  }

  const nextPoints = rewards.points + 1;
  return {
    awarded: true,
    rewards: {
      ...rewards,
      points: nextPoints,
      claimedDailyKeys: [...rewards.claimedDailyKeys, claimKey],
      unlockedAccessoryIds: rewards.unlockedAccessoryIds
    }
  };
}

function cloneDefaultRewards(): PlayerRewards {
  return {
    ...DEFAULT_PLAYER_REWARDS,
    unlockedAccessoryIds: [...DEFAULT_PLAYER_REWARDS.unlockedAccessoryIds],
    claimedDailyKeys: []
  };
}
