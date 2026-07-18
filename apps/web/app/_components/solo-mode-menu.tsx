import { CalendarDays, ChartNoAxesColumn, ChevronRight, Keyboard } from "lucide-react";

type SoloModeMenuProps = {
  onPractice: () => void;
  onDaily: () => void;
  onMistakes: () => void;
};

const SOLO_MODES = [
  {
    key: "practice",
    eyebrow: "PRACTICE",
    title: "練習する",
    description: "文章の長さを選んで、自分のペースで練習",
    icon: Keyboard
  },
  {
    key: "daily",
    eyebrow: "DAILY",
    title: "今日のチャレンジ",
    description: "1日5回の課題でベスト記録に挑戦",
    icon: CalendarDays
  },
  {
    key: "mistakes",
    eyebrow: "ANALYSIS",
    title: "ミス詳細",
    description: "苦手な文字と、よくある誤入力を確認",
    icon: ChartNoAxesColumn
  }
] as const;

export function SoloModeMenu({ onPractice, onDaily, onMistakes }: SoloModeMenuProps) {
  const actions = { practice: onPractice, daily: onDaily, mistakes: onMistakes };

  return (
    <section className="soloModePicker" aria-labelledby="solo-mode-picker-title">
      <div className="soloModePickerHeading">
        <p className="eyebrow">SOLO PLAY</p>
        <h2 id="solo-mode-picker-title">ひとりで遊ぶ</h2>
        <p>遊び方を選ぶと、それぞれの専用画面へ進みます。</p>
      </div>
      <div className="soloModePickerGrid">
        {SOLO_MODES.map(({ key, eyebrow, title, description, icon: Icon }) => (
          <button className={`soloModeOption soloModeOption-${key}`} type="button" key={key} onClick={actions[key]}>
            <span className="soloModeOptionIcon" aria-hidden="true"><Icon size={32} /></span>
            <span className="soloModeOptionCopy">
              <small>{eyebrow}</small>
              <strong>{title}</strong>
              <span>{description}</span>
            </span>
            <ChevronRight className="soloModeOptionArrow" size={24} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
