import Link from "next/link";
import { BookOpen, ChevronRight, Swords } from "lucide-react";
import { GameLogo } from "./game-logo";
import { StickFigure } from "./stick-figure";

type HomeModeMenuProps = {
  onBattle: () => void;
  onSolo: () => void;
};

export function HomeModeMenu({ onBattle, onSolo }: HomeModeMenuProps) {
  return (
    <section className="homeModeMenu" aria-labelledby="home-mode-title">
      <h1 className="srOnly" id="home-mode-title">遊ぶモードを選択</h1>
      <GameLogo />

      <div className="homeModeGrid">
        <div className="modeCard modeCardBattle">
          <button type="button" className="modeCardButton" onClick={onBattle}>
            <span className="modeCardScene battleModeScene" aria-hidden="true">
              <span className="modeRunner modeRunnerBlue"><StickFigure side="left" pose="run" status="active" /></span>
              <Swords className="modeCrossedSwords" size={54} strokeWidth={3} />
              <span className="modeRunner modeRunnerRed"><StickFigure side="right" pose="run" status="active" /></span>
            </span>
            <span className="modeCardContent">
              <span className="modeCardTitle">対戦する</span>
              <span className="modeCardDescription">友達や世界中のプレイヤーと対戦</span>
            </span>
            <ChevronRight className="modeCardArrow" size={24} aria-hidden="true" />
          </button>
        </div>

        <div className="modeCard modeCardSolo">
          <button type="button" className="modeCardButton" onClick={onSolo}>
            <span className="modeCardScene soloModeScene" aria-hidden="true">
              <span className="soloSpeedLine soloSpeedLineOne" />
              <span className="soloSpeedLine soloSpeedLineTwo" />
              <span className="soloSpeedLine soloSpeedLineThree" />
              <span className="modeRunner modeRunnerGreen"><StickFigure side="left" pose="run" status="active" /></span>
            </span>
            <span className="modeCardContent">
              <span className="modeCardTitle">ひとりで遊ぶ</span>
              <span className="modeCardDescription">練習・デイリーチャレンジ</span>
            </span>
            <ChevronRight className="modeCardArrow" size={24} aria-hidden="true" />
          </button>
        </div>
      </div>

      <Link className="howToPlayLink" href="/how-to-play">
        <BookOpen size={18} aria-hidden="true" />
        遊び方を見る
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
      <p className="homeNicknameNote">ⓘ ニックネーム未設定でも、対戦前に設定できます。</p>
    </section>
  );
}
