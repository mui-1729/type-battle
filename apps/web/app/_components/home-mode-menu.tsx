import Link from "next/link";
import { BookOpen, ChevronRight, Coins, ShoppingBag, Sparkles, Swords } from "lucide-react";
import type { EquipmentSelection } from "@type-battle/shared";
import { GameLogo } from "./game-logo";
import { PublicInfoLinks } from "./public-info-links";
import { StickFigure } from "./stick-figure";

type HomeModeMenuProps = {
  onBattle: () => void;
  onSolo: () => void;
  equipment: EquipmentSelection;
  styleCoins: number;
  onOpenShop: () => void;
  onOpenEquipment: () => void;
};

export function HomeModeMenu({
  onBattle,
  onSolo,
  equipment,
  styleCoins,
  onOpenShop,
  onOpenEquipment,
}: HomeModeMenuProps) {
  return (
    <section className="homeModeMenu" aria-labelledby="home-mode-title">
      <h1 className="srOnly" id="home-mode-title">遊ぶモードを選択</h1>
      <GameLogo equipment={equipment} />

      <div className="homeCustomizationBar" aria-label="カスタマイズ">
        <div className="homeCustomizationAvatar" aria-hidden="true">
          <StickFigure
            side="left"
            pose="idle"
            status="waiting"
            headAccessoryId={equipment.headAccessoryId}
            heldItemId={equipment.heldItemId}
          />
        </div>
        <div className="homeCustomizationCopy">
          <span>MY STYLE</span>
          <strong><Coins size={16} />{styleCoins} SC</strong>
        </div>
        <button className="secondaryButton" type="button" onClick={onOpenShop}>
          <ShoppingBag size={17} />ショップ
        </button>
        <button className="primaryButton" type="button" onClick={onOpenEquipment}>
          <Sparkles size={17} />装備を変更
        </button>
      </div>

      <div className="homeModeGrid">
        <div className="modeCard modeCardBattle">
          <button type="button" className="modeCardButton" onClick={onBattle}>
            <span className="modeCardScene battleModeScene" aria-hidden="true">
              <span className="modeRunner modeRunnerBlue"><StickFigure side="left" pose="run" status="active" headAccessoryId={equipment.headAccessoryId} heldItemId={equipment.heldItemId} /></span>
              <Swords className="modeCrossedSwords" size={54} strokeWidth={3} />
              <span className="modeRunner modeRunnerRed"><StickFigure side="right" pose="run" status="active" /></span>
            </span>
            <span className="modeCardContent">
              <span className="modeCardTitle">対戦する</span>
              <span className="modeCardDescription">友達とのルーム対戦やCOM戦</span>
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
              <span className="modeRunner modeRunnerGreen"><StickFigure side="left" pose="run" status="active" headAccessoryId={equipment.headAccessoryId} heldItemId={equipment.heldItemId} /></span>
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
      <div className="homePublicInfoFooter">
        <p className="homeNicknameNote">ⓘ ニックネーム未設定でも、対戦前に設定できます。</p>
        <PublicInfoLinks className="homePublicInfoLinks" />
      </div>
    </section>
  );
}
