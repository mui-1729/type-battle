import { StickFigure } from "./stick-figure";

type PracticeStageProps = {
  progressPercent: number;
  mode: "practice" | "daily";
};

export function PracticeStage({ progressPercent, mode }: PracticeStageProps) {
  const runnerPosition = Math.min(Math.max(progressPercent, 8), 92);

  return (
    <section className="practiceStage" aria-label={mode === "daily" ? "デイリーチャレンジ進捗" : "練習進捗"}>
      <span className="practiceStartFlag" aria-hidden="true">◆</span>
      <div className="practiceRunner" style={{ left: `${runnerPosition}%` }}>
        <span className="practiceSpeedLines" aria-hidden="true" />
        <StickFigure side="left" pose="run" status="active" />
      </div>
      <span className="practiceGoalFlag" aria-hidden="true">★</span>
      <div className="practiceTrack" role="progressbar" aria-label="練習の進捗" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </section>
  );
}
