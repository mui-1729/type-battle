import { describe, expect, it } from "vitest";
import { buildRomajiTypingPlan } from "../app/_lib/romaji-typing";
import { advanceTypingProgress } from "../app/_lib/typing-input-strategy";
import { createEmptyProgress } from "../app/_lib/typing-progress";

const baseInput = {
  canonicalText: "あ",
  displayText: "a",
  loop: false
};

describe("typing input strategy", () => {
  it("advances mobile kana input against the canonical prompt", () => {
    const result = advanceTypingProgress({
      ...baseInput,
      previous: createEmptyProgress(),
      typedText: "あ",
      deviceKind: "mobile",
      displayText: "あ",
      romajiPlan: null
    });

    expect(result.progress).toMatchObject({
      progressIndex: 1,
      correctCharacters: 1,
      totalTypedCharacters: 1,
      mistakes: 0,
      pendingInput: ""
    });
    expect(result.mistakeSamples).toEqual([]);
  });

  it("keeps a partial romaji prefix pending", () => {
    const result = advanceTypingProgress({
      ...baseInput,
      previous: createEmptyProgress(),
      typedText: "k",
      deviceKind: "desktop",
      canonicalText: "か",
      displayText: "ka",
      romajiPlan: buildRomajiTypingPlan("か")
    });

    expect(result.progress).toMatchObject({
      progressIndex: 0,
      correctCharacters: 1,
      totalTypedCharacters: 1,
      mistakes: 0,
      pendingInput: "k"
    });
    expect(result.mistakeSamples).toEqual([]);
  });

  it("converts desktop kana input back to the romaji progress index", () => {
    const plan = buildRomajiTypingPlan("あ");
    const result = advanceTypingProgress({
      ...baseInput,
      previous: createEmptyProgress(),
      typedText: "あ",
      deviceKind: "desktop",
      romajiPlan: plan
    });

    expect(result.progress).toMatchObject({
      progressIndex: plan.guide.length,
      correctCharacters: 1,
      totalTypedCharacters: 1,
      mistakes: 0
    });
  });

  it("loops romaji progress for time attack input", () => {
    const plan = buildRomajiTypingPlan("あ");
    const result = advanceTypingProgress({
      ...baseInput,
      previous: createEmptyProgress(),
      typedText: "aa",
      deviceKind: "desktop",
      romajiPlan: plan,
      loop: true
    });

    expect(result.progress).toMatchObject({
      progressIndex: 2,
      correctCharacters: 2,
      totalTypedCharacters: 2,
      mistakes: 0
    });
  });

  it("records a mistake in the fallback canonical strategy", () => {
    const result = advanceTypingProgress({
      ...baseInput,
      previous: createEmptyProgress(),
      typedText: "い",
      deviceKind: "desktop",
      canonicalText: "あ",
      displayText: "あ",
      romajiPlan: null
    });

    expect(result.progress).toMatchObject({
      progressIndex: 0,
      correctCharacters: 0,
      totalTypedCharacters: 1,
      mistakes: 1,
      pendingInput: ""
    });
    expect(result.mistakeSamples).toEqual([{ expectedChar: "あ", typedChar: "い" }]);
  });
});
