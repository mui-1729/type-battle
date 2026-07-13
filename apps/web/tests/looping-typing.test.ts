import { describe, expect, it } from "vitest";
import { buildRomajiTypingPlan } from "../app/_lib/romaji-typing";
import {
  advanceLoopingRomajiProgressWithMistakes,
  getCanonicalProgressIndex,
  getRomajiProgressIndexForCanonicalProgress
} from "../app/_lib/looping-typing";
import { createEmptyProgress } from "../app/_lib/typing-progress";

describe("looping typing", () => {
  it("continues across the end of a romaji plan", () => {
    const plan = buildRomajiTypingPlan("かな");
    const firstCycle = advanceLoopingRomajiProgressWithMistakes(
      createEmptyProgress(),
      plan,
      plan.guide
    ).progress;
    const next = advanceLoopingRomajiProgressWithMistakes(firstCycle, plan, "k").progress;

    expect(firstCycle.progressIndex).toBe(plan.guide.length);
    expect(next.progressIndex).toBe(plan.guide.length);
    expect(next.pendingInput).toBe("k");
    expect(next.totalTypedCharacters).toBe(plan.guide.length + 1);
  });

  it("counts canonical kana equally for accepted romaji variants", () => {
    const plan = buildRomajiTypingPlan("し");
    const shi = advanceLoopingRomajiProgressWithMistakes(createEmptyProgress(), plan, "shi").progress;
    const si = advanceLoopingRomajiProgressWithMistakes(createEmptyProgress(), plan, "si").progress;

    expect(getCanonicalProgressIndex(plan, shi.progressIndex)).toBe(1);
    expect(getCanonicalProgressIndex(plan, si.progressIndex)).toBe(1);
  });

  it("converts canonical progress back to the display guide across cycles", () => {
    const plan = buildRomajiTypingPlan("きゃく");
    const canonicalLength = Array.from("きゃく").length;

    expect(getRomajiProgressIndexForCanonicalProgress(plan, canonicalLength)).toBe(plan.guide.length);
    expect(getCanonicalProgressIndex(plan, plan.guide.length)).toBe(canonicalLength);
  });
});