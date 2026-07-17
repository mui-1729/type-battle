import type { CSSProperties } from "react";
import type { BattleStagePlayer } from "../_lib/battle-stage";
import { StickFigure, type StickFigurePose } from "./stick-figure";

type StagePlayerProps = {
  player: BattleStagePlayer;
  position: number;
  pose: StickFigurePose;
  outcome?: "neutral" | "winner" | "loser";
  advantage?: "leading" | "trailing" | "even" | "unknown";
  eliminated?: boolean;
  actionLabel?: string;
};

type StageMoverStyle = CSSProperties & {
  "--stage-offset": string;
};

export function StagePlayer({
  player,
  position,
  pose,
  outcome = "neutral",
  advantage = "even",
  eliminated = false,
  actionLabel
}: StagePlayerProps) {
  return (
    <div
      className="battleStageMover battleStagePlayerMover"
      data-player-id={player.id}
      data-side={player.side}
      data-position={position.toFixed(1)}
      data-progress={player.progressRatio.toFixed(3)}
      data-outcome={outcome}
      data-advantage={advantage}
      data-eliminated={eliminated ? "true" : "false"}
      data-player-status={player.status}
      style={getMoverStyle(position)}
    >
      <div className="battleStagePlayerInner">
        <div className="battleStagePlayerLabel">
          <strong title={player.nickname}>{player.nickname}</strong>
          <span>{getPlayerSupplement(player, actionLabel)}</span>
        </div>
        <StickFigure side={player.side} pose={pose} status={player.status} accessoryIndex={player.accessoryIndex} />
      </div>
    </div>
  );
}

export function getMoverStyle(position: number): StageMoverStyle {
  return { "--stage-offset": `${position - 50}%` };
}

function getPlayerSupplement(player: BattleStagePlayer, actionLabel?: string): string {
  if (player.status === "reconnecting") {
    return "再接続中";
  }
  if (player.status === "forfeited") {
    return "棄権";
  }
  if (player.status === "eliminated") {
    return "敗北";
  }

  const identity = player.isBot ? "COM" : player.isLocal ? "あなた" : player.side === "left" ? "左" : "右";
  return actionLabel ? `${identity}・${actionLabel}` : identity;
}
