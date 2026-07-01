import { describe, expect, it } from "vitest";
import { updateDailyChallengeRecord } from "../lib/daily-challenge";

describe("daily challenge", () => {
  it("updates the stored record with the better run", () => {
    const previous = {
      challengeKey: "2026-07-01",
      promptId: "standard-1",
      bestWpm: 80,
      bestAccuracy: 95,
      bestFinishTimeMs: 120000,
      attempts: 2,
      lastCompletedAt: 1000
    };

    const next = updateDailyChallengeRecord(previous, {
      challengeKey: "2026-07-01",
      promptId: "standard-1",
      wpm: 92,
      accuracy: 97,
      finishTimeMs: 110000,
      completedAt: 2000
    });

    expect(next.bestWpm).toBe(92);
    expect(next.bestAccuracy).toBe(97);
    expect(next.bestFinishTimeMs).toBe(110000);
    expect(next.attempts).toBe(3);
    expect(next.lastCompletedAt).toBe(2000);
  });
});
