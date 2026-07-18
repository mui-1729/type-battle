import { Bug, ExternalLink, Lightbulb } from "lucide-react";
import { PageHeader } from "../_components/page-header";
import { SurfaceCard } from "../_components/ui";

const FEEDBACK_ISSUE_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_ISSUE_URL ??
  "https://github.com/mui-1729/type-battle/issues/new?template=private-beta-feedback.yml";

export default function FeedbackPage() {
  return (
    <main className="appShell feedbackPage">
      <PageHeader ariaLabel="フィードバック" eyebrow="TYPE BATTLE" title="フィードバック" description="不具合や改善要望をGitHub Issueで送れます。" backLabel="ゲームに戻る" />

      <SurfaceCard className="feedbackCard">
        <div className="feedbackCardHeading">
          <p className="eyebrow">PRIVATE BETA</p>
          <h2>報告する内容をまとめる</h2>
          <p>ルームコード、再現手順、期待した動作、実際の動作があると調査しやすくなります。</p>
        </div>
        <div className="feedbackKinds">
          <div><Bug aria-hidden="true" /><span><strong>不具合報告</strong><small>動作不良や状態のずれ</small></span></div>
          <div><Lightbulb aria-hidden="true" /><span><strong>改善要望</strong><small>UXやアクセシビリティの提案</small></span></div>
        </div>
        <a className="primaryButton feedbackIssueButton" href={FEEDBACK_ISSUE_URL} target="_blank" rel="noreferrer">
          GitHub Issue を開く <ExternalLink size={18} aria-hidden="true" />
        </a>
      </SurfaceCard>
    </main>
  );
}
