import Link from "next/link";

const FEEDBACK_ISSUE_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_ISSUE_URL ??
  "https://github.com/mui-1729/type-battle/issues/new?template=private-beta-feedback.yml";

export default function FeedbackPage() {
  return (
    <main className="appShell">
      <section className="topBar" aria-label="Feedback">
        <div>
          <p className="eyebrow">TYPE BATTLE</p>
          <h1>Feedback</h1>
        </div>
        <Link className="secondaryButton" href="/">
          Back to game
        </Link>
      </section>

      <section className="workspace">
        <aside className="sidePanel">
          <div className="fieldGroup">
            <label>Report path</label>
            <p>
              Private beta の不具合や改善要望は、ここから GitHub Issue に切り出してください。
            </p>
          </div>

          <div className="fieldGroup">
            <label>Include</label>
            <ul className="featureList">
              <li>room code</li>
              <li>reproduction steps</li>
              <li>expected behavior</li>
              <li>actual behavior</li>
            </ul>
          </div>
        </aside>

        <section className="matchSurface">
          <div className="emptyState large">
            <p>Open the template and fill in the details.</p>
            <a className="primaryButton" href={FEEDBACK_ISSUE_URL} target="_blank" rel="noreferrer">
              Open GitHub Issue
            </a>
          </div>

          <div className="resultPanel">
            <div className="resultRows">
              <div className="resultRow">
                <span>1</span>
                <strong>Bug report</strong>
                <small>Use this for broken flows, wrong state, or build problems.</small>
              </div>
              <div className="resultRow">
                <span>2</span>
                <strong>Feature request</strong>
                <small>Use this for UX, accessibility, or private beta improvements.</small>
              </div>
            </div>
            <Link className="secondaryButton" href="/">
              Return to match
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
