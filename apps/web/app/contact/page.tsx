import Link from "next/link";
import { ExternalLink, MessageCircle, ShieldAlert } from "lucide-react";
import { PageHeader } from "../_components/page-header";
import { PublicInfoLinks } from "../_components/public-info-links";
import { SurfaceCard } from "../_components/ui";

const CONTACT_ISSUE_URL =
  process.env.NEXT_PUBLIC_CONTACT_ISSUE_URL ??
  "https://github.com/mui-1729/type-battle/issues/new";

export const metadata = {
  title: "お問い合わせ | Type Battle",
};

export default function ContactPage() {
  return (
    <main className="appShell legalPage">
      <PageHeader
        ariaLabel="お問い合わせ"
        eyebrow="TYPE BATTLE"
        title="お問い合わせ"
        description="不具合、改善要望、利用規約・プライバシーに関する連絡先です。"
        backLabel="ゲームに戻る"
      />

      <div className="legalScroll">
        <SurfaceCard className="legalCard">
          <section className="legalSection">
            <h2>不具合・改善要望</h2>
            <p>
              ゲーム内の不具合や使いにくい点は、フィードバックページからGitHub Issueとして送れます。
              再現手順、利用端末、期待した動作、実際の動作があると確認しやすくなります。
            </p>
            <div className="contactActions">
              <Link className="primaryButton" href="/feedback">
                <MessageCircle size={18} aria-hidden="true" />
                フィードバックを送る
              </Link>
            </div>
          </section>

          <section className="legalSection">
            <h2>規約・プライバシーに関する連絡</h2>
            <p>
              利用規約、プライバシー、保存データの扱いなどに関する連絡もGitHub Issueで受け付けます。
            </p>
            <div className="contactActions">
              <a className="secondaryButton" href={CONTACT_ISSUE_URL} target="_blank" rel="noreferrer">
                GitHub Issue を開く
                <ExternalLink size={18} aria-hidden="true" />
              </a>
            </div>
          </section>

          <p className="legalNotice">
            <ShieldAlert size={18} aria-hidden="true" />{" "}
            GitHub Issueは公開される場合があります。住所、電話番号、メールアドレス、パスワード、tokenなどの機密情報は投稿しないでください。
          </p>

          <section className="legalSection">
            <h2>返信について</h2>
            <p>
              ベータ期間中はすべての問い合わせへの個別返信を保証していませんが、公開運用・安全性・不具合に関わる内容を優先して確認します。
            </p>
          </section>

          <PublicInfoLinks />
        </SurfaceCard>
      </div>
    </main>
  );
}
