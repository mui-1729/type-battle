import type { MatchStatus, PlayerState } from "@type-battle/shared";

export type LifecyclePlayer = PlayerState & {
  disconnectedAt?: number;
};

export type LifecycleRoom<Player extends LifecyclePlayer = LifecyclePlayer> = {
  hostPlayerId: string;
  status: MatchStatus;
  players: Map<string, Player>;
};

export function ensureConnectedHost<
  Player extends LifecyclePlayer,
  Room extends LifecycleRoom<Player>
>(room: Room, excludedPlayerId?: string): void {
  const currentHost = room.players.get(room.hostPlayerId);
  if (
    currentHost
    && currentHost.id !== excludedPlayerId
    && currentHost.connected
    && !currentHost.isBot
  ) {
    return;
  }

  const candidates = [...room.players.values()].filter(
    (player) => player.id !== excludedPlayerId && !player.isBot
  );
  const nextHost = candidates.find((player) => player.connected) ?? candidates[0];
  if (nextHost) {
    room.hostPlayerId = nextHost.id;
  }
}

export function disconnectPlayer(player: LifecyclePlayer, now: number): void {
  player.connected = false;
  player.ready = false;
  player.disconnectedAt = now;
}

export function forfeitPlayer(player: LifecyclePlayer, now: number): void {
  disconnectPlayer(player, now);
  player.finishedAt = now;
  delete player.finishTimeMs;
  player.finishStatus = "forfeited";
  player.forfeited = true;
}

export function forfeitExpiredDisconnectedPlayers<
  Player extends LifecyclePlayer,
  Room extends LifecycleRoom<Player>
>(room: Room, now: number, graceMs: number): boolean {
  let changed = false;

  for (const player of room.players.values()) {
    if (
      !player.connected
      && player.disconnectedAt !== undefined
      && now - player.disconnectedAt >= graceMs
      && !player.forfeited
    ) {
      player.finishedAt = now;
      delete player.finishTimeMs;
      player.finishStatus = "forfeited";
      player.forfeited = true;
      changed = true;
    }
  }

  return changed;
}

export function getExpiredDisconnectedPlayerIds<
  Player extends LifecyclePlayer,
  Room extends LifecycleRoom<Player>
>(room: Room, now: number, graceMs: number): string[] {
  return [...room.players.values()]
    .filter(
      (player) => !player.isBot
        && !player.connected
        && player.disconnectedAt !== undefined
        && now >= player.disconnectedAt + graceMs
    )
    .map((player) => player.id);
}

export function removePlayerAndReassignHost<
  Player extends LifecyclePlayer,
  Room extends LifecycleRoom<Player>
>(room: Room, playerId: string): void {
  room.players.delete(playerId);
  ensureConnectedHost(room, playerId);
}
