import { describe, expect, it } from "vitest";
import { getInputGuideUnitIndex } from "../app/_lib/input-guide-progress";
import { buildRomajiTypingPlan } from "../app/_lib/romaji-typing";

describe("input guide progress", () => {
  it("maps canonical kana progress to the next romaji guide unit", () => {
    const plan = buildRomajiTypingPlan("かき");

    expect(getInputGuideUnitIndex(plan, 0, "かき")).toBe(0);
    expect(getInputGuideUnitIndex(plan, 1, "かき")).toBe(1);
    expect(getInputGuideUnitIndex(plan, 2, "かき")).toBe(2);
  });

  it("keeps a multi-kana unit current until the canonical unit is complete", () => {
    const plan = buildRomajiTypingPlan("しゅう");

    expect(plan.units.map((unit) => unit.hiragana)).toEqual(["しゅ", "う"]);
    expect(getInputGuideUnitIndex(plan, 0, "しゅう")).toBe(0);
    expect(getInputGuideUnitIndex(plan, 1, "しゅう")).toBe(0);
    expect(getInputGuideUnitIndex(plan, 2, "しゅう")).toBe(1);
    expect(getInputGuideUnitIndex(plan, 3, "しゅう")).toBe(2);
  });

  it("continues to use romaji guide progress for romaji input", () => {
    const plan = buildRomajiTypingPlan("かき");

    expect(plan.guide).toBe("kaki");
    expect(getInputGuideUnitIndex(plan, 0, plan.guide)).toBe(0);
    expect(getInputGuideUnitIndex(plan, 1, plan.guide)).toBe(0);
    expect(getInputGuideUnitIndex(plan, 2, plan.guide)).toBe(1);
    expect(getInputGuideUnitIndex(plan, 4, plan.guide)).toBe(2);
  });
});
