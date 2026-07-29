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

  it("loops romaji progress across two prompt cycles", () => {
    const plan = buildRomajiTypingPlan("あ");
    const result = advanceTypingProgress({
      ...baseInput,
      previous: createEmptyProgress(),
      typedText: "aaa",
      deviceKind: "desktop",
      romajiPlan: plan,
      loop: true
    });

    expect(result.progress).toMatchObject({
      progressIndex: 3,
      correctCharacters: 3,
      totalTypedCharacters: 3,
      mistakes: 0
    });
  });

  it("loops kana progress across two prompt cycles", () => {
    const result = advanceTypingProgress({
      ...baseInput,
      previous: createEmptyProgress(),
      typedText: "かなか",
      deviceKind: "mobile",
      canonicalText: "かな",
      displayText: "かな",
      romajiPlan: null,
      loop: true
    });

    expect(result.progress).toMatchObject({
      progressIndex: 3,
      correctCharacters: 3,
      totalTypedCharacters: 3,
      mistakes: 0
    });
  });

  it("advances from a cumulative base without wrapping to the previous prompt", () => {
    const result = advanceTypingProgress({
      ...baseInput,
      previous: {
        ...createEmptyProgress(),
        progressIndex: 3,
        correctCharacters: 3,
        totalTypedCharacters: 3
      },
      typedText: "u",
      deviceKind: "desktop",
      canonicalText: "う",
      displayText: "u",
      romajiPlan: buildRomajiTypingPlan("う"),
      progressBase: 3
    });

    expect(result.progress).toMatchObject({
      progressIndex: 4,
      correctCharacters: 4,
      totalTypedCharacters: 4,
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
