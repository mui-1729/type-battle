import { PageHeader } from "../_components/page-header";
import { PublicInfoLinks } from "../_components/public-info-links";
import { SurfaceCard } from "../_components/ui";

export const metadata = {
  title: "プライバシーポリシー | Type Battle",
};

export default function PrivacyPage() {
  return (
    <main className="appShell legalPage">
      <PageHeader
        ariaLabel="プライバシーポリシー"
        eyebrow="TYPE BATTLE"
        title="プライバシー"
        description="Type Battleで扱う情報と、その利用目的を説明します。"
        backLabel="ゲームに戻る"
      />

      <div className="legalScroll">
        <SurfaceCard className="legalCard">
          <p className="legalUpdated">最終更新: 2026年8月20日</p>

          <section className="legalSection">
            <h2>1. 扱う情報</h2>
            <p>本サービスでは、ゲームを動作させるために次の情報を扱います。</p>
            <ul>
              <li>利用者が入力したニックネーム</li>
              <li>ゲスト利用者を区別するためのguest ID・session情報</li>
              <li>room code、対戦状態、入力進捗、WPM、accuracy、miss数などの対戦情報</li>
              <li>接続・エラー・不正利用対策に必要な技術情報</li>
              <li>利用者が任意でGitHub Issueへ送信したフィードバック内容</li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>2. ブラウザ内に保存する情報</h2>
            <p>
              ニックネーム、guest ID、再接続に必要なroom情報、表示設定、入力設定、Daily Challengeの状態、
              mistake tendency、cosmetic選択などは、主にブラウザのlocalStorageへ保存します。
            </p>
            <p>
              ブラウザのサイトデータを削除すると、これらの情報も失われる場合があります。
            </p>
          </section>

          <section className="legalSection">
            <h2>3. サーバー側の保存と保持期間</h2>
            <ul>
              <li>guest session: 最終利用からおおむね7日間</li>
              <li>match result: 作成からおおむね30日間</li>
              <li>終了済みroomの状態: 通常おおむね5分間</li>
            </ul>
            <p>
              障害対応や仕様変更により保持期間を見直す場合があります。Public Betaで変更する場合は、このページも更新します。
            </p>
          </section>

          <section className="legalSection">
            <h2>4. 利用目的</h2>
            <ul>
              <li>ルーム作成、参加、対戦、再接続、結果表示などのゲーム機能を提供するため</li>
              <li>不具合の調査、品質改善、サービス状態の確認を行うため</li>
              <li>大量接続や不自然な入力などを検知し、サービスを保護するため</li>
              <li>利用者から受け取った問い合わせ・フィードバックへ対応するため</li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>5. 利用する外部サービス</h2>
            <p>
              Web配信にはVercel、Realtime通信・room状態・対戦結果などの処理にはCloudflare Workers / Durable Objectsを利用します。
              GitHub Issueから問い合わせ・フィードバックを送った場合、その内容はGitHub上でも処理されます。
            </p>
          </section>

          <section className="legalSection">
            <h2>6. 第三者への提供</h2>
            <p>
              サービス提供に必要なインフラ事業者による処理、法令上必要な場合、サービスや利用者の安全を守るために必要な場合を除き、
              利用者情報を第三者へ販売することを目的とした機能は現在提供していません。
            </p>
          </section>

          <section className="legalSection">
            <h2>7. セキュリティ</h2>
            <p>
              サーバー側で入力を検証し、rate limit、接続数制限、CSP、構造化ログなどを用いて不正利用や障害の影響を抑えるよう努めます。
              ただし、通信や保存に関するリスクを完全に排除できることを保証するものではありません。
            </p>
          </section>

          <section className="legalSection">
            <h2>8. 削除・問い合わせ</h2>
            <p>
              ブラウザ内の情報はサイトデータを削除することで消去できます。現在はアカウント機能がないため、
              サーバー上のguestデータを利用者自身が指定して削除する画面はありません。データの扱いに関する相談はお問い合わせページから連絡してください。
            </p>
          </section>

          <p className="legalNotice">
            GitHub Issueは公開される場合があります。住所、電話番号、メールアドレス、認証情報などの機密情報は投稿しないでください。
          </p>

          <PublicInfoLinks />
        </SurfaceCard>
      </div>
    </main>
  );
}
