import { describe, expect, it } from "vitest";
import {
  DAILY_CHALLENGE_MAX_ATTEMPTS,
  DAILY_CHALLENGE_METRIC_VERSION,
  consumeDailyChallengeAttempt,
  getDailyChallengeStorageKey,
  getVisibleDailyChallengeRecord,
  recordDailyChallengeAttempt,
  updateDailyChallengeRecord
} from "../lib/daily-challenge";

describe("daily challenge", () => {
  it("updates the stored record with the better run", () => {
    const previous = {
      metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
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

  it("updates the session day without showing it on the next day's card", () => {
    const storage = createStorage();
    storage.setItem(
      getDailyChallengeStorageKey("2026-07-11"),
      JSON.stringify({
        metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
        challengeKey: "2026-07-11",
        promptId: "standard-1",
        bestWpm: 80,
        bestAccuracy: 95,
        bestFinishTimeMs: 120000,
        attempts: 2,
        lastCompletedAt: 1000
      })
    );
    storage.setItem(
      getDailyChallengeStorageKey("2026-07-12"),
      JSON.stringify({
        metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
        challengeKey: "2026-07-12",
        promptId: "standard-2",
        bestWpm: 70,
        bestAccuracy: 90,
        bestFinishTimeMs: 130000,
        attempts: 1,
        lastCompletedAt: 2000
      })
    );

    const { savedRecord, visibleRecord } = recordDailyChallengeAttempt(
      storage,
      {
        challengeKey: "2026-07-11",
        promptId: "standard-1",
        wpm: 90,
        accuracy: 98,
        finishTimeMs: 110000,
        completedAt: 3000
      },
      "2026-07-12"
    );

    expect(savedRecord).toMatchObject({ challengeKey: "2026-07-11", attempts: 3, bestWpm: 90 });
    expect(visibleRecord).toMatchObject({ challengeKey: "2026-07-12", attempts: 1, bestWpm: 70 });
    expect(JSON.parse(storage.getItem(getDailyChallengeStorageKey("2026-07-11")) ?? "null")).toMatchObject({
      attempts: 3,
      bestWpm: 90
    });
  });

  it("shows an unattempted current day when a previous-day session finishes", () => {
    const storage = createStorage();

    const { visibleRecord } = recordDailyChallengeAttempt(
      storage,
      {
        challengeKey: "2026-07-11",
        promptId: "standard-1",
        wpm: 90,
        accuracy: 98,
        finishTimeMs: 110000,
        completedAt: 3000
      },
      "2026-07-12"
    );

    expect(visibleRecord).toBeNull();
  });

  it("guards the visible card against a stale record", () => {
    const staleRecord = {
      metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
      challengeKey: "2026-07-11",
      promptId: "standard-1",
      bestWpm: 90,
      bestAccuracy: 98,
      bestFinishTimeMs: 110000,
      attempts: 3,
      lastCompletedAt: 3000
    };

    expect(getVisibleDailyChallengeRecord(staleRecord, "2026-07-12")).toBeNull();
    expect(getVisibleDailyChallengeRecord(staleRecord, "2026-07-11")).toBe(staleRecord);
  });

  it("consumes at most five attempts and awards first completion plus PERFECT points", () => {
    const storage = createStorage();
    const challengeKey = "2026-07-15";
    const promptId = "standard-1";

    for (let attempt = 0; attempt < DAILY_CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      expect(consumeDailyChallengeAttempt(storage, challengeKey, promptId, attempt + 1)).not.toBeNull();
    }
    expect(consumeDailyChallengeAttempt(storage, challengeKey, promptId, 99)).toBeNull();

    const { savedRecord } = recordDailyChallengeAttempt(
      storage,
      { challengeKey, promptId, wpm: 100, accuracy: 100, mistakes: 0, finishTimeMs: 10_000, completedAt: 100, attemptConsumed: true },
      challengeKey
    );
    expect(savedRecord).toMatchObject({ attempts: 5, points: 3, perfectAwarded: true });
  });

  it("compares best records by WPM, accuracy, then mistakes", () => {
    const previous = {
      metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
      challengeKey: "2026-07-15",
      promptId: "standard-1",
      bestWpm: 100,
      bestAccuracy: 100,
      bestMistakes: 2,
      bestFinishTimeMs: 20_000,
      attempts: 1,
      points: 1,
      perfectAwarded: false,
      lastCompletedAt: 1
    };
    const next = updateDailyChallengeRecord(previous, {
      challengeKey: previous.challengeKey,
      promptId: previous.promptId,
      wpm: 100,
      accuracy: 100,
      mistakes: 1,
      finishTimeMs: 30_000,
      completedAt: 2
    });
    expect(next).toMatchObject({ bestWpm: 100, bestAccuracy: 100, bestMistakes: 1, bestFinishTimeMs: 30_000 });
  });
});

function createStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}
