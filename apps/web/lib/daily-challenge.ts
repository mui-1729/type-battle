export const DAILY_CHALLENGE_METRIC_VERSION = 2 as const;

export type DailyChallengeRecord = {
  metricVersion: typeof DAILY_CHALLENGE_METRIC_VERSION;
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
      parsedRecord.metricVersion === DAILY_CHALLENGE_METRIC_VERSION &&
      parsedRecord.challengeKey === challengeKey &&
      typeof parsedRecord.bestWpm === "number" &&
      typeof parsedRecord.bestAccuracy === "number" &&
      typeof parsedRecord.bestFinishTimeMs === "number" &&
      typeof parsedRecord.attempts === "number" &&
      typeof parsedRecord.lastCompletedAt === "number" &&
      typeof parsedRecord.promptId === "string"
    ) {
      return {
        metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
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
      metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
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

export type DailyChallengeAttempt = {
  challengeKey: string;
  promptId: string;
  wpm: number;
  accuracy: number;
  finishTimeMs: number;
  completedAt: number;
};

export function recordDailyChallengeAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  attempt: DailyChallengeAttempt,
  visibleChallengeKey: string
): { savedRecord: DailyChallengeRecord; visibleRecord: DailyChallengeRecord | null } {
  const previousRecord = loadDailyChallengeRecord(storage, attempt.challengeKey);
  const savedRecord = updateDailyChallengeRecord(previousRecord, attempt);
  persistDailyChallengeRecord(storage, savedRecord);

  return {
    savedRecord,
    visibleRecord:
      savedRecord.challengeKey === visibleChallengeKey
        ? savedRecord
        : loadDailyChallengeRecord(storage, visibleChallengeKey)
  };
}

export function getVisibleDailyChallengeRecord(
  record: DailyChallengeRecord | null,
  visibleChallengeKey: string
): DailyChallengeRecord | null {
  return record?.challengeKey === visibleChallengeKey ? record : null;
}
