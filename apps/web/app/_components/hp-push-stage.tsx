import { memo } from "react";
import { getHpAdvantage, toHpRatio, type BattleStagePlayer, type BattleStageViewModel, type HpAdvantage } from "../_lib/battle-stage";
import { StickFigure, type StickFigurePose } from "./stick-figure";

type HpPushStageProps = { view: BattleStageViewModel; suddenDeath?: boolean };

export const HpPushStage = memo(function HpPushStage({ view, suddenDeath = false }: HpPushStageProps) {
  const advantage = getHpAdvantage(view.leftPlayer?.hp, view.leftPlayer?.maxHp, view.rightPlayer?.hp, view.rightPlayer?.maxHp);
 const eliminatedPlayers = view.players.filter((player) => isConfirmedElimination(player, view));
 const winner = view.players.find((player) => player.id === view.winnerId) ?? null;
  const doubleKo = view.phase === "result" && view.players.length > 1 && view.players.every((player) => (player.hp ?? 1) <= 0);

  return (
    <div className="hpPushStageScene hpBattleStageScene" data-stage-state={getHpStageState(view, eliminatedPlayers.length > 0)} data-hp-advantage={advantage} data-cargo-position={view.cargoPosition.toFixed(1)} data-result-ready={view.winnerId ? "true" : "false"} data-sudden-death={suddenDeath ? "true" : "false"}>
      <div className="hpBattleArena">
        {view.leftPlayer ? <HpBattlePlayerCard player={view.leftPlayer} view={view} advantage={advantage} eliminated={eliminatedPlayers.some((candidate) => candidate.id === view.leftPlayer?.id)} /> : null}
        <div className="hpBattleCenter" aria-hidden="true">
          <span className="hpBattleVs">VS</span>
          {view.phase === "playing" ? <span className="hpBattleRoundMark">ATTACK</span> : null}
        </div>
        {view.rightPlayer ? <HpBattlePlayerCard player={view.rightPlayer} view={view} advantage={advantage} eliminated={eliminatedPlayers.some((candidate) => candidate.id === view.rightPlayer?.id)} /> : <div className="hpBattleEmptyOpponent">対戦相手を待っています</div>}
      </div>
      {doubleKo ? <div className="hpKoOverlay" role="status"><strong>DOUBLE KO</strong><span>両者同時KO</span></div> : winner ? <div className="hpKoOverlay" role="status"><strong>KO!</strong><span>{winner.nickname} の勝利</span></div> : view.phase === "result" ? <div className="hpKoOverlay hpKoPending" role="status"><strong>判定待ち</strong></div> : null}
    </div>
  );
});

type HpBattlePlayerCardProps = { player: BattleStagePlayer; view: BattleStageViewModel; advantage: HpAdvantage; eliminated: boolean };

function HpBattlePlayerCard({ player, view, advantage, eliminated }: HpBattlePlayerCardProps) {
  const hpRatio = toHpRatio(player.hp, player.maxHp) ?? 0;
  const actionLabel = getHpActionLabel(player, view, advantage, eliminated);
  return (
    <article className={`hpBattlePlayer hpBattlePlayer${player.side === "left" ? "Left" : "Right"}`} data-side={player.side} data-player-id={player.id} data-status={player.status} data-hp={player.hp ?? 0} data-max-hp={player.maxHp ?? 0} data-advantage={player.side === advantage ? "leading" : advantage === "even" ? "even" : "trailing"} data-impact={getDamageLevel(player, eliminated)} data-attack-style={getAttackStyle(player.accessoryIndex)}>
      <header className="hpBattlePlayerHeader">
        <div className="hpBattleIdentity"><span className="hpBattleSlot">{player.side === "left" ? "1P" : "2P"}</span><strong title={player.nickname}>{player.nickname}</strong>{player.isLocal ? <span className="raceYouBadge">YOU</span> : null}</div>
        <span className="hpBattleAction">{actionLabel}</span>
      </header>
      <div className="hpBattleHpRow">
        <div className="hpBattleHpBar" role="progressbar" aria-label={`${player.nickname} のHP`} aria-valuemin={0} aria-valuemax={player.maxHp ?? 0} aria-valuenow={player.hp ?? 0}><span className="hpBattleHpFill" style={{ width: `${hpRatio * 100}%` }} /></div>
        <strong className="hpBattleHpValue">{player.hp ?? 0}</strong>
      </div>
      <div className="hpBattleMeta"><span>ミス {player.mistakes}</span><span className="hpBattleGuards" aria-label={`ミスガード ${player.mistakeGuards}個`}>ガード {renderGuards(player.mistakeGuards)}</span></div>
      <div className="hpBattleFigure" data-pose={getHpPose(player, view, eliminated)}>
        <span className="hpBattleAttackBurst" data-attack={player.currentStreak > 0 ? "active" : "idle"} key={`${player.id}-${player.progressRatio}-${player.mistakes}`} aria-hidden="true"><span /><span /><span /></span>
        <StickFigure side={player.side} pose={getHpPose(player, view, eliminated)} status={player.status} />
      </div>
    </article>
  );
}

function renderGuards(count: number): string {
  return count > 0 ? `${"◆".repeat(Math.min(count, 3))}${"◇".repeat(Math.max(3 - count, 0))}` : "なし";
}

function getDamageLevel(player: BattleStagePlayer, eliminated: boolean): "none" | "small" | "medium" | "large" {
  if (eliminated) return "large";
  if (player.status === "forfeited" || player.status === "reconnecting") return "none";
  return player.currentStreak === 0 && player.mistakes > 0 ? "small" : "none";
}

function getAttackStyle(accessoryIndex = 0): "punch" | "cap" | "spirit" | "beam" {
  return ["punch", "cap", "spirit", "beam"][accessoryIndex % 4] as "punch" | "cap" | "spirit" | "beam";
}

function getHpPose(player: BattleStagePlayer, view: BattleStageViewModel, eliminated: boolean): StickFigurePose {
  if (player.status === "reconnecting") return "idle";
  if (eliminated || player.status === "forfeited") return "lose";
  if (view.winnerId) return player.isWinner ? "win" : "lose";
  if (!view.rightPlayer || view.phase === "waiting") return "idle";
  return view.phase === "countdown" ? "ready" : "push";
}

function getHpActionLabel(player: BattleStagePlayer, view: BattleStageViewModel, advantage: HpAdvantage, eliminated: boolean): string {
  if (eliminated || player.status === "eliminated") return "KO";
  if (player.status === "forfeited") return "棄権";
  if (player.status === "reconnecting") return "再接続中";
  if (view.winnerId) return player.isWinner ? "勝利" : "敗北";
  if (advantage === "unknown") return "HP確認中";
  if (advantage === "even") return "互角";
  return player.side === advantage ? "優勢" : "劣勢";
}

function isConfirmedElimination(player: BattleStagePlayer, view: BattleStageViewModel): boolean {
  if (!view.winnerId || view.phase !== "result" || player.isWinner || player.status === "forfeited") return false;
  if (!player.connected && player.finishStatus !== "eliminated") return false;
  return player.finishStatus === "eliminated" || (player.hp !== undefined && player.hp <= 0 && player.finishStatus !== "finished");
}

function getHpStageState(view: BattleStageViewModel, hasElimination: boolean): "waiting" | "pushing" | "result-pending" | "result" | "elimination-result" {
  if (view.phase === "result") {
    if (!view.winnerId) return "result-pending";
    return hasElimination ? "elimination-result" : "result";
  }
  return view.rightPlayer && view.phase === "playing" ? "pushing" : "waiting";
}
