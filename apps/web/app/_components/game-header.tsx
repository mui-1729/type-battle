import Link from "next/link";
import { ArrowLeft, BookOpen, Settings } from "lucide-react";
import type { EquipmentSelection, RoomState } from "@type-battle/shared";
import { GameLogo } from "./game-logo";
import { StatusPill } from "./status-pill";

type GameHeaderProps = {
  connected: boolean;
  realtimeConfigured: boolean;
  onOpenSettings: () => void;
  exitAction?: { label: string; onClick: () => void } | undefined;
  status?: RoomState["status"] | "result" | undefined;
  equipment: EquipmentSelection;
};

export function GameHeader({ connected, realtimeConfigured, onOpenSettings, exitAction, status, equipment }: GameHeaderProps) {
  return (
    <section className="topBar" aria-label="ゲーム状態">
      {exitAction ? (
        <div className="headerBackSlot">
          <button className="secondaryButton headerBackButton" type="button" onClick={exitAction.onClick}>
            <ArrowLeft size={17} aria-hidden="true" />
            {exitAction.label}
          </button>
        </div>
      ) : null}
      {status ? <StatusPill status={status} /> : null}
      <div className="brandBlock">
        <GameLogo compact equipment={equipment} />
      </div>
      <Link className="headerHowTo" href="/how-to-play"><BookOpen size={22} />遊び方</Link>
      <div className="headerActions">
        <div className={connected ? "connection isOnline" : "connection"}>
          <span />
          {connected ? "接続中" : realtimeConfigured ? "未接続" : "Realtime 未設定"}
        </div>
        <button className="iconButton" type="button" onClick={onOpenSettings} title="設定を開く" aria-label="設定を開く">
          <Settings size={18} />
        </button>
      </div>
    </section>
  );
}
