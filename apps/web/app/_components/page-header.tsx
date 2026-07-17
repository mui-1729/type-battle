import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type PageHeaderProps = {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  backLabel: string;
};

export function PageHeader({ ariaLabel, eyebrow, title, description, backLabel }: PageHeaderProps) {
  return (
    <section className="topBar" aria-label={ariaLabel}>
      <div className="headerBackSlot">
        <Link className="secondaryButton headerBackButton" href="/">
          <ArrowLeft size={17} aria-hidden="true" />
          {backLabel}
        </Link>
      </div>
      <div className="brandBlock">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="topBarCopy">{description}</p>
      </div>
    </section>
  );
}
