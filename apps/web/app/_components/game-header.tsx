import Link from "next/link";
import { Settings } from "lucide-react";

type GameHeaderProps = {
  connected: boolean;
  realtimeConfigured: boolean;
  onOpenSettings: () => void;
};

export function GameHeader({ connected, realtimeConfigured, onOpenSettings }: GameHeaderProps) {
  return (
    <section className="topBar" aria-label="ゲーム状態">
      <div className="brandBlock">
        <p className="eyebrow">TYPE BATTLE</p>
        <h1>オンラインタイピング対戦</h1>
        <p className="topBarCopy">ルーム作成、練習、対戦、結果確認を 1 画面にまとめています。</p>
      </div>
      <div className="headerActions">
        <Link className="headerTextLink" href="/feedback">
          Feedback
        </Link>
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
