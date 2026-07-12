import { memo } from "react";

type CargoObjectProps = {
  claimedBy?: "left" | "right" | null;
};

export const CargoObject = memo(function CargoObject({ claimedBy = null }: CargoObjectProps) {
  return (
    <div className="cargoObject" data-claimed-by={claimedBy ?? "none"} aria-hidden="true">
      <span className="cargoTape" />
      <span className="cargoMark">↑</span>
    </div>
  );
});
