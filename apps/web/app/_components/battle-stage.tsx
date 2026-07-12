"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MatchResult, RoomState } from "@type-battle/shared";
import {
  createBattleStageViewModel,
  getHpAdvantage,
  getResultAnimationTransition,
  type BattleStageViewModel
} from "../_lib/battle-stage";
import { MATCH_RULE_DETAILS } from "../_lib/ui-labels";
import { HpPushStage } from "./hp-push-stage";
import { RaceStage } from "./race-stage";

type BattleStageProps = {
  room: RoomState;
  result: MatchResult | null;
  localPlayerId: string;
  timeAttackExpired?: boolean;
};

export const BattleStage = memo(function BattleStage({
  room,
  result,
  localPlayerId,
  timeAttackExpired = false
}: BattleStageProps) {
  const view = useMemo(
    () => createBattleStageViewModel(room, result, localPlayerId),
    [localPlayerId, result, room]
  );
  const resultKey = view.phase === "result" && view.winnerId
    ? `${view.roomCode}:${view.winnerId}`
    : null;
  const previousResultKeyRef = useRef<string | null>(resultKey);
  const [animateResult, setAnimateResult] = useState(false);

  useEffect(() => {
    const transition = getResultAnimationTransition(previousResultKeyRef.current, resultKey);
    previousResultKeyRef.current = resultKey;

    if (transition === "reset") {
      setAnimateResult(false);
      return;
    }

    if (transition !== "enter") {
      return;
    }

    setAnimateResult(true);
    const timer = window.setTimeout(() => setAnimateResult(false), 900);
    return () => window.clearTimeout(timer);
  }, [resultKey]);

  const hasTimeExpired = view.mode === "timeAttack" && view.phase === "playing" && timeAttackExpired;
  const summary = getStageSummary(view, hasTimeExpired);

  return (
    <section
      className="battleStage"
      data-mode={view.mode}
      data-phase={view.phase}
      data-result-animation={animateResult ? "active" : "idle"}
      aria-label="バトルステージ"
    >
      <div className="battleStageHeader">
        <span className="battleStageMode" data-testid="battle-stage-mode">
          {MATCH_RULE_DETAILS[view.mode].label}
        </span>
        <span className="battleStageSummary">{summary}</span>
      </div>

      <div className="battleStageArena" data-testid="battle-stage-arena">
        <span className="battleStageWall battleStageWallLeft" aria-hidden="true" />
        <span className="battleStageWall battleStageWallRight" aria-hidden="true" />
        <span className="battleStageGround" aria-hidden="true" />

        {view.mode === "hpBattle" ? (
          <HpPushStage view={view} />
        ) : (
          <RaceStage view={view} timeAttackExpired={hasTimeExpired} />
        )}
      </div>

      <p className="srOnly" role="status" aria-live="polite">
        {getStageAnnouncement(view, hasTimeExpired)}
      </p>
    </section>
  );
});

function getStageSummary(view: BattleStageViewModel, timeAttackExpired = false): string {
  if (!view.rightPlayer) {
    return "対戦相手を待っています";
  }

  if (view.phase === "result") {
    const winner = view.players.find((player) => player.id === view.winnerId);
    return winner
      ? view.mode === "timeAttack"
        ? `サーバー結果: ${winner.nickname} の勝利`
        : `${winner.nickname} の勝利`
      : "結果を確認しています";
  }

  if (timeAttackExpired) {
    return "時間切れ・サーバー結果を確認中";
  }

  if (view.mode === "hpBattle" && view.phase === "playing") {
    const advantage = getHpAdvantage(
      view.leftPlayer?.hp,
      view.leftPlayer?.maxHp,
      view.rightPlayer?.hp,
      view.rightPlayer?.maxHp
    );

    if (advantage === "left") {
      return `${view.leftPlayer?.nickname ?? "左プレイヤー"} が優勢`;
    }
    if (advantage === "right") {
      return `${view.rightPlayer?.nickname ?? "右プレイヤー"} が優勢`;
    }
    return advantage === "even" ? "互角・荷物は中央" : "HP情報を確認中";
  }

  if (view.phase === "countdown") {
    return "まもなく開始";
  }

  if (view.phase === "playing") {
    return "対戦中";
  }

  return "開始を待っています";
}

function getStageAnnouncement(view: BattleStageViewModel, timeAttackExpired = false): string {
  const interruptedPlayers = view.players.filter((player) =>
    player.status === "reconnecting" || player.status === "forfeited"
  );

  if (interruptedPlayers.length > 0) {
    return interruptedPlayers
      .map((player) => `${player.nickname}は${player.status === "reconnecting" ? "再接続中" : "棄権"}です`)
      .join("。 ");
  }

  if (view.phase === "result") {
    return getStageSummary(view, timeAttackExpired);
  }

  if (timeAttackExpired) {
    return "時間切れです。サーバー結果を確認しています";
  }

  return "";
}
