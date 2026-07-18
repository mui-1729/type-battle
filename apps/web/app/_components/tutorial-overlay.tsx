import { ArrowRight, X } from "lucide-react";
import { DialogOverlay } from "./dialog-overlay";

type TutorialOverlayProps = {
  step: number;
  onNext: () => void;
  onClose: () => void;
};

const TUTORIAL_STEPS = [
  ["モードを選ぼう", "対戦、練習、デイリーチャレンジから遊び方を選べます。"],
  ["表示された文字を入力", "課題文の下に表示されるローマ字を入力します。対戦では先着またはHPを競います。"],
  ["結果を確認して再戦", "結果画面で記録とアクセサリーを確認し、もう一度挑戦できます。"]
] as const;

export function TutorialOverlay({ step, onNext, onClose }: TutorialOverlayProps) {
  const [title, description] = TUTORIAL_STEPS[step] ?? TUTORIAL_STEPS[0];
  const isLast = step === TUTORIAL_STEPS.length - 1;

  return (
    <DialogOverlay className="tutorialCard" titleId="tutorial-title" onClose={onClose}>
        <button className="iconButton tutorialClose" type="button" onClick={onClose} aria-label="遊び方を閉じる"><X size={20} /></button>
        <p className="eyebrow">HOW TO PLAY · {step + 1}/3</p>
        <h2 id="tutorial-title">{title}</h2>
        <p>{description}</p>
        <div className="tutorialDots" aria-label={`${step + 1}ページ目`}>
          {TUTORIAL_STEPS.map((_, index) => <span className={index === step ? "active" : ""} key={index} />)}
        </div>
        <button className="primaryButton" type="button" onClick={onNext}>{isLast ? "はじめる" : "次へ"} <ArrowRight size={18} /></button>
    </DialogOverlay>
  );
}
