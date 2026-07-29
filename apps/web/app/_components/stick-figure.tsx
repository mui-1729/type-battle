import { memo } from "react";
import {
  DEFAULT_EQUIPMENT,
  type HeadAccessoryId,
  type HeldItemId,
} from "@type-battle/shared";
import type { BattlePlayerStatus, BattleSide } from "../_lib/battle-stage";
import { HeadAccessorySvg, HeldItemSvg } from "./cosmetic-svg";

export type StickFigurePose =
  | "idle"
  | "ready"
  | "run"
  | "reach"
  | "tired"
  | "push"
  | "win"
  | "lose";

type StickFigureProps = {
  side: BattleSide;
  pose: StickFigurePose;
  status: BattlePlayerStatus;
  headAccessoryId?: HeadAccessoryId | undefined;
  heldItemId?: HeldItemId | undefined;
};

export const StickFigure = memo(function StickFigure({
  side,
  pose,
  status,
  headAccessoryId = DEFAULT_EQUIPMENT.headAccessoryId,
  heldItemId = DEFAULT_EQUIPMENT.heldItemId,
}: StickFigureProps) {
  return (
    <svg
      className="stickFigure"
      data-pose={pose}
      data-side={side}
      data-status={status}
      data-head-accessory={headAccessoryId}
      data-held-item={heldItemId}
      viewBox="-6 -12 82 100"
      aria-hidden="true"
      focusable="false"
    >
      <HeldItemSvg id={heldItemId} />
      <circle className="stickFigureHead" cx="32" cy="16" r="10" />
      <g className="stickFigureFace">
        <circle cx="28.5" cy="16" r="1.5" />
        <circle cx="35.5" cy="16" r="1.5" />
      </g>
      <HeadAccessorySvg id={headAccessoryId} />
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
