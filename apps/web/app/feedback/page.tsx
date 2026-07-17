import { PageHeader } from "../_components/page-header";

const FEEDBACK_ISSUE_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_ISSUE_URL ??
  "https://github.com/mui-1729/type-battle/issues/new?template=private-beta-feedback.yml";

export default function FeedbackPage() {
  return (
    <main className="appShell">
      <PageHeader ariaLabel="フィードバック" eyebrow="TYPE BATTLE" title="フィードバック" description="不具合と改善要望を分けて送るための導線です。" backLabel="ゲームに戻る" />

      <section className="workspace">
        <aside className="sidePanel">
          <div className="fieldGroup">
            <label>報告方法</label>
            <p>
              Private beta の不具合や改善要望は、ここから GitHub Issue に切り出してください。
            </p>
          </div>

          <div className="fieldGroup">
            <label>含める内容</label>
            <ul className="featureList">
              <li>ルームコード</li>
              <li>再現手順</li>
              <li>期待した動作</li>
              <li>実際の動作</li>
            </ul>
          </div>
        </aside>

        <section className="matchSurface">
          <div className="emptyState large">
            <p>テンプレートを開いて、再現条件をそのまま書いてください。</p>
            <a className="primaryButton" href={FEEDBACK_ISSUE_URL} target="_blank" rel="noreferrer">
              GitHub Issue を開く
            </a>
          </div>

          <div className="resultPanel">
            <div className="resultRows">
              <div className="resultRow">
                <span>1</span>
                <strong>不具合報告</strong>
                <small>動作不良、状態のずれ、ビルド問題などに使います。</small>
              </div>
              <div className="resultRow">
                <span>2</span>
                <strong>改善要望</strong>
                <small>UX、アクセシビリティ、Private Beta の改善提案に使います。</small>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
