import { memo } from "react";
import {
  BATTLE_STAGE_COORDINATES,
  clamp,
  getHpAdvantage,
  type BattleStagePlayer,
  type BattleStageViewModel,
  type HpAdvantage
} from "../_lib/battle-stage";
import { CargoObject } from "./cargo-object";
import { StagePlayer, getMoverStyle } from "./stage-player";
import type { StickFigurePose } from "./stick-figure";

type HpPushStageProps = {
  view: BattleStageViewModel;
};

const PLAYER_CARGO_GAP = 9;
const PLAYER_MIN = 11;
const PLAYER_MAX = 89;

export const HpPushStage = memo(function HpPushStage({ view }: HpPushStageProps) {
  const advantage = getHpAdvantage(
    view.leftPlayer?.hp,
    view.leftPlayer?.maxHp,
    view.rightPlayer?.hp,
    view.rightPlayer?.maxHp
  );
  const cargoPosition = view.rightPlayer ? view.cargoPosition : BATTLE_STAGE_COORDINATES.cargoCenter;
  const eliminatedPlayers = view.players.filter((player) => isConfirmedElimination(player, view));

  return (
    <div
      className="hpPushStageScene"
      data-stage-state={getHpStageState(view, eliminatedPlayers.length > 0)}
      data-hp-advantage={advantage}
      data-cargo-position={cargoPosition.toFixed(1)}
      data-result-ready={view.winnerId ? "true" : "false"}
    >
      {view.players.map((player) => {
        const position = getHpPlayerPosition(player, cargoPosition, Boolean(view.rightPlayer));
        const eliminated = eliminatedPlayers.some((candidate) => candidate.id === player.id);
        const actionLabel = getHpActionLabel(player, view, advantage, eliminated);
        const outcome = view.winnerId
          ? player.isWinner
            ? "winner"
            : "loser"
          : "neutral";

        return (
          <StagePlayer
            key={player.id}
            player={player}
            position={position}
            pose={getHpPose(player, view, eliminated)}
            outcome={outcome}
            advantage={getPlayerAdvantage(player, advantage)}
            eliminated={eliminated}
            {...(actionLabel ? { actionLabel } : {})}
          />
        );
      })}

      <div
        className="battleStageMover battleStageCargoMover hpCargoMover"
        data-position={cargoPosition.toFixed(1)}
        style={getMoverStyle(cargoPosition)}
      >
        <div className="battleStageCargoInner">
          <CargoObject />
        </div>
      </div>

      {eliminatedPlayers.map((player) => {
        const position = getHpPlayerPosition(player, cargoPosition, true);
        return (
          <div
            className="battleStageMover battleStageDefeatMover"
            data-side={player.side}
            data-player-id={player.id}
            key={`defeat-${player.id}`}
            style={getMoverStyle(position)}
            aria-hidden="true"
          >
            <div className="battleStageDefeatEffect">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        );
      })}
    </div>
  );
});

function getHpPlayerPosition(player: BattleStagePlayer, cargoPosition: number, hasOpponent: boolean): number {
  if (!hasOpponent) {
    return player.side === "left" ? BATTLE_STAGE_COORDINATES.leftStart : BATTLE_STAGE_COORDINATES.rightStart;
  }

  return clamp(
    cargoPosition + (player.side === "left" ? -PLAYER_CARGO_GAP : PLAYER_CARGO_GAP),
    PLAYER_MIN,
    PLAYER_MAX
  );
}

function isConfirmedElimination(player: BattleStagePlayer, view: BattleStageViewModel): boolean {
  if (!view.winnerId || view.phase !== "result" || player.isWinner || player.status === "forfeited") {
    return false;
  }

  if (!player.connected && player.finishStatus !== "eliminated") {
    return false;
  }

  return player.finishStatus === "eliminated" || (
    player.hp !== undefined &&
    player.hp <= 0 &&
    player.finishStatus !== "finished"
  );
}

function getHpPose(
  player: BattleStagePlayer,
  view: BattleStageViewModel,
  eliminated: boolean
): StickFigurePose {
  if (player.status === "reconnecting") {
    return "idle";
  }
  if (eliminated || player.status === "forfeited") {
    return "lose";
  }
  if (view.winnerId) {
    return player.isWinner ? "win" : "lose";
  }
  if (!view.rightPlayer || view.phase === "waiting") {
    return "idle";
  }
  return view.phase === "countdown" ? "ready" : "push";
}

function getPlayerAdvantage(
  player: BattleStagePlayer,
  advantage: HpAdvantage
): "leading" | "trailing" | "even" | "unknown" {
  if (advantage === "unknown") {
    return "unknown";
  }
  if (advantage === "even") {
    return "even";
  }
  return player.side === advantage ? "leading" : "trailing";
}

function getHpActionLabel(
  player: BattleStagePlayer,
  view: BattleStageViewModel,
  advantage: HpAdvantage,
  eliminated: boolean
): string | undefined {
  if (eliminated) {
    return "敗北";
  }
  if (view.winnerId) {
    return player.isWinner ? "勝利" : "結果確定";
  }
  if (!view.rightPlayer) {
    return undefined;
  }
  if (advantage === "unknown") {
    return "HP確認中";
  }
  if (advantage === "even") {
    return "互角";
  }
  return player.side === advantage ? "優勢" : "押し戻され中";
}

function getHpStageState(
  view: BattleStageViewModel,
  hasElimination: boolean
): "waiting" | "pushing" | "result-pending" | "result" | "elimination-result" {
  if (view.phase === "result") {
    if (!view.winnerId) {
      return "result-pending";
    }
    return hasElimination ? "elimination-result" : "result";
  }
  return view.rightPlayer && view.phase === "playing" ? "pushing" : "waiting";
}
