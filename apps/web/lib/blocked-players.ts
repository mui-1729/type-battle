export type BlockedPlayer = {
  id: string;
  nickname: string;
  blockedAt: number;
};

export const BLOCKED_PLAYERS_STORAGE_KEY = "type-battle:blocked-players";
const MAX_BLOCKED_PLAYERS = 100;

export function loadBlockedPlayers(storage: Pick<Storage, "getItem">): BlockedPlayer[] {
  const rawValue = storage.getItem(BLOCKED_PLAYERS_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const uniquePlayers = new Map<string, BlockedPlayer>();
    for (const value of parsedValue) {
      if (!isBlockedPlayer(value)) {
        continue;
      }

      uniquePlayers.set(value.id, value);
    }

    return [...uniquePlayers.values()]
      .sort((left, right) => right.blockedAt - left.blockedAt)
      .slice(0, MAX_BLOCKED_PLAYERS);
  } catch {
    return [];
  }
}

export function blockPlayer(
  storage: Pick<Storage, "getItem" | "setItem">,
  player: Omit<BlockedPlayer, "blockedAt"> & { blockedAt?: number }
): BlockedPlayer[] {
  const id = player.id.trim();
  if (!id || isBotPlayerId(id)) {
    return loadBlockedPlayers(storage);
  }

  const blockedPlayer: BlockedPlayer = {
    id,
    nickname: player.nickname.trim() || "名前未設定",
    blockedAt: player.blockedAt ?? Date.now()
  };
  const nextPlayers = [blockedPlayer, ...loadBlockedPlayers(storage).filter((entry) => entry.id !== id)].slice(
    0,
    MAX_BLOCKED_PLAYERS
  );

  persistBlockedPlayers(storage, nextPlayers);
  return nextPlayers;
}

export function unblockPlayer(
  storage: Pick<Storage, "getItem" | "setItem">,
  playerId: string
): BlockedPlayer[] {
  const nextPlayers = loadBlockedPlayers(storage).filter((entry) => entry.id !== playerId);
  persistBlockedPlayers(storage, nextPlayers);
  return nextPlayers;
}

export function isPlayerBlocked(storage: Pick<Storage, "getItem">, playerId: string): boolean {
  return loadBlockedPlayers(storage).some((entry) => entry.id === playerId);
}

export function canBlockPlayer(playerId: string, ownPlayerId: string | null | undefined): boolean {
  const normalizedPlayerId = playerId.trim();
  return Boolean(normalizedPlayerId && normalizedPlayerId !== ownPlayerId && !isBotPlayerId(normalizedPlayerId));
}

function persistBlockedPlayers(storage: Pick<Storage, "setItem">, players: BlockedPlayer[]): void {
  storage.setItem(BLOCKED_PLAYERS_STORAGE_KEY, JSON.stringify(players));
}

function isBotPlayerId(playerId: string): boolean {
  return playerId.startsWith("bot_");
}

function isBlockedPlayer(value: unknown): value is BlockedPlayer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BlockedPlayer>;
  return (
    typeof candidate.id === "string" &&
    Boolean(candidate.id.trim()) &&
    !isBotPlayerId(candidate.id) &&
    typeof candidate.nickname === "string" &&
    typeof candidate.blockedAt === "number" &&
    Number.isFinite(candidate.blockedAt) &&
    candidate.blockedAt >= 0
  );
}
