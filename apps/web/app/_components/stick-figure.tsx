import { memo } from "react";
import type { BattlePlayerStatus, BattleSide } from "../_lib/battle-stage";

export type StickFigurePose = "idle" | "ready" | "run" | "reach" | "tired" | "push" | "win" | "lose";

type StickFigureProps = {
  side: BattleSide;
  pose: StickFigurePose;
  status: BattlePlayerStatus;
};

export const StickFigure = memo(function StickFigure({ side, pose, status }: StickFigureProps) {
  return (
    <svg
      className="stickFigure"
      data-pose={pose}
      data-side={side}
      data-status={status}
      viewBox="0 0 64 88"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="stickFigureHead" cx="32" cy="16" r="10" />
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
