import { describe, expect, it } from "vitest";
import {
  getTimeAttackPromptPosition,
  getTimeAttackPromptSequence,
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

  it("creates a stable non-duplicated order", () => {
    const sequence = getTimeAttackPromptSequence(prompts, 1);
    expect(sequence.map((prompt) => prompt.id)).toEqual(["b", "a"]);
    expect(new Set(sequence.map((prompt) => prompt.id)).size).toBe(sequence.length);
  });

  it("falls back to the snapshot prompt when compact ids are absent or unknown", () => {
    expect(resolveTimeAttackPrompts(undefined, prompts[0]!)).toEqual([prompts[0]]);
    expect(resolveTimeAttackPrompts(["missing"], prompts[0]!)).toEqual([prompts[0]]);
  });
});
