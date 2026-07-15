import Link from "next/link";
import { BookOpen, ChevronRight, Swords, Users } from "lucide-react";
import { SectionHeading, SurfaceCard } from "./ui";

type HomeModeMenuProps = {
  onBattle: () => void;
  onSolo: () => void;
};

export function HomeModeMenu({ onBattle, onSolo }: HomeModeMenuProps) {
  return (
    <section className="homeModeMenu" aria-labelledby="home-mode-title">
      <SectionHeading
        eyebrow="TYPE BATTLE"
        title="今日はどう遊ぶ？"
        description="入口を選ぶだけで、必要な操作だけが表示されます。"
        id="home-mode-title"
      />

      <div className="homeModeGrid">
        <SurfaceCard className="modeCard modeCardBattle">
          <button type="button" className="modeCardButton" onClick={onBattle}>
            <span className="modeCardIcon" aria-hidden="true">
              <Swords size={34} strokeWidth={2.5} />
            </span>
            <span className="modeCardContent">
              <span className="modeCardTitle">対戦する</span>
              <span className="modeCardDescription">ルームを作る、コードで参加する、COMと競う</span>
              <span className="modeCardOptions">
                <span><Users size={15} />ルーム / COM</span>
              </span>
            </span>
            <ChevronRight className="modeCardArrow" size={24} aria-hidden="true" />
          </button>
        </SurfaceCard>

        <SurfaceCard className="modeCard modeCardSolo">
          <button type="button" className="modeCardButton" onClick={onSolo}>
            <span className="modeCardIcon" aria-hidden="true">
              <span className="modeCardRunner">▶</span>
            </span>
            <span className="modeCardContent">
              <span className="modeCardTitle">ひとりで遊ぶ</span>
              <span className="modeCardDescription">練習とデイリーチャレンジで腕を磨く</span>
              <span className="modeCardOptions">
                <span>練習 / デイリー</span>
              </span>
            </span>
            <ChevronRight className="modeCardArrow" size={24} aria-hidden="true" />
          </button>
        </SurfaceCard>
      </div>

      <Link className="howToPlayLink" href="/how-to-play">
        <BookOpen size={18} aria-hidden="true" />
        遊び方を見る
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}
