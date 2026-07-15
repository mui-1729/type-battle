export const DAILY_CHALLENGE_METRIC_VERSION = 2 as const;
export const DAILY_CHALLENGE_MAX_ATTEMPTS = 5 as const;

export type DailyChallengeRecord = {
  metricVersion: typeof DAILY_CHALLENGE_METRIC_VERSION;
  challengeKey: string;
  bestWpm: number;
  bestAccuracy: number;
  bestMistakes?: number;
  bestFinishTimeMs: number;
  attempts: number;
  points?: number;
  perfectAwarded?: boolean;
  completionAwarded?: boolean;
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
      (parsedRecord.bestMistakes === undefined || typeof parsedRecord.bestMistakes === "number") &&
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
        bestMistakes: parsedRecord.bestMistakes ?? 0,
        bestFinishTimeMs: parsedRecord.bestFinishTimeMs,
        attempts: parsedRecord.attempts,
        points: typeof parsedRecord.points === "number" ? parsedRecord.points : 0,
        perfectAwarded: parsedRecord.perfectAwarded === true,
        completionAwarded: parsedRecord.completionAwarded === true,
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
    mistakes?: number;
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
      bestMistakes: next.mistakes ?? 0,
      bestFinishTimeMs: next.finishTimeMs,
      attempts: 1,
      points: 0,
      perfectAwarded: false,
      completionAwarded: false,
      lastCompletedAt: next.completedAt
    };
  }

  return {
    ...previous,
    ...(isBetterAttempt(previous, next) ? {
      bestWpm: next.wpm,
      bestAccuracy: next.accuracy,
      bestMistakes: next.mistakes ?? 0,
      bestFinishTimeMs: next.finishTimeMs
    } : {}),
    attempts: previous.attempts + 1,
    lastCompletedAt: next.completedAt
  };
}

export type DailyChallengeAttempt = {
  challengeKey: string;
  promptId: string;
  wpm: number;
  accuracy: number;
  mistakes?: number;
  finishTimeMs: number;
  completedAt: number;
  attemptConsumed?: boolean;
};

export function consumeDailyChallengeAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  challengeKey: string,
  promptId: string,
  consumedAt: number
): DailyChallengeRecord | null {
  const previous = loadDailyChallengeRecord(storage, challengeKey);
  if (previous && previous.attempts >= DAILY_CHALLENGE_MAX_ATTEMPTS) {
    return null;
  }

  const next: DailyChallengeRecord = previous
    ? { ...previous, attempts: previous.attempts + 1, lastCompletedAt: consumedAt }
    : {
        metricVersion: DAILY_CHALLENGE_METRIC_VERSION,
        challengeKey,
        promptId,
        bestWpm: 0,
        bestAccuracy: 0,
        bestMistakes: 0,
        bestFinishTimeMs: 0,
        attempts: 1,
        points: 0,
        perfectAwarded: false,
        lastCompletedAt: consumedAt
      };
  persistDailyChallengeRecord(storage, next);
  return next;
}

export function recordDailyChallengeAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  attempt: DailyChallengeAttempt,
  visibleChallengeKey: string
): { savedRecord: DailyChallengeRecord; visibleRecord: DailyChallengeRecord | null } {
  const previousRecord = loadDailyChallengeRecord(storage, attempt.challengeKey);
  const savedRecord = attempt.attemptConsumed
    ? updateDailyChallengeCompletion(previousRecord, attempt)
    : updateDailyChallengeRecord(previousRecord, attempt);
  persistDailyChallengeRecord(storage, savedRecord);

  return {
    savedRecord,
    visibleRecord:
      savedRecord.challengeKey === visibleChallengeKey
        ? savedRecord
        : loadDailyChallengeRecord(storage, visibleChallengeKey)
  };
}

function updateDailyChallengeCompletion(previous: DailyChallengeRecord | null, next: DailyChallengeAttempt): DailyChallengeRecord {
  const base = previous ?? updateDailyChallengeRecord(null, next);
  const mistakes = next.mistakes ?? 0;
  const isPerfect = next.accuracy === 100 && mistakes === 0;
  return {
    ...base,
    ...(isBetterAttempt(base, next) ? {
      bestWpm: next.wpm,
      bestAccuracy: next.accuracy,
      bestMistakes: mistakes,
      bestFinishTimeMs: next.finishTimeMs
    } : {}),
    points: Math.min(3, (base.points ?? 0) + (!base.completionAwarded ? 1 : 0) + (isPerfect && !base.perfectAwarded ? 2 : 0)),
    perfectAwarded: base.perfectAwarded || isPerfect,
    completionAwarded: true,
    lastCompletedAt: next.completedAt,
    promptId: next.promptId
  };
}

function isBetterAttempt(previous: DailyChallengeRecord, next: DailyChallengeAttempt): boolean {
  if (next.wpm !== previous.bestWpm) return next.wpm > previous.bestWpm;
  if (next.accuracy !== previous.bestAccuracy) return next.accuracy > previous.bestAccuracy;
  const mistakes = next.mistakes ?? 0;
  if (mistakes !== (previous.bestMistakes ?? 0)) return mistakes < (previous.bestMistakes ?? 0);
  return previous.bestFinishTimeMs <= 0 || next.finishTimeMs < previous.bestFinishTimeMs;
}

export function getVisibleDailyChallengeRecord(
  record: DailyChallengeRecord | null,
  visibleChallengeKey: string
): DailyChallengeRecord | null {
  return record?.challengeKey === visibleChallengeKey ? record : null;
}
