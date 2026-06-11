import Link from "next/link";
import { RotateCcw } from "lucide-react";
import type { MatchResult } from "@type-battle/shared";

type ResultPanelProps = {
  result: MatchResult;
  isRoomResult: boolean;
  onRetry: () => void;
};

export function ResultPanel({ result, isRoomResult, onRetry }: ResultPanelProps) {
  return (
    <div className="resultPanel">
      <div className="resultRows">
        {result.players.map((player) => (
          <div className="resultRow" key={player.id}>
            <span>#{player.rank}</span>
            <strong>{player.nickname}</strong>
            <small>
              {player.wpm} WPM / 正確率 {player.accuracy}% / ミス {player.mistakes} / 連続正解 {player.maxStreak}
              {player.maxHp !== undefined ? ` / HP ${player.hp ?? 0}/${player.maxHp}` : ""}
              {player.finishGap !== undefined ? ` / 差 ${player.finishGap}ms` : ""}
            </small>
          </div>
        ))}
      </div>
      <button className="primaryButton" type="button" onClick={onRetry}>
        <RotateCcw size={18} />
        {isRoomResult ? "再戦する" : "もう一度練習"}
      </button>
      <Link className="secondaryButton" href="/feedback">
        不具合を報告
      </Link>
    </div>
  );
}
