import { describe, expect, it } from "vitest";
import {
  createTimeAttackPromptSequence,
  getTimeAttackPromptPosition,
  getTimeAttackPromptPositionByGuide,
  getTimeAttackPromptSequence,
  getTimeAttackPromptTotalLength,
  PROMPTS,
  resolveTimeAttackPrompts
} from "../src/index.js";
import type { Prompt } from "../src/index.js";

const prompts: Prompt[] = [
  { id: "a", text: "A", category: "short", typing: { hiragana: "あい", romaji: "ai" } },
  { id: "b", text: "B", category: "short", typing: { hiragana: "うえお", romaji: "ueo" } }
];

describe("time attack prompt sequence", () => {
  it("moves to a different prompt while keeping cumulative progress", () => {
    expect(getTimeAttackPromptPosition(prompts, 0)).toMatchObject({ promptIndex: 0, progressIndex: 0, completedPrompts: 0 });
    expect(getTimeAttackPromptPosition(prompts, 2)).toMatchObject({ promptIndex: 1, progressIndex: 0, completedPrompts: 1 });
    expect(getTimeAttackPromptPosition(prompts, 4)).toMatchObject({ promptIndex: 1, progressIndex: 2, completedPrompts: 1 });
  });

  it("does not wrap to a repeated prompt after the sequence is exhausted", () => {
    expect(getTimeAttackPromptPosition(prompts, 99)).toMatchObject({ promptIndex: 1, progressIndex: 3, completedPrompts: 2 });
  });

  it("calculates the canonical length of the whole sequence", () => {
    expect(getTimeAttackPromptTotalLength(prompts)).toBe(5);
  });

  it("creates a stable non-duplicated order", () => {
    const sequence = getTimeAttackPromptSequence(prompts, 1);
    expect(sequence.map((prompt) => prompt.id)).toEqual(["b", "a"]);
    expect(new Set(sequence.map((prompt) => prompt.id)).size).toBe(sequence.length);
  });

  it("starts with the selected category, then uses every enabled prompt at most once", () => {
    const firstPrompt = PROMPTS.find((prompt) => prompt.category === "standard")!;
    const sequence = createTimeAttackPromptSequence(firstPrompt, "standard", 7);
    const firstOtherCategoryIndex = sequence.findIndex((prompt) => prompt.category !== "standard");

    expect(sequence[0]?.id).toBe(firstPrompt.id);
    expect(firstOtherCategoryIndex).toBeGreaterThan(1);
    expect(sequence.slice(0, firstOtherCategoryIndex).every(
      (prompt) => prompt.category === "standard"
    )).toBe(true);
    expect(new Set(sequence.map((prompt) => prompt.id)).size).toBe(sequence.length);
    expect(sequence).toHaveLength(PROMPTS.filter((prompt) => prompt.enabled !== false).length);
  });

  it("uses the generated guide length instead of trusting a stored romaji string", () => {
    const guidePrompts: Prompt[] = [
      {
        id: "guide-a",
        text: "A",
        category: "short",
        typing: { hiragana: "きゃ", romaji: "intentionally-different" }
      },
      prompts[1]!
    ];

    expect(getTimeAttackPromptPositionByGuide(guidePrompts, 3)).toMatchObject({
      promptIndex: 1,
      progressIndex: 0,
      completedPrompts: 1
    });
  });

  it("falls back to the snapshot prompt when compact ids are absent or unknown", () => {
    expect(resolveTimeAttackPrompts(undefined, prompts[0]!)).toEqual([prompts[0]]);
    expect(resolveTimeAttackPrompts(["missing"], prompts[0]!)).toEqual([prompts[0]]);
  });

  it("drops unknown and repeated ids while preserving the server order", () => {
    const known = PROMPTS.slice(0, 2);
    expect(resolveTimeAttackPrompts(
      [known[0]!.id, "missing", known[0]!.id, known[1]!.id],
      known[0]!
    ).map((prompt) => prompt.id)).toEqual([known[0]!.id, known[1]!.id]);
  });
});
