import { Coins, RotateCcw, Settings, Sparkles, X } from "lucide-react";
import { useId, useState } from "react";
import type {
  EquipmentSelection,
  HeadAccessoryId,
  HeldItemId,
  MatchResult,
  MatchRule,
  PlayerState,
  QuickReaction,
} from "@type-battle/shared";
import {
  DEFAULT_EQUIPMENT,
  HEAD_ACCESSORY_CATALOG,
  HELD_ITEM_CATALOG,
  QUICK_REACTIONS,
} from "@type-battle/shared";
import { isReactionInputDisabled, type ReactionFeedback } from "../_lib/reaction-feedback";
import { MATCH_RULE_DETAILS, getPlayerDeviceLabel } from "../_lib/ui-labels";
import { PlayerIdentity } from "./player-identity";
import { DialogOverlay } from "./dialog-overlay";
import { StickFigure } from "./stick-figure";
import { Button, SurfaceCard } from "./ui";

type ResultPanelProps = {
  result: MatchResult;
  isRoomResult: boolean;
  onRetry: () => void;
  matchRule?: MatchRule;
  practiceMode?: "practice" | "daily";
  canRetry?: boolean;
  retryDisabledReason?: string;
  retryPending?: boolean;
  retryError?: string;
  localPlayerId?: string;
  equipment?: EquipmentSelection;
  livePlayers?: readonly PlayerState[] | undefined;
  ownedHeadAccessoryIds?: readonly HeadAccessoryId[];
  ownedHeldItemIds?: readonly HeldItemId[];
  onEquipmentChange?: (equipment: EquipmentSelection) => void;
  onOpenSettings?: () => void;
  onReaction?: (reaction: QuickReaction) => void;
  reactionFeedback?: ReactionFeedback;
  remoteReaction?: { playerId: string; reaction: QuickReaction } | null;
  remoteReactionsEnabled?: boolean;
  rematchReady?: boolean;
  onPracticeNext?: (() => void) | undefined;
  onPracticeMenu?: (() => void) | undefined;
  onExit?: (() => void) | undefined;
  exitLabel?: string | undefined;
  coinReward?: {
    completion: number;
    victory: number;
    highAccuracy: number;
    perfect: number;
    total: number;
  } | null;
  styleCoinBalance?: number;
};

