import Link from "next/link";
import { BookOpen, LogOut, Settings } from "lucide-react";
import { GameLogo } from "./game-logo";

type GameHeaderProps = {
  connected: boolean;
  realtimeConfigured: boolean;
  onOpenSettings: () => void;
  exitAction?: { label: string; onClick: () => void } | undefined;
};

export function GameHeader({ connected, realtimeConfigured, onOpenSettings, exitAction }: GameHeaderProps) {
  return (
    <section className="topBar" aria-label="ゲーム状態">
      <div className="brandBlock">
        <GameLogo compact />
      </div>
      <Link className="headerHowTo" href="/how-to-play"><BookOpen size={22} />遊び方</Link>
      <div className="headerActions">
        <div className={connected ? "connection isOnline" : "connection"}>
          <span />
          {connected ? "接続中" : realtimeConfigured ? "未接続" : "Realtime 未設定"}
        </div>
        {exitAction ? (
          <button className="secondaryButton headerExitButton" type="button" onClick={exitAction.onClick}>
            <LogOut size={17} aria-hidden="true" />
            {exitAction.label}
          </button>
        ) : null}
        <button className="iconButton" type="button" onClick={onOpenSettings} title="設定を開く" aria-label="設定を開く">
          <Settings size={18} />
        </button>
      </div>
    </section>
  );
}
