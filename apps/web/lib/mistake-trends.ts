import type { MistakeSample } from "../app/_lib/typing-progress";

const MISTAKE_TRENDS_STORAGE_KEY = "type-battle:mistake-trends";
const MISTAKE_TRENDS_VERSION = 1 as const;

export type MistakeTrendBucket = {
  expectedChar: string;
  count: number;
  wrongInputs: Record<string, number>;
  lastObservedAt: number;
};

export type MistakeTrendRecord = {
  version: typeof MISTAKE_TRENDS_VERSION;
  items: MistakeTrendBucket[];
};

export type MistakeTrendSummary = {
  expectedChar: string;
  count: number;
  dominantWrongInput: string | null;
  dominantWrongInputCount: number;
  lastObservedAt: number;
};

export function createEmptyMistakeTrendRecord(): MistakeTrendRecord {
  return {
    version: MISTAKE_TRENDS_VERSION,
    items: []
  };
}

export function loadMistakeTrendRecord(storage: Storage): MistakeTrendRecord {
  const rawRecord = storage.getItem(MISTAKE_TRENDS_STORAGE_KEY);

  if (!rawRecord) {
    return createEmptyMistakeTrendRecord();
  }

  try {
    const parsedRecord = JSON.parse(rawRecord) as Partial<MistakeTrendRecord>;

    if (!parsedRecord || parsedRecord.version !== MISTAKE_TRENDS_VERSION || !Array.isArray(parsedRecord.items)) {
      return createEmptyMistakeTrendRecord();
    }

    return {
      version: MISTAKE_TRENDS_VERSION,
      items: parsedRecord.items.filter(isValidBucket).map((item) => ({
        expectedChar: item.expectedChar,
        count: item.count,
        wrongInputs: item.wrongInputs,
        lastObservedAt: item.lastObservedAt
      }))
    };
  } catch {
    return createEmptyMistakeTrendRecord();
  }
}

export function persistMistakeTrendRecord(storage: Storage, record: MistakeTrendRecord): void {
  storage.setItem(MISTAKE_TRENDS_STORAGE_KEY, JSON.stringify(record));
}

export function updateMistakeTrendRecord(
  previous: MistakeTrendRecord | null,
  samples: MistakeSample[],
  observedAt = Date.now()
): MistakeTrendRecord {
  const nextRecord = previous ?? createEmptyMistakeTrendRecord();
  const nextItems = nextRecord.items.map((item) => ({
    ...item,
    wrongInputs: { ...item.wrongInputs }
  }));

  for (const sample of samples) {
    const expectedChar = sample.expectedChar;

    if (expectedChar.length === 0) {
      continue;
    }

    const existingItem = nextItems.find((item) => item.expectedChar === expectedChar);
    const targetItem =
      existingItem ??
      {
        expectedChar,
        count: 0,
        wrongInputs: {},
        lastObservedAt: observedAt
      };

    targetItem.count += 1;
    targetItem.lastObservedAt = observedAt;
    targetItem.wrongInputs[sample.typedChar] = (targetItem.wrongInputs[sample.typedChar] ?? 0) + 1;

    if (!existingItem) {
      nextItems.push(targetItem);
    }
  }

  return {
    version: MISTAKE_TRENDS_VERSION,
    items: nextItems
  };
}

export function summarizeMistakeTrendRecord(
  record: MistakeTrendRecord | null,
  limit = 5
): MistakeTrendSummary[] {
  return (record?.items ?? [])
    .map((item) => {
      const dominantWrongInput = Object.entries(item.wrongInputs).sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0], "ja");
      })[0];

      return {
        expectedChar: item.expectedChar,
        count: item.count,
        dominantWrongInput: dominantWrongInput?.[0] ?? null,
        dominantWrongInputCount: dominantWrongInput?.[1] ?? 0,
        lastObservedAt: item.lastObservedAt
      };
    })
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.expectedChar.localeCompare(right.expectedChar, "ja");
    })
    .slice(0, limit);
}

export function formatMistakeTarget(char: string): string {
  if (char === " ") {
    return "空白";
  }

  if (char === "\n") {
    return "改行";
  }

  if (char === "\t") {
    return "タブ";
  }

  return char;
}

function isValidBucket(value: Partial<MistakeTrendBucket>): value is MistakeTrendBucket {
  return (
    typeof value.expectedChar === "string" &&
    typeof value.count === "number" &&
    typeof value.wrongInputs === "object" &&
    value.wrongInputs !== null &&
    typeof value.lastObservedAt === "number"
  );
}
