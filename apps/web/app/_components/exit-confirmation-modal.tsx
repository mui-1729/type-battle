import { LogOut, X } from "lucide-react";
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
          <Button variant="secondary" type="button" onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" type="button" onClick={onConfirm}><LogOut size={17} /> {confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}
