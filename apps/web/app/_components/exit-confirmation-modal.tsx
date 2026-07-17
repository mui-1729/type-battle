import { LogOut, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "./ui";

type ExitConfirmationModalProps = {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ExitConfirmationModal({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm
}: ExitConfirmationModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = event.currentTarget instanceof Window
        ? event.currentTarget.document.querySelector<HTMLElement>(".exitConfirmationModal")
        : null;
      const focusableElements = dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
        : [];

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    }}>
      <section className="modalContent exitConfirmationModal" role="dialog" aria-modal="true" aria-labelledby="exit-confirmation-title">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">LEAVE GAME</p>
            <h2 id="exit-confirmation-title">{title}</h2>
          </div>
          <button className="iconButton" type="button" onClick={onCancel} aria-label="退出確認を閉じる">
            <X size={20} />
          </button>
        </div>
        <p className="modalCopy">{description}</p>
        <div className="modalActions">
          <Button ref={cancelButtonRef} variant="secondary" type="button" onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" type="button" onClick={onConfirm}><LogOut size={17} /> {confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}
