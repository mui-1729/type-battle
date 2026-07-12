import { memo } from "react";
import {
  BATTLE_STAGE_COORDINATES,
  toRacePosition,
  type BattleStagePlayer,
  type BattleStageViewModel
} from "../_lib/battle-stage";
import { CargoObject } from "./cargo-object";
import { StagePlayer, getMoverStyle } from "./stage-player";
import type { StickFigurePose } from "./stick-figure";

type RaceStageProps = {
  view: BattleStageViewModel;
  timeAttackExpired: boolean;
};

export const RaceStage = memo(function RaceStage({ view, timeAttackExpired }: RaceStageProps) {
  const winner = view.players.find((player) => player.id === view.winnerId) ?? null;
  const cargoPosition = winner
    ? winner.side === "left"
      ? BATTLE_STAGE_COORDINATES.cargoCenter - 3
      : BATTLE_STAGE_COORDINATES.cargoCenter + 3
    : BATTLE_STAGE_COORDINATES.cargoCenter;
  const stageState = getRaceStageState(view, timeAttackExpired);

  return (
    <div
      className="raceStageScene"
      data-stage-state={stageState}
      data-time-expired={timeAttackExpired ? "true" : "false"}
      data-result-ready={view.winnerId ? "true" : "false"}
    >
      {view.players.map((player) => {
        const outcome = view.phase === "result" && view.winnerId
          ? player.isWinner
            ? "winner"
            : "loser"
          : "neutral";
        const position = player.isWinner && view.phase === "result"
          ? toRacePosition(1, player.side)
          : toRacePosition(player.progressRatio, player.side);
        const actionLabel = getRaceActionLabel(player, view, timeAttackExpired);

        return (
          <StagePlayer
            key={player.id}
            player={player}
            position={position}
            pose={getRacePose(player, view, timeAttackExpired)}
            outcome={outcome}
            {...(actionLabel ? { actionLabel } : {})}
          />
        );
      })}

      <div
        className="battleStageMover battleStageCargoMover"
        data-position={cargoPosition.toFixed(1)}
        data-claimed-by={winner?.side ?? "none"}
        style={getMoverStyle(cargoPosition)}
      >
        <div className="battleStageCargoInner">
          <CargoObject claimedBy={winner?.side ?? null} />
        </div>
      </div>
    </div>
  );
});

function getRacePose(
  player: BattleStagePlayer,
  view: BattleStageViewModel,
  timeAttackExpired: boolean
): StickFigurePose {
  if (player.status === "forfeited" || player.status === "eliminated") {
    return "lose";
  }

  if (player.status === "reconnecting") {
    return "idle";
  }

  if (view.phase === "result") {
    return view.winnerId ? (player.isWinner ? "win" : "lose") : "tired";
  }

  if (timeAttackExpired) {
    return "tired";
  }

  if (player.progressRatio >= 1) {
    return "reach";
  }

  if (view.phase === "playing") {
    return "run";
  }

  return view.phase === "countdown" ? "ready" : "idle";
}

function getRaceActionLabel(
  player: BattleStagePlayer,
  view: BattleStageViewModel,
  timeAttackExpired: boolean
): string | undefined {
  if (view.phase === "result") {
    if (!view.winnerId) {
      return "結果を確認中";
    }
    return player.isWinner ? "荷物を獲得" : "結果確定";
  }

  if (timeAttackExpired) {
    return "判定待ち";
  }

  if (player.progressRatio >= 1) {
    return "ゴール・結果待ち";
  }

  if (view.phase === "playing") {
    return "走行中";
  }

  return undefined;
}

function getRaceStageState(
  view: BattleStageViewModel,
  timeAttackExpired: boolean
): "idle" | "running" | "goal-wait" | "time-expired" | "result-pending" | "result" {
  if (view.phase === "result") {
    return view.winnerId ? "result" : "result-pending";
  }
  if (timeAttackExpired) {
    return "time-expired";
  }
  if (view.players.some((player) => player.progressRatio >= 1)) {
    return "goal-wait";
  }
  return view.phase === "playing" ? "running" : "idle";
}
