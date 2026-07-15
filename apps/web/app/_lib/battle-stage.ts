import type {
  MatchResult,
  MatchRule,
  PlayerState,
  RoomState
} from "@type-battle/shared";

export type BattleSide = "left" | "right";

export type BattleStagePhase = "waiting" | "countdown" | "playing" | "result";

export type BattlePlayerStatus =
  | "waiting"
  | "active"
  | "finished"
  | "reconnecting"
  | "forfeited"
  | "eliminated";

export type BattleStagePlayer = {
  id: string;
  nickname: string;
  side: BattleSide;
  isLocal: boolean;
  isBot: boolean;
  connected: boolean;
  status: BattlePlayerStatus;
  progressRatio: number;
  mistakes: number;
  mistakeGuards: number;
  currentStreak: number;
  hp?: number;
  maxHp?: number;
  finishStatus?: PlayerState["finishStatus"];
  isWinner: boolean;
};

export type BattleStageViewModel = {
  roomCode: string;
  mode: MatchRule;
  phase: BattleStagePhase;
  players: BattleStagePlayer[];
  leftPlayer: BattleStagePlayer | null;
  rightPlayer: BattleStagePlayer | null;
  winnerId: string | null;
  cargoPosition: number;
};

export type ResultAnimationTransition = "stable" | "enter" | "reset";

export type HpAdvantage = "left" | "right" | "even" | "unknown";

export const BATTLE_STAGE_COORDINATES = {
  leftStart: 14,
  leftCargo: 43,
  rightStart: 86,
  rightCargo: 57,
  cargoCenter: 50,
  cargoMin: 20,
  cargoMax: 80
} as const;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function toProgressRatio(progressIndex: number, promptLength: number): number {
  if (!Number.isFinite(promptLength) || promptLength <= 0) {
    return 0;
  }

  return clamp(progressIndex / promptLength, 0, 1);
}

export function toRacePosition(progressRatio: number, side: BattleSide): number {
  const ratio = clamp(progressRatio, 0, 1);
  const start = side === "left" ? BATTLE_STAGE_COORDINATES.leftStart : BATTLE_STAGE_COORDINATES.rightStart;
  const end = side === "left" ? BATTLE_STAGE_COORDINATES.leftCargo : BATTLE_STAGE_COORDINATES.rightCargo;

  return start + (end - start) * ratio;
}

export function toHpRatio(hp: number | undefined, maxHp: number | undefined): number | null {
  if (hp === undefined || maxHp === undefined || !Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return null;
  }

  return clamp((hp ?? 0) / maxHp, 0, 1);
}

export function getResultAnimationTransition(
  previousResultKey: string | null,
  nextResultKey: string | null
): ResultAnimationTransition {
  if (nextResultKey === null) {
    return previousResultKey === null ? "stable" : "reset";
  }

  return previousResultKey === null || previousResultKey !== nextResultKey ? "enter" : "stable";
}

export function toCargoPosition(
  leftHp: number | undefined,
  leftMaxHp: number | undefined,
  rightHp: number | undefined,
  rightMaxHp: number | undefined
): number {
  const leftRatio = toHpRatio(leftHp, leftMaxHp);
  const rightRatio = toHpRatio(rightHp, rightMaxHp);

  if (leftRatio === null || rightRatio === null) {
    return BATTLE_STAGE_COORDINATES.cargoCenter;
  }

  const pressure = leftRatio - rightRatio;
  const travel = BATTLE_STAGE_COORDINATES.cargoMax - BATTLE_STAGE_COORDINATES.cargoCenter;
  return clamp(
    BATTLE_STAGE_COORDINATES.cargoCenter + pressure * travel,
    BATTLE_STAGE_COORDINATES.cargoMin,
    BATTLE_STAGE_COORDINATES.cargoMax
  );
}

export function getHpAdvantage(
  leftHp: number | undefined,
  leftMaxHp: number | undefined,
  rightHp: number | undefined,
  rightMaxHp: number | undefined
): HpAdvantage {
  const leftRatio = toHpRatio(leftHp, leftMaxHp);
  const rightRatio = toHpRatio(rightHp, rightMaxHp);

  if (leftRatio === null || rightRatio === null) {
    return "unknown";
  }

  const pressure = leftRatio - rightRatio;
  if (Math.abs(pressure) < 0.001) {
    return "even";
  }

  return pressure > 0 ? "left" : "right";
}

