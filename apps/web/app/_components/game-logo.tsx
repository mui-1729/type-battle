import type { EquipmentSelection } from "@type-battle/shared";
import { StickFigure } from "./stick-figure";

type GameLogoProps = {
  compact?: boolean;
  subtitle?: string;
  equipment?: EquipmentSelection;
};

export function GameLogo({ compact = false, subtitle, equipment }: GameLogoProps) {
  return (
    <div className={compact ? "gameLogo isCompact" : "gameLogo"} aria-label="TYPE BATTLE">
      <div className="gameLogoWordmark">
        <span>TYPE BATTLE</span>
        <StickFigure
          side="right"
          pose="run"
          status="active"
          headAccessoryId={equipment?.headAccessoryId}
          heldItemId={equipment?.heldItemId}
        />
      </div>
      {subtitle ? <strong className="gameLogoSubtitle">{subtitle}</strong> : null}
    </div>
  );
}
