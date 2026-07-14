export const MAX_STORED_ROOM_REJOIN_ATTEMPTS = 5;

const PERMANENT_ROOM_JOIN_ERRORS = new Set([
  "ルームが見つかりません。",
  "このプレイヤーの認証情報がありません。",
  "このプレイヤーは別のセッションで使用されています。",
  "試合中のルームには参加できません。",
  "このルームは満員です。"
]);

export type StoredRoomJoinFailureAction = "discard" | "retry" | "pause";

export function getStoredRoomJoinFailureAction(
  error: string,
  attempts: number
): StoredRoomJoinFailureAction {
  if (PERMANENT_ROOM_JOIN_ERRORS.has(error)) {
    return "discard";
  }

  return attempts >= MAX_STORED_ROOM_REJOIN_ATTEMPTS ? "pause" : "retry";
}

export function getStoredRoomRejoinDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 3));
  return 1_000 * 2 ** exponent;
}
