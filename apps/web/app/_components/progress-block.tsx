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
      <div className="progressTrack">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
