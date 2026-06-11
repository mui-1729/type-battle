import { Settings } from "lucide-react";

type GameHeaderProps = {
  connected: boolean;
  realtimeConfigured: boolean;
  onOpenSettings: () => void;
};

export function GameHeader({ connected, realtimeConfigured, onOpenSettings }: GameHeaderProps) {
  return (
    <section className="topBar" aria-label="ゲーム状態">
      <div>
        <p className="eyebrow">TYPE BATTLE</p>
        <h1>オンラインタイピング対戦</h1>
      </div>
      <div className={connected ? "connection isOnline" : "connection"}>
        <span />
        {connected ? "接続中" : realtimeConfigured ? "未接続" : "Realtime 未設定"}
      </div>
      <button className="iconButton" type="button" onClick={onOpenSettings} title="設定を開く" aria-label="設定を開く">
        <Settings size={18} />
      </button>
    </section>
  );
}
