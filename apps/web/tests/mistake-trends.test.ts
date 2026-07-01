import { describe, expect, it } from "vitest";
import { advanceProgressWithMistakes, createEmptyProgress } from "../app/_lib/typing-progress";
import {
  formatMistakeTarget,
  loadMistakeTrendRecord,
  persistMistakeTrendRecord,
  summarizeMistakeTrendRecord,
  updateMistakeTrendRecord,
  type MistakeTrendRecord
} from "../lib/mistake-trends";

describe("mistake trends", () => {
  it("collects mistake samples from typed text", () => {
    const result = advanceProgressWithMistakes(createEmptyProgress(), "abcd", "axb");

    expect(result.progress.progressIndex).toBe(2);
    expect(result.progress.mistakes).toBe(1);
    expect(result.mistakeSamples).toEqual([{ expectedChar: "b", typedChar: "x" }]);
  });

  it("aggregates and sorts mistake trends", () => {
    const initial: MistakeTrendRecord = {
      version: 1,
      items: [
        {
          expectedChar: "か",
          count: 1,
          wrongInputs: { k: 1 },
          lastObservedAt: 10
        }
      ]
    };

    const updated = updateMistakeTrendRecord(initial, [
      { expectedChar: "か", typedChar: "l" },
      { expectedChar: "し", typedChar: "s" },
      { expectedChar: "し", typedChar: "a" },
      { expectedChar: "し", typedChar: "q" }
    ]);

    const summary = summarizeMistakeTrendRecord(updated);

    expect(summary).toEqual([
      {
        expectedChar: "し",
        count: 3,
        dominantWrongInput: "a",
        dominantWrongInputCount: 1,
        lastObservedAt: expect.any(Number)
      },
      {
        expectedChar: "か",
        count: 2,
        dominantWrongInput: "k",
        dominantWrongInputCount: 1,
        lastObservedAt: expect.any(Number)
      }
    ]);
  });

  it("formats visible labels for whitespace", () => {
    expect(formatMistakeTarget(" ")).toBe("空白");
    expect(formatMistakeTarget("\n")).toBe("改行");
    expect(formatMistakeTarget("a")).toBe("a");
  });

  it("persists and restores records from storage", () => {
    const storage = createMemoryStorage();
    const record = updateMistakeTrendRecord(null, [{ expectedChar: "a", typedChar: "x" }], 123);

    persistMistakeTrendRecord(storage, record);

    expect(loadMistakeTrendRecord(storage)).toEqual(record);
  });
});

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    }
  };
}
