import { StickFigure } from "./stick-figure";

type GameLogoProps = {
  compact?: boolean;
  subtitle?: string;
};

export function GameLogo({ compact = false, subtitle }: GameLogoProps) {
  return (
    <div className={compact ? "gameLogo isCompact" : "gameLogo"} aria-label="TYPE BATTLE">
      <div className="gameLogoWordmark">
        <span>TYPE BATTLE</span>
        <StickFigure side="right" pose="run" status="active" />
      </div>
      {subtitle ? <strong className="gameLogoSubtitle">{subtitle}</strong> : null}
    </div>
  );
}
