import { X } from "lucide-react";
import { useEffect, useId, useRef, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type { PlayerSettings } from "../../lib/player-settings";
import { FONT_SIZE_LABELS, THEME_LABELS } from "../_lib/ui-labels";

type PlayerSettingsModalProps = {
  settings: PlayerSettings;
  setSettings: Dispatch<SetStateAction<PlayerSettings>>;
  setNickname: (nickname: string) => void;
  onClose: () => void;
  onOpenTutorial?: () => void;
};

export function PlayerSettingsModal({ settings, setSettings, setNickname, onClose, onOpenTutorial }: PlayerSettingsModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appShell = document.querySelector<HTMLElement>(".appShell");
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousAppShellOverflow = appShell?.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (appShell) {
      appShell.style.overflow = "hidden";
    }
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
      if (appShell) {
        appShell.style.overflow = previousAppShellOverflow ?? "";
      }
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedElement?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="modalContent" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">PLAYER</p>
            <h2 id={titleId}>プレイヤー設定</h2>
          </div>
          <button ref={closeButtonRef} className="iconButton" type="button" onClick={onClose} aria-label="設定を閉じる">
            <X size={20} />
          </button>
        </div>

        <p className="modalCopy">表示、入力、音の設定は変更すると自動で保存されます。</p>

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
          {onOpenTutorial ? (
            <button className="secondaryButton" type="button" onClick={onOpenTutorial}>遊び方を再表示</button>
          ) : null}
          <button className="primaryButton" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
