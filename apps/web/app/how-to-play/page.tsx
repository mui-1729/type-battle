"use client";

import { BookOpen, ChevronLeft, ChevronRight, Keyboard, Swords } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../_components/page-header";
import { Button, SectionHeading, SurfaceCard } from "../_components/ui";

const HOW_TO_PLAY_STEPS = [
  {
    eyebrow: "STEP 1",
    title: "モードを選択",
    description: "対戦するならルーム作成・参加・COM戦、ひとりで遊ぶなら練習・デイリーを選びます。",
    icon: Swords
  },
  {
    eyebrow: "STEP 2",
    title: "表示された文字を入力",
    description: "かな入力にもローマ字入力にも対応しています。入力ガイドと進捗を見ながら、正確に打ち進めます。",
    icon: Keyboard
  },
  {
    eyebrow: "STEP 3",
    title: "結果を確認して再挑戦",
    description: "完走後は結果画面へ切り替わります。対戦は同じルームから再戦し、練習は次の文章へ進めます。",
    icon: BookOpen
  }
] as const;

export default function HowToPlayPage() {
  const [step, setStep] = useState(0);
  const current = HOW_TO_PLAY_STEPS[step] ?? HOW_TO_PLAY_STEPS[0];
  const Icon = current.icon;

  return (
    <main className="appShell howToPlayPage">
      <PageHeader ariaLabel="遊び方" eyebrow="TYPE BATTLE" title="遊び方" description="短く入力して、先にゴールへたどり着こう。" backLabel="ホームへ戻る" />

      <section className="howToPlayGrid" aria-label="ゲームの遊び方" aria-live="polite">
        <SurfaceCard className="howToPlayCard" data-step={step + 1}>
          <div className="howToPlayCardHeader">
            <div className="howToPlayIcon" aria-hidden="true"><Icon size={30} /></div>
            <SectionHeading eyebrow={current.eyebrow} title={current.title} />
          </div>
          <p>{current.description}</p>
        </SurfaceCard>
      </section>

      <nav className="howToPlayStepNav" aria-label="遊び方のページ切り替え">
        <Button variant="secondary" type="button" onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))} disabled={step === 0}>
          <ChevronLeft size={18} /> 前へ
        </Button>
        <div className="howToPlayDots" aria-label={`${step + 1} / ${HOW_TO_PLAY_STEPS.length}`}>
          {HOW_TO_PLAY_STEPS.map((item, index) => (
            <button type="button" className={index === step ? "active" : ""} key={item.eyebrow} onClick={() => setStep(index)} aria-label={`${index + 1}ページ目`} aria-current={index === step ? "step" : undefined} />
          ))}
        </div>
        <Button variant="primary" type="button" onClick={() => setStep((currentStep) => Math.min(HOW_TO_PLAY_STEPS.length - 1, currentStep + 1))} disabled={step === HOW_TO_PLAY_STEPS.length - 1}>
          次へ <ChevronRight size={18} />
        </Button>
      </nav>
    </main>
  );
}