export function ResultPanel({
  result,
  isRoomResult,
  onRetry,
  matchRule,
  practiceMode = "practice",
  canRetry = true,
  retryDisabledReason = "",
  retryPending = false,
  retryError = "",
  localPlayerId = "",
  equipment = DEFAULT_EQUIPMENT,
  livePlayers,
  ownedHeadAccessoryIds,
  ownedHeldItemIds,
  onEquipmentChange,
  onOpenSettings,
  onReaction,
  reactionFeedback,
  remoteReaction = null,
  remoteReactionsEnabled = true,
  rematchReady = false,
  onPracticeNext,
  onPracticeMenu,
  onExit,
  exitLabel = "ホームへ戻る",
  coinReward = null,
  styleCoinBalance = 0,
}: ResultPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTitleId = useId();
  const retryStatusId = useId();
  const rule = result.matchRule ?? matchRule;
  const doubleKo = isRoomResult && result.players.length > 1 && result.players.every((player) => (player.hp ?? 1) <= 0);
  const title = isRoomResult ? (doubleKo ? "DOUBLE KO" : "試合結果") : practiceMode === "daily" ? "デイリーチャレンジの記録" : "練習の記録";
  const retryLabel = isRoomResult ? "再戦READY" : practiceMode === "daily" ? "もう一度挑戦" : "もう一度練習";
  const localResult = result.players.find((player) => player.id === localPlayerId) ?? result.players[0];
  const remoteReactionPlayer = remoteReaction
    ? result.players.find((player) => player.id === remoteReaction.playerId) ?? null
    : null;
  const reactionInputDisabled = reactionFeedback ? isReactionInputDisabled(reactionFeedback) : false;

  return (
    <SurfaceCard className={`resultPanel ${doubleKo ? "resultPanelDraw" : ""}`} data-result-outcome={doubleKo ? "double-ko" : localResult?.rank === 1 ? "win" : "loss"}>
      <div className="resultPanelHeader">
        <div>
          <p className="eyebrow">RESULT</p>
          <h2>{title}</h2>
          {rule ? <span className="resultRuleLabel">{MATCH_RULE_DETAILS[rule].label}</span> : null}
        </div>
        <span className="resultPanelMeta">{doubleKo ? "引き分け" : `${result.players.length} 名`}</span>
      </div>

      <div className="resultActions">
        {!isRoomResult && onPracticeMenu ? (
          <div className="practiceResultActions">
            {onPracticeNext ? <Button variant="secondary" type="button" onClick={onPracticeNext}>次の文章</Button> : null}
            <Button variant="secondary" type="button" onClick={onPracticeMenu}>ひとり用メニューへ</Button>
          </div>
        ) : null}
        {isRoomResult && onOpenSettings ? <Button variant="secondary" type="button" onClick={onOpenSettings}><Settings size={17} /> 次の試合設定</Button> : null}
        {onExit ? <Button variant="secondary" type="button" onClick={onExit}>{exitLabel}</Button> : null}
        {canRetry || retryDisabledReason ? (
          <>
            <Button
              variant="primary"
              type="button"
              onClick={onRetry}
              disabled={retryPending || Boolean(retryDisabledReason)}
              aria-busy={retryPending}
              aria-describedby={retryDisabledReason ? retryStatusId : undefined}
            >
              <RotateCcw size={18} />
              {retryPending && isRoomResult ? "READYを送信中…" : isRoomResult && rematchReady ? "READYを取り消す" : retryLabel}
            </Button>
            {retryDisabledReason ? <p className="infoText" id={retryStatusId} role="status">{retryDisabledReason}</p> : null}
          </>
        ) : <p className="infoText" role="status">相手の再戦READYを待っています。</p>}
        {retryError ? <p className="errorText" role="alert">{retryError}</p> : null}
      </div>

      <div className="resultCards" aria-label="試合結果カード">
        {result.players.map((player) => {
          const isWinner = !doubleKo && player.rank === 1;
          const isLocal = player.id === localPlayerId;
          const livePlayer = livePlayers?.find((entry) => entry.id === player.id);
          return (
            <article className={`resultCard ${isWinner ? "isWinner" : ""}`} data-player-id={player.id} data-outcome={doubleKo ? "draw" : isWinner ? "winner" : "loser"} key={player.id}>
              {isWinner ? <span className="resultSpotlight" aria-hidden="true" /> : null}
              {isLocal && reactionFeedback?.reaction ? (
                <span className="resultReactionBubble" aria-hidden="true">{reactionFeedback.reaction}</span>
              ) : remoteReaction?.playerId === player.id ? (
                <span className="resultReactionBubble" aria-hidden="true">{remoteReaction.reaction}</span>
              ) : null}
              <div className="resultCardTopline"><span>{player.isHost ? "1P" : "2P"}</span>{isLocal ? <strong>YOU</strong> : null}</div>
              <PlayerIdentity nickname={player.nickname} kind={player.isBot ? "com" : isLocal ? "you" : player.isHost ? "one" : "two"} slot={player.isHost ? "1P" : "2P"} compact />
              <div className="resultFigure" aria-hidden="true">
                <StickFigure
                  side={player.isHost ? "left" : "right"}
                  pose={isWinner ? "win" : "lose"}
                  status="finished"
                  headAccessoryId={isLocal ? equipment.headAccessoryId : livePlayer?.headAccessoryId ?? player.headAccessoryId}
                  heldItemId={isLocal ? equipment.heldItemId : livePlayer?.heldItemId ?? player.heldItemId}
                />
              </div>
              <strong className="resultOutcome">{doubleKo ? "DRAW" : isWinner ? "WINNER" : player.finishStatus === "forfeited" ? "FORFEIT" : "—"}</strong>
              <div className="resultPrimaryStats">
                <ResultStat label="WPM" value={`${player.wpm}`} />
                <ResultStat label="ACC" value={`${player.accuracy}%`} />
                <ResultStat label="MISS" value={`${player.mistakes}`} />
                <ResultStat label={getModeStatLabel(rule)} value={getModeStatValue(player, rule)} />
              </div>
              {isLocal && onEquipmentChange && ownedHeadAccessoryIds && ownedHeldItemIds ? (
                <div className="resultAccessoryPicker quickEquipmentPicker" aria-label="装備変更">
                  <label>
                    <span>頭</span>
                    <select
                      aria-label="結果画面の頭装備"
                      value={equipment.headAccessoryId}
                      onChange={(event) => onEquipmentChange({
                        ...equipment,
                        headAccessoryId: event.target.value as HeadAccessoryId,
                      })}
                    >
                      {HEAD_ACCESSORY_CATALOG.filter(({ id }) => ownedHeadAccessoryIds.includes(id)).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>手持ち</span>
                    <select
                      aria-label="結果画面の手持ち装備"
                      value={equipment.heldItemId}
                      onChange={(event) => onEquipmentChange({
                        ...equipment,
                        heldItemId: event.target.value as HeldItemId,
                      })}
                    >
                      {HELD_ITEM_CATALOG.filter(({ id }) => ownedHeldItemIds.includes(id)).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {coinReward ? (
        <section className="styleCoinReward" aria-label="獲得スタイルコイン" aria-live="polite">
          <div>
            <Coins size={22} />
            <span>獲得スタイルコイン</span>
            <strong>+{coinReward.total} SC</strong>
          </div>
          <ul>
            <li><span>完了</span><strong>+{coinReward.completion}</strong></li>
            {coinReward.victory > 0 ? <li><span>勝利</span><strong>+{coinReward.victory}</strong></li> : null}
            {coinReward.highAccuracy > 0 ? <li><span>正確率95%以上</span><strong>+{coinReward.highAccuracy}</strong></li> : null}
            {coinReward.perfect > 0 ? <li><span>ノーミス</span><strong>+{coinReward.perfect}</strong></li> : null}
          </ul>
          <p>所持コイン <strong>{styleCoinBalance} SC</strong></p>
        </section>
      ) : null}

      <Button className="resultDetailsButton" variant="secondary" type="button" onClick={() => setDetailsOpen(true)}>
        詳しい結果
      </Button>

      {detailsOpen ? (
        <DialogOverlay className="resultDetailsModal" titleId={detailsTitleId} onClose={() => setDetailsOpen(false)}>
          <div className="modalHeader">
            <div>
              <p className="eyebrow">RESULT DETAILS</p>
              <h2 id={detailsTitleId}>詳しい結果</h2>
            </div>
            <button className="iconButton" type="button" onClick={() => setDetailsOpen(false)} aria-label="詳しい結果を閉じる">
              <X size={20} />
            </button>
          </div>
          <div className="resultDetailsBody">
            {result.players.map((player) => (
              <div className="resultDetailRow" key={player.id}>
                <strong>{player.nickname}</strong>
                <span>最大連続 {player.maxStreak}</span>
                <span>finish gap {player.finishGap === undefined ? "—" : `${player.finishGap}ms`}</span>
                <span>{player.totalTypedCharacters > 0 && player.accuracy === 100 && player.mistakes === 0 ? "PERFECT" : "通常記録"}</span>
                <span>スコア {getResultPoints(player)}</span>
                <span>苦手文字・主な誤入力 —</span>
                <small>端末 {getPlayerDeviceLabel(player)}</small>
              </div>
            ))}
          </div>
          <div className="modalActions">
            <Button variant="primary" type="button" onClick={() => setDetailsOpen(false)}>閉じる</Button>
          </div>
        </DialogOverlay>
      ) : null}

      {isRoomResult && onReaction ? (
        <div className="resultReactions" aria-label="定型リアクション">
          <span><Sparkles size={15} /> REACTION</span>
          <div>{QUICK_REACTIONS.map((reaction) => (
            <button
              type="button"
              key={reaction}
              onClick={() => onReaction(reaction)}
              aria-pressed={reactionFeedback?.reaction === reaction}
              aria-busy={reactionFeedback?.phase === "sending"}
              disabled={reactionInputDisabled}
            >
              {reaction}
            </button>
          ))}</div>
          {reactionFeedback?.phase === "error" ? (
            <p className="resultReactionStatus errorText" role="alert">{reactionFeedback.message}</p>
          ) : (
            <p className="resultReactionStatus" role="status" aria-live="polite">
              {reactionFeedback?.message || (remoteReactionsEnabled
                ? "3秒に1回送信できます。"
                : "相手のリアクションは非表示です。自分からは送信できます。")}
            </p>
          )}
          {remoteReaction && remoteReaction.playerId !== localPlayerId ? (
            <p className="resultRemoteReaction" role="status" aria-live="polite">
              {remoteReactionPlayer?.nickname ?? "相手"}: 「{remoteReaction.reaction}」
            </p>
          ) : null}
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return <div className="resultStat"><span>{label}</span><strong>{value}</strong></div>;
}

function getModeStatLabel(rule: MatchRule | undefined): string {
  if (rule === "race") return "TIME";
  if (rule === "timeAttack") return "CHARS";
  if (rule === "hpBattle") return "HP";
  return "STREAK";
}

function getModeStatValue(player: MatchResult["players"][number], rule: MatchRule | undefined): string {
  if (rule === "race") return player.finishTimeMs === undefined ? "—" : `${player.finishTimeMs}ms`;
  if (rule === "timeAttack") return `${player.totalTypedCharacters}`;
  if (rule === "hpBattle") return `${player.hp ?? 0}/${player.maxHp ?? 0}`;
  return `${player.maxStreak}`;
}

function getResultPoints(player: MatchResult["players"][number]): number {
  return Math.max(0, Math.round(player.wpm * 10 + player.accuracy + player.maxStreak - player.mistakes * 2));
}
