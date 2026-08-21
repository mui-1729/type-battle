import { PageHeader } from "../_components/page-header";
import { PublicInfoLinks } from "../_components/public-info-links";
import { SurfaceCard } from "../_components/ui";

export const metadata = {
  title: "利用規約 | Type Battle",
};

export default function TermsPage() {
  return (
    <main className="appShell legalPage">
      <PageHeader
        ariaLabel="利用規約"
        eyebrow="TYPE BATTLE"
        title="利用規約"
        description="Type Battleを利用するときの基本ルールです。"
        backLabel="ゲームに戻る"
      />

      <div className="legalScroll">
        <SurfaceCard className="legalCard">
          <p className="legalUpdated">最終更新: 2026年8月20日</p>

          <section className="legalSection">
            <h2>1. 適用</h2>
            <p>
              この利用規約は、Type Battle（以下「本サービス」）の利用条件を定めるものです。
              本サービスを利用した場合、この規約の内容に同意したものとして扱います。
            </p>
          </section>

          <section className="legalSection">
            <h2>2. ベータ版について</h2>
            <p>
              本サービスは開発中のベータ版です。機能、ゲームルール、保存方式、提供範囲は予告なく変更されることがあります。
              メンテナンスや障害対応のため、一時的に利用できなくなる場合があります。
            </p>
          </section>

          <section className="legalSection">
            <h2>3. ニックネームと表示情報</h2>
            <ul>
              <li>対戦時に設定したニックネームは、同じルームの相手などに表示されます。</li>
              <li>他人になりすます名称、第三者を攻撃する名称、法令や公序良俗に反する名称は使用しないでください。</li>
              <li>個人を特定できる氏名、住所、電話番号、メールアドレスなどをニックネームへ含めないことを推奨します。</li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>4. 禁止事項</h2>
            <p>本サービスでは、次の行為を禁止します。</p>
            <ul>
              <li>不正アクセス、脆弱性の悪用、サービス運営を妨げる行為</li>
              <li>自動入力・改変クライアントなどを用いて、通常のプレイを装う行為</li>
              <li>意図的な大量接続・大量リクエストなど、他の利用者へ影響する行為</li>
              <li>他の利用者への嫌がらせ、なりすまし、権利侵害につながる行為</li>
              <li>法令に違反する行為、または違反を助長する行為</li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>5. 対戦結果と不正防止</h2>
            <p>
              対戦中の進捗や結果はサーバー側で検証・確定します。不自然な入力や通常の利用では考えにくい結果について、
              Public Beta以降は記録の除外、対戦制限などの対応を行う場合があります。
            </p>
          </section>

          <section className="legalSection">
            <h2>6. サービスの変更・停止</h2>
            <p>
              品質改善、セキュリティ対応、運用上の必要に応じて、本サービスの全部または一部を変更・停止することがあります。
              ベータ期間中は、保存済みデータを引き継げない変更を行う場合があります。
            </p>
          </section>

          <section className="legalSection">
            <h2>7. 免責</h2>
            <p>
              本サービスは安定した提供に努めますが、常に利用できること、データが永久に保存されること、
              すべての端末・ブラウザで同一に動作することを保証するものではありません。
            </p>
          </section>

          <section className="legalSection">
            <h2>8. 規約の変更</h2>
            <p>
              本サービスの内容や運用方法が変わった場合、この規約も更新することがあります。
              重要な変更では、更新日やサービス内の案内で分かるようにします。
            </p>
          </section>

          <section className="legalSection">
            <h2>9. お問い合わせ</h2>
            <p>
              不具合、利用上の問題、この規約に関する連絡は「お問い合わせ」ページから受け付けます。
            </p>
          </section>

          <PublicInfoLinks />
        </SurfaceCard>
      </div>
    </main>
  );
}
