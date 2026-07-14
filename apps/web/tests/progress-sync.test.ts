import { describe, expect, it } from "vitest";
import { getProgressSyncLabel, getProgressSyncState } from "../app/_lib/progress-sync";

describe("progress sync state", () => {
  it("reports offline before considering pending input", () => {
    const state = getProgressSyncState({
      connected: false,
      localTypedCharacters: 3,
      serverTypedCharacters: 1,
      lastSentAt: 1_000,
      now: 10_000
    });

    expect(state).toBe("offline");
    expect(getProgressSyncLabel(state)).toContain("入力を一時停止");
  });

  it("reports pending while the server is catching up", () => {
    expect(getProgressSyncState({
      connected: true,
      localTypedCharacters: 2,
      serverTypedCharacters: 1,
      lastSentAt: 1_000,
      now: 2_000
    })).toBe("pending");
  });

  it("reports delayed after the threshold", () => {
    const state = getProgressSyncState({
      connected: true,
      localTypedCharacters: 2,
      serverTypedCharacters: 1,
      lastSentAt: 1_000,
      now: 2_500
    });

    expect(state).toBe("delayed");
    expect(getProgressSyncLabel(state)).toContain("遅れ");
  });

  it("reports synced once the server sequence catches up", () => {
    expect(getProgressSyncState({
      connected: true,
      localTypedCharacters: 2,
      serverTypedCharacters: 2,
      lastSentAt: 1_000,
      now: 8_000
    })).toBe("synced");
  });
});
