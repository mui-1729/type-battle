import Link from "next/link";
import { RotateCcw } from "lucide-react";
import type { MatchResult } from "@type-battle/shared";
import type { MatchRule } from "@type-battle/shared";
import { MATCH_RULE_DETAILS, getPlayerDeviceLabel } from "../_lib/ui-labels";

type ResultPanelProps = {
  result: MatchResult;
  isRoomResult: boolean;
  onRetry: () => void;
  matchRule?: MatchRule;
};

export function ResultPanel({ result, isRoomResult, onRetry, matchRule }: ResultPanelProps) {
  const title = matchRule ? `${MATCH_RULE_DETAILS[matchRule].label}の記録` : "練習の記録";

  return (
    <div className="resultPanel">
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
            <strong>{player.nickname}</strong>
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
        <button className="primaryButton" type="button" onClick={onRetry}>
          <RotateCcw size={18} />
          {isRoomResult ? "再戦する" : "もう一度練習"}
        </button>
        <Link className="secondaryButton" href="/feedback">
          不具合を報告
        </Link>
      </div>
    </div>
  );
}
