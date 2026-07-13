import { describe, expect, it } from "vitest";
import {
  MAX_STORED_ROOM_REJOIN_ATTEMPTS,
  getStoredRoomJoinFailureAction,
  getStoredRoomRejoinDelayMs
} from "../app/_lib/room-reconnect";

describe("stored room reconnect", () => {
  it.each([
    "ルームが見つかりません。",
    "このプレイヤーの認証情報がありません。",
    "このプレイヤーは別のセッションで使用されています。",
    "試合中のルームには参加できません。",
    "このルームは満員です。"
  ])("discards unrecoverable room data for %s", (error) => {
    expect(getStoredRoomJoinFailureAction(error, 1)).toBe("discard");
  });

  it.each([
    "Realtime connection closed.",
    "Realtime connection is not ready.",
    "Realtime request timed out.",
    "Realtime outbound queue overflowed.",
    "リクエストを処理できませんでした。時間をおいて再試行してください。"
  ])("retries a temporary failure for %s", (error) => {
    expect(getStoredRoomJoinFailureAction(error, 1)).toBe("retry");
  });

  it("pauses instead of retrying forever", () => {
    expect(getStoredRoomJoinFailureAction("Realtime request timed out.", MAX_STORED_ROOM_REJOIN_ATTEMPTS)).toBe(
      "pause"
    );
  });

  it("uses bounded exponential backoff", () => {
    expect([1, 2, 3, 4, 5, 10].map(getStoredRoomRejoinDelayMs)).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      8_000,
      8_000
    ]);
  });
});