export function assignBattleSides(
  players: readonly Pick<PlayerState, "id" | "isHost">[],
  localPlayerId: string
): { leftPlayerId: string | null; rightPlayerId: string | null } {
  void localPlayerId;
  if (players.length === 0) {
    return { leftPlayerId: null, rightPlayerId: null };
  }

  const hostPlayer = players.find((player) => player.isHost);

  if (hostPlayer) {
    return {
      leftPlayerId: hostPlayer.id,
      rightPlayerId: players.find((player) => player.id !== hostPlayer.id)?.id ?? null
    };
  }

  const sortedIds = players.map((player) => player.id).sort((a, b) => a.localeCompare(b));
  return {
    leftPlayerId: sortedIds[0] ?? null,
    rightPlayerId: sortedIds[1] ?? null
  };
}

export function createBattleStageViewModel(
  room: RoomState,
  result: MatchResult | null,
  localPlayerId: string
): BattleStageViewModel {
  const effectiveResult = result ?? room.result ?? null;
  const resultPlayers = new Map(effectiveResult?.players.map((player) => [player.id, player]) ?? []);
  const displayPlayers = new Map(room.players.map((player) => [player.id, player]));
  for (const resultPlayer of effectiveResult?.players ?? []) {
    displayPlayers.set(resultPlayer.id, resultPlayer);
  }
  const prompt = room.prompt ?? effectiveResult?.prompt;
  const promptLength = prompt ? Array.from(prompt.typing.hiragana).length : 0;
  const { leftPlayerId, rightPlayerId } = assignBattleSides([...displayPlayers.values()], localPlayerId);
  const winnerId = effectiveResult?.players.find((player) => player.rank === 1)?.id ?? null;

  const players = [...displayPlayers.values()].map((roomPlayer): BattleStagePlayer => {
    const resultPlayer = resultPlayers.get(roomPlayer.id);
    const player = resultPlayer ?? roomPlayer;
    const side: BattleSide = player.id === rightPlayerId ? "right" : "left";

    return {
      id: player.id,
      nickname: player.nickname,
      side,
      isLocal: player.id === localPlayerId,
      isBot: player.isBot,
      connected: player.connected,
      status: getBattlePlayerStatus(player, Boolean(effectiveResult), room.status),
      progressRatio: resultPlayer?.finishStatus === "finished"
        ? 1
        : toProgressRatio(player.progressIndex, promptLength),
      mistakes: player.mistakes,
      mistakeGuards: player.mistakeGuards ?? 0,
      currentStreak: player.currentStreak,
      ...(player.hp !== undefined ? { hp: player.hp } : {}),
      ...(player.maxHp !== undefined ? { maxHp: player.maxHp } : {}),
      ...(player.finishStatus !== undefined ? { finishStatus: player.finishStatus } : {}),
      isWinner: player.id === winnerId
    };
  });

  const leftPlayer = players.find((player) => player.id === leftPlayerId) ?? null;
  const rightPlayer = players.find((player) => player.id === rightPlayerId) ?? null;

  return {
    roomCode: room.roomCode,
    mode: effectiveResult?.matchRule ?? room.matchRule,
    phase: effectiveResult || room.status === "finished" ? "result" : room.status,
    players,
    leftPlayer,
    rightPlayer,
    winnerId,
    cargoPosition: toCargoPosition(leftPlayer?.hp, leftPlayer?.maxHp, rightPlayer?.hp, rightPlayer?.maxHp)
  };
}

function getBattlePlayerStatus(
  player: PlayerState,
  hasResult: boolean,
  roomStatus: RoomState["status"]
): BattlePlayerStatus {
  if (player.forfeited || player.finishStatus === "forfeited") {
    return "forfeited";
  }

  if (player.finishStatus === "eliminated") {
    return "eliminated";
  }

  if (hasResult || player.finishStatus === "finished") {
    return "finished";
  }

  if (!player.connected) {
    return "reconnecting";
  }

  return roomStatus === "countdown" || roomStatus === "playing" ? "active" : "waiting";
}
