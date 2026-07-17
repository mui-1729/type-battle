import { X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { PlayerSettings } from "../../lib/player-settings";
import { FONT_SIZE_LABELS, THEME_LABELS } from "../_lib/ui-labels";

type PlayerSettingsModalProps = {
  settings: PlayerSettings;
  setSettings: Dispatch<SetStateAction<PlayerSettings>>;
  setNickname: (nickname: string) => void;
  onClose: () => void;
  onOpenTutorial: () => void;
};

export function PlayerSettingsModal({ settings, setSettings, setNickname, onClose, onOpenTutorial }: PlayerSettingsModalProps) {
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalContent" onClick={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">PLAYER</p>
            <h2>プレイヤー設定</h2>
          </div>
          <button className="iconButton" type="button" onClick={onClose} aria-label="設定を閉じる">
            <X size={20} />
          </button>
        </div>

        <p className="modalCopy">表示、入力、音の設定をこの画面でまとめて調整します。</p>

        <div className="settingsGrid">
          <div className="fieldGroup">
            <label>ニックネーム</label>
            <input
              value={settings.nickname}
              maxLength={18}
              onChange={(event) => setNickname(event.target.value)}
              suppressHydrationWarning
            />
          </div>

          <div className="fieldGroup">
            <label>テーマ</label>
            <div className="difficultyButtons">
              {(["system", "light", "dark"] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={settings.theme === theme ? "active" : ""}
                  onClick={() => setSettings((current) => ({ ...current, theme }))}
                >
                  {THEME_LABELS[theme]}
                </button>
              ))}
            </div>
          </div>

          <div className="fieldGroup">
            <label>表示とアクセシビリティ</label>
            <div className="toggleGroup">
              <label className="toggleLabel">
                <input
                  type="checkbox"
                  checked={settings.inputGuideEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, inputGuideEnabled: event.target.checked }))
                  }
                  suppressHydrationWarning
                />
                入力ガイド（次の文字を強調）
              </label>
              <label className="toggleLabel">
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, reducedMotion: event.target.checked }))
                  }
                  suppressHydrationWarning
                />
                アニメーションを減らす
              </label>
              <label className="toggleLabel">
                <input
                  type="checkbox"
                  checked={settings.reactionsEnabled}
                  onChange={(event) => setSettings((current) => ({ ...current, reactionsEnabled: event.target.checked }))}
                  suppressHydrationWarning
                />
                相手の定型リアクションを表示
              </label>
            </div>
          </div>

          <div className="fieldGroup">
            <label>文字サイズ</label>
            <div className="difficultyButtons">
              {(["small", "normal", "large"] as const).map((fontSize) => (
                <button
                  key={fontSize}
                  type="button"
                  className={settings.fontSize === fontSize ? "active" : ""}
                  onClick={() => setSettings((current) => ({ ...current, fontSize }))}
                >
                  {FONT_SIZE_LABELS[fontSize]}
                </button>
              ))}
            </div>
          </div>

          <div className="fieldGroup">
            <label>サウンド</label>
            <div className="toggleGroup">
              <label className="toggleLabel">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, soundEnabled: event.target.checked }))
                  }
                  suppressHydrationWarning
                />
                効果音
              </label>
              <label className="toggleLabel">
                <input
                  type="checkbox"
                  checked={settings.countdownSoundEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, countdownSoundEnabled: event.target.checked }))
                  }
                  suppressHydrationWarning
                />
                カウントダウン音
              </label>
            </div>
          </div>
        </div>

        <div className="modalActions">
          <button className="secondaryButton" type="button" onClick={onOpenTutorial}>遊び方を再表示</button>
          <button className="primaryButton" type="button" onClick={onClose}>
            設定を反映
          </button>
        </div>
      </div>
    </div>
  );
}
