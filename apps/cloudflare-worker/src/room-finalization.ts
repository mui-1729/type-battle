import type { MatchResult, MatchRule, MatchStatus, PlayerState } from "@type-battle/shared";

export type FinalizationPlayer = PlayerState & {
  isBot: boolean;
};

export type FinalizationRoom<Player extends FinalizationPlayer = FinalizationPlayer> = {
  status: MatchStatus;
  matchRule: MatchRule;
  result?: MatchResult;
  finishedAt?: number;
  players: Map<string, Player>;
};

type TypingLengthResolver<Room, Player> = (room: Room, player: Player) => number;

export function areHumanPlayersFinished<
  Player extends FinalizationPlayer,
  Room extends FinalizationRoom<Player>
>(room: Room, getTypingLength: TypingLengthResolver<Room, Player>): boolean {
  if (room.matchRule === "timeAttack") {
    return false;
  }

  return [...room.players.values()]
    .filter((player) => !player.isBot)
    .every((player) => {
      if (player.finishStatus === "forfeited" || player.finishStatus === "eliminated") {
        return true;
      }

      if (room.matchRule === "hpBattle" && (player.hp ?? 0) <= 0) {
        return true;
      }

      return player.progressIndex >= getTypingLength(room, player);
    });
}

export function markUnfinishedBots<
  Player extends FinalizationPlayer,
  Room extends FinalizationRoom<Player>
>(
  room: Room,
  getTypingLength: TypingLengthResolver<Room, Player>,
  now: number
): void {
  for (const bot of [...room.players.values()].filter((player) => player.isBot)) {
    if (bot.progressIndex < getTypingLength(room, bot)) {
      bot.finishedAt = now;
      delete bot.finishTimeMs;
      bot.finishStatus = "unfinished";
    }
  }
}

export function markUnfinishedRacePlayers<
  Player extends FinalizationPlayer,
  Room extends FinalizationRoom<Player>
>(
  room: Room,
  getTypingLength: TypingLengthResolver<Room, Player>,
  now: number
): void {
  for (const player of room.players.values()) {
    if (player.finishStatus === "finished" || player.progressIndex >= getTypingLength(room, player)) {
      continue;
    }

    player.finishedAt = now;
    delete player.finishTimeMs;
    player.finishStatus = "unfinished";
  }
}

export function prepareRoomFinalization<
  Player extends FinalizationPlayer,
  Room extends FinalizationRoom<Player>
>(
  room: Room,
  getTypingLength: TypingLengthResolver<Room, Player>,
  now: number
): boolean {
  if (room.matchRule === "timeAttack") {
    return false;
  }

  if (
    room.matchRule === "hpBattle"
    && [...room.players.values()].some((player) => (player.hp ?? 1) <= 0)
  ) {
    return true;
  }

  if (
    room.matchRule === "race"
    && [...room.players.values()].some((player) => player.finishStatus === "finished")
  ) {
    markUnfinishedRacePlayers(room, getTypingLength, now);
    return true;
  }

  if (areHumanPlayersFinished(room, getTypingLength)) {
    markUnfinishedBots(room, getTypingLength, now);
    return true;
  }

  return false;
}

export function finalizeRoomState<Room extends FinalizationRoom>(
  room: Room,
  createResult: () => MatchResult,
  now: number
): MatchResult {
  if (room.status === "finished" && room.result) {
    return room.result;
  }

  room.status = "finished";
  room.finishedAt = now;
  const result = createResult();
  room.result = result;
  return result;
}
