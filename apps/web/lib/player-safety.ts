export function buildPlayerReportHref({
  roomCode,
  playerId,
  nickname
}: {
  roomCode: string;
  playerId: string;
  nickname: string;
}): string {
  const params = new URLSearchParams({
    kind: "player-report",
    roomCode,
    opponentId: playerId,
    opponentNickname: nickname
  });
  return `/feedback?${params.toString()}`;
}

export function buildPlayerReportIssueUrl({
  roomCode,
  opponentId,
  opponentNickname,
  occurredAt,
  reason
}: {
  roomCode: string;
  opponentId: string;
  opponentNickname: string;
  occurredAt: string;
  reason: string;
}): string {
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
