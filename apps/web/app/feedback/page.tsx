import { Bug, ExternalLink, Lightbulb } from "lucide-react";
import { PageHeader } from "../_components/page-header";
import { PlayerReportForm } from "../_components/player-report-form";
import { SurfaceCard } from "../_components/ui";

const FEEDBACK_ISSUE_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_ISSUE_URL ??
  "https://github.com/mui-1729/type-battle/issues/new?template=private-beta-feedback.yml";

type FeedbackSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FeedbackPage({ searchParams }: { searchParams: FeedbackSearchParams }) {
  const params = await searchParams;
  const isPlayerReport = firstValue(params.kind) === "player-report";
  const roomCode = firstValue(params.roomCode);
  const opponentId = firstValue(params.opponentId);
  const opponentNickname = firstValue(params.opponentNickname);

  return (
    <main className="appShell feedbackPage">
      <PageHeader
        ariaLabel="フィードバック"
        eyebrow="TYPE BATTLE"
        title={isPlayerReport ? "プレイヤーを報告" : "フィードバック"}
        description={isPlayerReport ? "対戦相手について安全に報告できます。" : "不具合や改善要望をGitHub Issueで送れます。"}
        backLabel="ゲームに戻る"
      />

      <SurfaceCard className="feedbackCard">
        {isPlayerReport ? (
          <PlayerReportForm
            roomCode={roomCode}
            opponentId={opponentId}
            opponentNickname={opponentNickname}
            occurredAt={new Date().toISOString()}
          />
        ) : (
          <>
            <div className="feedbackCardHeading">
              <p className="eyebrow">FEEDBACK</p>
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
          </>
        )}
      </SurfaceCard>
    </main>
  );
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
