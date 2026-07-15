import { RotateCcw } from "lucide-react";
import type { MatchResult } from "@type-battle/shared";
import type { MatchRule } from "@type-battle/shared";
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
  localPlayerId = ""
}: ResultPanelProps) {
  const title = isRoomResult
    ? matchRule
      ? `${MATCH_RULE_DETAILS[matchRule].label}の記録`
      : "対戦の記録"
    : practiceMode === "daily"
      ? "デイリーチャレンジの記録"
      : "練習の記録";
  const retryLabel = isRoomResult ? "再戦する" : practiceMode === "daily" ? "もう一度挑戦" : "もう一度練習";

  return (
    <SurfaceCard className="resultPanel">
      <div className="resultPanelHeader">
        <div>
          <p className="eyebrow">RESULT</p>
          <h2>{title}</h2>
        </div>
        <span className="resultPanelMeta">{result.players.length} 名</span>
      </div>
      <div className="resultRows">
        {result.players.map((player) => (
          <div className="resultRow" key={player.id}>
            <span className="resultRank">#{player.rank}</span>
            <PlayerIdentity nickname={player.nickname} kind={player.isBot ? "com" : player.id === localPlayerId ? "you" : player.isHost ? "one" : "two"} slot={player.isHost ? "1P" : "2P"} compact />
            <small>
              {player.wpm} WPM / 正確率 {player.accuracy}% / ミス {player.mistakes} / 連続正解 {player.maxStreak}
              {` / 端末 ${getPlayerDeviceLabel(player)}`}
              {player.maxHp !== undefined ? ` / HP ${player.hp ?? 0}/${player.maxHp}` : ""}
              {player.finishGap !== undefined ? ` / 差 ${player.finishGap}ms` : ""}
            </small>
          </div>
        ))}
      </div>
      <div className="resultActions">
        {canRetry ? (
          <Button
            variant="primary"
            type="button"
            onClick={onRetry}
            disabled={retryPending}
            aria-busy={retryPending}
          >
            <RotateCcw size={18} />
            {retryPending && isRoomResult ? "再戦を開始しています…" : retryLabel}
          </Button>
        ) : (
          <p className="infoText" role="status">
            ホストが再戦を開始するのを待っています。
          </p>
        )}
        {retryError ? (
          <p className="errorText" role="alert">
            {retryError}
          </p>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
