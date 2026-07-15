import { ChevronLeft, ChevronRight, RotateCcw, Settings, Sparkles } from "lucide-react";
import type { MatchResult, MatchRule, QuickReaction } from "@type-battle/shared";
import { QUICK_REACTIONS } from "@type-battle/shared";
import { MATCH_RULE_DETAILS, getPlayerDeviceLabel } from "../_lib/ui-labels";
import { PlayerIdentity } from "./player-identity";
import { Button, SurfaceCard } from "./ui";

type ResultPanelProps = {
  result: MatchResult;
  isRoomResult: boolean;
  onRetry: () => void;
  matchRule?: MatchRule;
  practiceMode?: "practice" | "daily";
  canRetry?: boolean;
  retryPending?: boolean;
  retryError?: string;
  localPlayerId?: string;
  accessoryIndex?: number;
  onPreviousAccessory?: () => void;
  onNextAccessory?: () => void;
  onOpenSettings?: () => void;
  onReaction?: (reaction: QuickReaction) => void;
  rematchReady?: boolean;
};

export function ResultPanel({
  result,
  isRoomResult,
  onRetry,
  matchRule,
  practiceMode = "practice",
  canRetry = true,
  retryPending = false,
  retryError = "",
  localPlayerId = "",
  accessoryIndex = 0,
  onPreviousAccessory,
  onNextAccessory,
  onOpenSettings,
  onReaction,
  rematchReady = false
}: ResultPanelProps) {
  const rule = result.matchRule ?? matchRule;
  const doubleKo = isRoomResult && result.players.length > 1 && result.players.every((player) => (player.hp ?? 1) <= 0);
  const title = isRoomResult ? (doubleKo ? "DOUBLE KO" : "試合結果") : practiceMode === "daily" ? "デイリーチャレンジの記録" : "練習の記録";
  const retryLabel = isRoomResult ? "再戦READY" : practiceMode === "daily" ? "もう一度挑戦" : "もう一度練習";
  const localResult = result.players.find((player) => player.id === localPlayerId) ?? result.players[0];

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

      <div className="resultCards" aria-label="試合結果カード">
        {result.players.map((player) => {
          const isWinner = !doubleKo && player.rank === 1;
          const isLocal = player.id === localPlayerId;
          return (
            <article className={`resultCard ${isWinner ? "isWinner" : ""}`} data-player-id={player.id} data-outcome={doubleKo ? "draw" : isWinner ? "winner" : "loser"} key={player.id}>
              {isWinner ? <span className="resultSpotlight" aria-hidden="true" /> : null}
              <div className="resultCardTopline"><span>{player.isHost ? "1P" : "2P"}</span>{isLocal ? <strong>YOU</strong> : null}</div>
              <PlayerIdentity nickname={player.nickname} kind={player.isBot ? "com" : isLocal ? "you" : player.isHost ? "one" : "two"} slot={player.isHost ? "1P" : "2P"} compact />
              <strong className="resultOutcome">{doubleKo ? "DRAW" : isWinner ? "WINNER" : player.finishStatus === "forfeited" ? "FORFEIT" : "—"}</strong>
              <div className="resultPrimaryStats">
                <ResultStat label="WPM" value={`${player.wpm}`} />
                <ResultStat label="ACC" value={`${player.accuracy}%`} />
                <ResultStat label="MISS" value={`${player.mistakes}`} />
                <ResultStat label={getModeStatLabel(rule)} value={getModeStatValue(player, rule)} />
              </div>
              {isLocal && onPreviousAccessory && onNextAccessory ? (
                <div className="resultAccessoryPicker" aria-label="アクセサリー変更">
                  <button type="button" onClick={onPreviousAccessory} aria-label="前のアクセサリー"><ChevronLeft size={17} /></button>
                  <span>ACCESSORY {accessoryIndex + 1}</span>
                  <button type="button" onClick={onNextAccessory} aria-label="次のアクセサリー"><ChevronRight size={17} /></button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <details className="resultDetails">
        <summary>詳しい結果</summary>
        <div className="resultDetailsBody">
          {result.players.map((player) => (
            <div className="resultDetailRow" key={player.id}>
              <strong>{player.nickname}</strong>
              <span>最大連続 {player.maxStreak}</span>
              <span>finish gap {player.finishGap === undefined ? "—" : `${player.finishGap}ms`}</span>
              <span>{player.accuracy === 100 && player.mistakes === 0 ? "PERFECT" : "通常記録"}</span>
              <span>獲得ポイント {getResultPoints(player)}</span>
              <span>苦手文字・主な誤入力 —</span>
              <small>端末 {getPlayerDeviceLabel(player)}</small>
            </div>
          ))}
        </div>
      </details>

      {isRoomResult && onReaction ? (
        <div className="resultReactions" aria-label="定型リアクション">
          <span><Sparkles size={15} /> REACTION</span>
          <div>{QUICK_REACTIONS.map((reaction) => <button type="button" key={reaction} onClick={() => onReaction(reaction)}>{reaction}</button>)}</div>
        </div>
      ) : null}

      <div className="resultActions">
        {isRoomResult && onOpenSettings ? <Button variant="secondary" type="button" onClick={onOpenSettings}><Settings size={17} /> 次の試合設定</Button> : null}
        {canRetry ? (
          <Button variant="primary" type="button" onClick={onRetry} disabled={retryPending} aria-busy={retryPending}>
            <RotateCcw size={18} />
            {retryPending && isRoomResult ? "READYを送信中…" : isRoomResult && rematchReady ? "READYを取り消す" : retryLabel}
          </Button>
        ) : <p className="infoText" role="status">相手の再戦READYを待っています。</p>}
        {retryError ? <p className="errorText" role="alert">{retryError}</p> : null}
      </div>
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
