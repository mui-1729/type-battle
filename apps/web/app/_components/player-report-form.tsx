"use client";

import { ExternalLink, Flag } from "lucide-react";
import { useMemo, useState } from "react";

const REPORT_REASONS = [
  ["harassment", "嫌がらせ・不快な行為"],
  ["nickname", "不適切なニックネーム"],
  ["cheating", "不正・不自然なプレイ"],
  ["other", "その他"]
] as const;

type PlayerReportFormProps = {
  roomCode: string;
  opponentId: string;
  opponentNickname: string;
  occurredAt: string;
};

export function PlayerReportForm({
  roomCode,
  opponentId,
  opponentNickname,
  occurredAt
}: PlayerReportFormProps) {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number][0]>("harassment");
  const reasonLabel = REPORT_REASONS.find(([value]) => value === reason)?.[1] ?? "その他";
  const issueUrl = useMemo(
    () => buildPlayerReportIssueUrl({ roomCode, opponentId, opponentNickname, occurredAt, reason: reasonLabel }),
    [occurredAt, opponentId, opponentNickname, reasonLabel, roomCode]
  );

  return (
    <section className="playerReportForm" aria-labelledby="player-report-heading">
      <div>
        <p className="eyebrow">PLAYER REPORT</p>
        <h2 id="player-report-heading">対戦相手を報告</h2>
        <p className="modalCopy">識別情報は下書きとしてGitHub Issueへ引き継ぎます。送信前に内容を確認してください。</p>
      </div>

      <dl className="playerReportContext">
        <div><dt>ルーム</dt><dd>{roomCode || "不明"}</dd></div>
        <div><dt>相手</dt><dd>{opponentNickname || "名前未設定"}</dd></div>
        <div><dt>相手ID</dt><dd><code>{opponentId || "不明"}</code></dd></div>
        <div><dt>発生時刻</dt><dd>{occurredAt}</dd></div>
      </dl>

      <label className="fieldGroup">
        <span>報告理由</span>
        <select value={reason} onChange={(event) => setReason(event.target.value as (typeof REPORT_REASONS)[number][0])}>
          {REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>

      <p className="legalNotice">
        GitHub Issue は公開されます。氏名、メールアドレス、SNS ID、その他の個人情報や秘密情報は書き込まないでください。
      </p>

      <a className="primaryButton feedbackIssueButton" href={issueUrl} target="_blank" rel="noreferrer">
        <Flag size={18} aria-hidden="true" />
        報告内容を確認する
        <ExternalLink size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

export function buildPlayerReportIssueUrl({
  roomCode,
  opponentId,
  opponentNickname,
  occurredAt,
  reason
}: PlayerReportFormProps & { reason: string }): string {
  const title = `[Player report] ${reason}`;
  const body = [
    "## 報告理由",
    reason,
    "",
    "## 対戦情報",
    `- room: ${roomCode || "不明"}`,
    `- opponent nickname: ${opponentNickname || "名前未設定"}`,
    `- opponent id: ${opponentId || "不明"}`,
    `- occurred at: ${occurredAt}`,
    "",
    "## 詳細",
    "<!-- 何が起きたかを、個人情報や秘密情報を含めずに記入してください -->"
  ].join("\n");
  const params = new URLSearchParams({ title, body });
  return `https://github.com/mui-1729/type-battle/issues/new?${params.toString()}`;
}
