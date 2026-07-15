type ProgressBlockProps = {
  progressPercent: number;
};

export function ProgressBlock({ progressPercent }: ProgressBlockProps) {
  return (
    <div className="progressBlock">
      <div className="progressLabel">
        <span>あなたの進捗</span>
        <strong>{progressPercent}%</strong>
      </div>
      <div
        className="progressTrack"
        role="progressbar"
        aria-label="Your progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
      >
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
