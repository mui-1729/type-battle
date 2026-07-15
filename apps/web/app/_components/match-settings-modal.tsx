import { RotateCcw, X } from "lucide-react";
import type { BotDifficulty, MatchRule, PromptCategory, RoomState } from "@type-battle/shared";
import { MATCH_RULE_DETAILS } from "../_lib/ui-labels";
import { Button } from "./ui";

type MatchSettingsModalProps = {
  room: RoomState;
  onClose: () => void;
  onMatchRuleChange: (rule: MatchRule) => void;
  onPromptCategoryChange: (category: PromptCategory) => void;
  onBotDifficultyChange: (difficulty: BotDifficulty) => void;
  onResetOfficial: () => void;
  canEdit: boolean;
};

export function MatchSettingsModal({ room, onClose, onMatchRuleChange, onPromptCategoryChange, onBotDifficultyChange, onResetOfficial, canEdit }: MatchSettingsModalProps) {
  const isOfficial = room.matchRule === "race" && room.promptCategory === "standard" && room.botDifficulty === "normal";
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modalContent matchSettingsModal" role="dialog" aria-modal="true" aria-labelledby="match-settings-title">
        <div className="modalHeader"><div><p className="eyebrow">NEXT MATCH</p><h2 id="match-settings-title">次の試合設定</h2></div><button type="button" className="iconButton" onClick={onClose} aria-label="設定を閉じる"><X size={19} /></button></div>
        <div className="matchSettingsStatus"><span className={isOfficial ? "presetBadge official" : "presetBadge custom"}>{isOfficial ? "OFFICIAL" : "CUSTOM"}</span><span>{canEdit ? (isOfficial ? "公式プリセット" : "現在の設定を維持") : "ホストのみ変更できます"}</span></div>
        <div className="matchSettingsGroup"><h3>通常設定</h3><div className="matchSettingsOptions">{(Object.keys(MATCH_RULE_DETAILS) as MatchRule[]).map((rule) => <button disabled={!canEdit} type="button" key={rule} className={room.matchRule === rule ? "active" : ""} onClick={() => onMatchRuleChange(rule)}><strong>{MATCH_RULE_DETAILS[rule].label}</strong><span>{MATCH_RULE_DETAILS[rule].description}</span></button>)}</div></div>
        <div className="matchSettingsGroup"><h3>詳細設定</h3><label>課題カテゴリ<select disabled={!canEdit} value={room.promptCategory} onChange={(event) => onPromptCategoryChange(event.target.value as PromptCategory)}><option value="short">SHORT</option><option value="standard">STANDARD</option><option value="long">LONG</option></select></label><label>COM難易度<select disabled={!canEdit} value={room.botDifficulty} onChange={(event) => onBotDifficultyChange(event.target.value as BotDifficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label></div>
        <div className="modalActions">{canEdit ? <Button variant="secondary" type="button" onClick={onResetOfficial}><RotateCcw size={17} /> 公式設定に戻す</Button> : null}<Button variant="primary" type="button" onClick={onClose}>完了</Button></div>
      </section>
    </div>
  );
}
