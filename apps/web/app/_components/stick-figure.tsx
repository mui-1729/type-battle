import { memo } from "react";
import type { BattlePlayerStatus, BattleSide } from "../_lib/battle-stage";

export type StickFigurePose = "idle" | "ready" | "run" | "reach" | "tired" | "push" | "win" | "lose";

type StickFigureProps = {
  side: BattleSide;
  pose: StickFigurePose;
  status: BattlePlayerStatus;
  accessoryIndex?: number | undefined;
};

export const StickFigure = memo(function StickFigure({ side, pose, status, accessoryIndex = 0 }: StickFigureProps) {
  return (
    <svg
      className="stickFigure"
      data-pose={pose}
      data-side={side}
      data-status={status}
      data-accessory={accessoryIndex}
      viewBox="0 0 64 88"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="stickFigureHead" cx="32" cy="16" r="10" />
      {accessoryIndex === 1 ? <path className="stickFigureAccessory" d="M21 13h22l-3-5H24z" /> : null}
      {accessoryIndex === 2 ? <path className="stickFigureAccessory" d="M22 13h20v4H22z" /> : null}
      {accessoryIndex === 3 ? <path className="stickFigureAccessory" d="M23 14h18v4H23z" /> : null}
      {accessoryIndex === 4 ? <path className="stickFigureAccessory" d="M21 12v9M43 12v9M22 13h20" /> : null}
      {accessoryIndex === 5 ? <path className="stickFigureAccessory" d="M25 8 32 1l7 7" /> : null}
      {accessoryIndex === 6 ? <path className="stickFigureAccessory" d="m23 7 3-5 3 3 3-3 3 3 3-3 3 5z" /> : null}
      {accessoryIndex === 7 ? <path className="stickFigureAccessory" d="M20 10h24l-4-7H24z" /> : null}
      {accessoryIndex === 8 ? <ellipse className="stickFigureAccessory" cx="32" cy="4" rx="13" ry="2" /> : null}
      <path className="stickFigureFace" d="M28 16h1M35 16h1" />
      <g className="stickFigureBody">
        <path className="stickFigureTorso" d="M32 27v27" />
        <path className="stickFigureArm stickFigureArmBack" d="M32 34 16 46" />
        <path className="stickFigureArm stickFigureArmFront" d="M32 34 48 45" />
        <path className="stickFigureLeg stickFigureLegBack" d="M32 54 18 78" />
        <path className="stickFigureLeg stickFigureLegFront" d="M32 54 47 78" />
      </g>
    </svg>
  );
});
