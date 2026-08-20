import Link from "next/link";
import { FileText, MessageCircle, ShieldCheck } from "lucide-react";

type PublicInfoLinksProps = {
  className?: string;
};

export function PublicInfoLinks({ className = "" }: PublicInfoLinksProps) {
  const classes = ["publicInfoLinks", className].filter(Boolean).join(" ");

  return (
    <nav className={classes} aria-label="サービス情報">
      <Link className="publicInfoLink" href="/terms">
        <FileText size={16} aria-hidden="true" />
        利用規約
      </Link>
      <Link className="publicInfoLink" href="/privacy">
        <ShieldCheck size={16} aria-hidden="true" />
        プライバシー
      </Link>
      <Link className="publicInfoLink" href="/contact">
        <MessageCircle size={16} aria-hidden="true" />
        お問い合わせ
      </Link>
    </nav>
  );
}
