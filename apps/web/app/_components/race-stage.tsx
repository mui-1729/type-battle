import { memo } from "react";
import { StickFigure, type StickFigurePose } from "./stick-figure";
import type { BattleStagePlayer, BattleStageViewModel } from "../_lib/battle-stage";

type RaceStageProps = {
  view: BattleStageViewModel;
  timeAttackExpired: boolean;
};

export const RaceStage = memo(function RaceStage({ view, timeAttackExpired }: RaceStageProps) {
  const winner = view.players.find((player) => player.id === view.winnerId) ?? null;
  const stageState = getRaceStageState(view, timeAttackExpired);

  return (
    <div
      className="raceStageScene"
      data-stage-state={stageState}
      data-time-expired={timeAttackExpired ? "true" : "false"}
      data-result-ready={view.winnerId ? "true" : "false"}
    >
      {view.players.map((player) => {
        const ratio = player.isWinner && view.phase === "result" ? 1 : player.progressRatio;
        const outcome = view.phase === "result" && view.winnerId
          ? player.isWinner ? "winner" : "loser"
          : "neutral";

        return (
          <div className={`raceLane raceLane${player.side === "left" ? "One" : "Two"}`} data-player-id={player.id} data-outcome={outcome} key={player.id}>
            <div className="raceLaneHeader">
              <div className="raceLaneIdentity">
                <span className="raceLaneSlot">{player.side === "left" ? "1P" : "2P"}</span>
                <strong title={player.nickname}>{player.nickname}</strong>
                {player.isLocal ? <span className="raceYouBadge">YOU</span> : null}
              </div>
              <div className="raceLaneStats" aria-label={`${player.nickname} の記録`}>
                <span>ミス {player.mistakes}</span>
                <span>ミスガード {renderGuards(player.mistakeGuards)}</span>
              </div>
            </div>
            <div
              className="raceTrack"
              role="progressbar"
              aria-label={`${player.nickname} の進捗`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
            >
              <span className="raceTrackFill" style={{ width: `${ratio * 100}%` }} />
              <span className="raceTrackTicks" aria-hidden="true" />
              <span className="raceGoalTape" aria-hidden="true">GOAL!</span>
             <div
                className="raceRunner"
                data-pose={getRacePose(player, view, timeAttackExpired)}
                data-status={player.status}
                data-streak={player.currentStreak >= 5 ? "hot" : "normal"}
                style={{ left: `${Math.min(Math.max(ratio * 100, 4), 94)}%` }}
              >
               <span className="raceSpeedLines" aria-hidden="true" />
                <StickFigure side={player.side} pose={getRacePose(player, view, timeAttackExpired)} status={player.status} accessoryIndex={player.accessoryIndex} />
              </div>
            </div>
          </div>
        );
      })}
      {winner ? (
        <span className="raceWinnerCallout">{winner.nickname} GOAL!</span>
      ) : timeAttackExpired ? (
        <span className="raceWinnerCallout raceResultPendingCallout" role="status">判定待ち</span>
      ) : null}
    </div>
  );
});

function renderGuards(count: number): string {
  return count > 0 ? `${"◆".repeat(Math.min(count, 3))}${"◇".repeat(Math.max(3 - count, 0))}` : "なし";
}

function getRacePose(player: BattleStagePlayer, view: BattleStageViewModel, timeAttackExpired: boolean): StickFigurePose {
  if (player.status === "forfeited" || player.status === "eliminated") return "lose";
  if (player.status === "reconnecting") return "idle";
  if (view.phase === "result") return view.winnerId ? (player.isWinner ? "win" : "lose") : "tired";
  if (timeAttackExpired) return "tired";
  if (player.progressRatio >= 1) return "reach";
  if (view.phase === "playing") return "run";
  return view.phase === "countdown" ? "ready" : "idle";
}

function getRaceStageState(view: BattleStageViewModel, timeAttackExpired: boolean): "idle" | "running" | "goal-wait" | "time-expired" | "result-pending" | "result" {
  if (view.phase === "result") return view.winnerId ? "result" : "result-pending";
  if (timeAttackExpired) return "time-expired";
  if (view.players.some((player) => player.progressRatio >= 1)) return "goal-wait";
  return view.phase === "playing" ? "running" : "idle";
}
