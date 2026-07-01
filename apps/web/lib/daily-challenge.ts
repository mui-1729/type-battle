export type DailyChallengeRecord = {
  challengeKey: string;
  bestWpm: number;
  bestAccuracy: number;
  bestFinishTimeMs: number;
  attempts: number;
  lastCompletedAt: number;
  promptId: string;
};

const DAILY_CHALLENGE_STORAGE_PREFIX = "type-battle:daily-challenge";

export function getDailyChallengeStorageKey(challengeKey: string): string {
  return `${DAILY_CHALLENGE_STORAGE_PREFIX}:${challengeKey}`;
}

export function loadDailyChallengeRecord(
  storage: Pick<Storage, "getItem">,
  challengeKey: string
): DailyChallengeRecord | null {
  const rawRecord = storage.getItem(getDailyChallengeStorageKey(challengeKey));

  if (!rawRecord) {
    return null;
  }

  try {
    const parsedRecord = JSON.parse(rawRecord) as Partial<DailyChallengeRecord>;

    if (
      parsedRecord.challengeKey === challengeKey &&
      typeof parsedRecord.bestWpm === "number" &&
      typeof parsedRecord.bestAccuracy === "number" &&
      typeof parsedRecord.bestFinishTimeMs === "number" &&
      typeof parsedRecord.attempts === "number" &&
      typeof parsedRecord.lastCompletedAt === "number" &&
      typeof parsedRecord.promptId === "string"
    ) {
      return {
        challengeKey: parsedRecord.challengeKey,
        bestWpm: parsedRecord.bestWpm,
        bestAccuracy: parsedRecord.bestAccuracy,
        bestFinishTimeMs: parsedRecord.bestFinishTimeMs,
        attempts: parsedRecord.attempts,
        lastCompletedAt: parsedRecord.lastCompletedAt,
        promptId: parsedRecord.promptId
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function persistDailyChallengeRecord(
  storage: Pick<Storage, "setItem">,
  record: DailyChallengeRecord
): void {
  storage.setItem(getDailyChallengeStorageKey(record.challengeKey), JSON.stringify(record));
}

export function updateDailyChallengeRecord(
  previous: DailyChallengeRecord | null,
  next: {
    challengeKey: string;
    promptId: string;
    wpm: number;
    accuracy: number;
    finishTimeMs: number;
    completedAt: number;
  }
): DailyChallengeRecord {
  if (!previous || previous.challengeKey !== next.challengeKey || previous.promptId !== next.promptId) {
    return {
      challengeKey: next.challengeKey,
      promptId: next.promptId,
      bestWpm: next.wpm,
      bestAccuracy: next.accuracy,
      bestFinishTimeMs: next.finishTimeMs,
      attempts: 1,
      lastCompletedAt: next.completedAt
    };
  }

  return {
    ...previous,
    bestWpm: Math.max(previous.bestWpm, next.wpm),
    bestAccuracy: Math.max(previous.bestAccuracy, next.accuracy),
    bestFinishTimeMs: Math.min(previous.bestFinishTimeMs, next.finishTimeMs),
    attempts: previous.attempts + 1,
    lastCompletedAt: next.completedAt
  };
}
