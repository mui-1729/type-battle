import type { MatchRule, PlayerFinishStatus } from "@type-battle/shared";

export type MatchFinalizeReason =
  | "forfeit"
  | "hp_elimination"
  | "hp_time_limit"
  | "race_finished"
  | "time_attack_expired"
  | "all_humans_finished"
  | "unknown";

export type MatchFinalizePlayerSnapshot = {
  id: string;
  isBot: boolean;
  connected: boolean;
  progressIndex: number;
  totalTypedCharacters: number;
  mistakes: number;
  hp?: number;
  finishStatus?: PlayerFinishStatus;
};

export function createMatchTraceId(roomCode: string, round: number): string {
  return `${roomCode.trim().toUpperCase()}:${round}`;
}

export function inferMatchFinalizeReason(input: {
  matchRule: MatchRule;
  now: number;
  matchEndsAt?: number;
  players: MatchFinalizePlayerSnapshot[];
}): MatchFinalizeReason {
  if (input.players.some((player) => player.finishStatus === "forfeited")) {
    return "forfeit";
  }

  if (input.matchRule === "timeAttack" && input.matchEndsAt !== undefined && input.now >= input.matchEndsAt) {
    return "time_attack_expired";
  }

  if (input.matchRule === "hpBattle") {
    if (input.players.some((player) => (player.hp ?? 1) <= 0)) {
      return "hp_elimination";
    }
    if (input.matchEndsAt !== undefined && input.now >= input.matchEndsAt) {
      return "hp_time_limit";
    }
  }

  if (input.matchRule === "race" && input.players.some((player) => player.finishStatus === "finished")) {
    return "race_finished";
  }

  const humans = input.players.filter((player) => !player.isBot);
  if (humans.length > 0 && humans.every((player) => player.finishStatus && player.finishStatus !== "unfinished")) {
    return "all_humans_finished";
  }

  return "unknown";
}

export function summarizeMatchPlayers(players: MatchFinalizePlayerSnapshot[]) {
  return players.map((player) => ({
    playerId: player.id,
    isBot: player.isBot,
    connected: player.connected,
    progressIndex: player.progressIndex,
    totalTypedCharacters: player.totalTypedCharacters,
    mistakes: player.mistakes,
    ...(player.hp === undefined ? {} : { hp: player.hp }),
    ...(player.finishStatus === undefined ? {} : { finishStatus: player.finishStatus })
  }));
}
