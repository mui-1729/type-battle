import type { RoomState } from "@type-battle/shared";
import { STATUS_LABELS } from "../_lib/ui-labels";

type StatusPillProps = {
  status: RoomState["status"] | "result";
};

export function StatusPill({ status }: StatusPillProps) {
  return <div className={`statusPill status-${status}`}>{STATUS_LABELS[status]}</div>;
}
