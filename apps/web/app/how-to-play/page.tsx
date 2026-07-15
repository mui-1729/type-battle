import Link from "next/link";
import { ArrowLeft, BookOpen, Keyboard, Swords } from "lucide-react";
import { SectionHeading, SurfaceCard } from "../_components/ui";

export default function HowToPlayPage() {
  return (
    <main className="appShell">
      <section className="topBar" aria-label="遊び方">
        <div className="brandBlock">
          <p className="eyebrow">TYPE BATTLE</p>
          <h1>遊び方</h1>
          <p className="topBarCopy">短く入力して、先にゴールへたどり着こう。</p>
        </div>
        <Link className="secondaryButton" href="/">
          <ArrowLeft size={18} aria-hidden="true" />
          ホームへ戻る
        </Link>
      </section>

      <section className="howToPlayGrid" aria-label="ゲームの遊び方">
        <SurfaceCard>
          <SectionHeading eyebrow="01" title="モードを選ぶ" />
          <div className="howToPlayIcon" aria-hidden="true"><Swords size={28} /></div>
          <p>対戦するならルーム作成・参加・COM戦、ひとりで遊ぶなら練習・デイリーを選びます。</p>
        </SurfaceCard>
        <SurfaceCard>
          <SectionHeading eyebrow="02" title="表示された文字を入力" />
          <div className="howToPlayIcon" aria-hidden="true"><Keyboard size={28} /></div>
          <p>日本語の課題文と、その下のローマ字を確認しながら入力します。</p>
        </SurfaceCard>
        <SurfaceCard>
          <SectionHeading eyebrow="03" title="結果を確認して再挑戦" />
          <div className="howToPlayIcon" aria-hidden="true"><BookOpen size={28} /></div>
          <p>完走後に結果と記録を確認できます。対戦は同じルームからもう一戦できます。</p>
        </SurfaceCard>
      </section>
    </main>
  );
}
