import { describe, expect, it } from "vitest";
import {
  buildRomajiTypingPlan,
  getCanonicalProgressForRomajiGuide
} from "../src/index";

describe("romaji progress coordinate", () => {
  it("keeps canonical progress at the unit start while a digraph is partial", () => {
    const plan = buildRomajiTypingPlan("しゅう");

    expect(getCanonicalProgressForRomajiGuide(plan, 0)).toBe(0);
    expect(getCanonicalProgressForRomajiGuide(plan, 1)).toBe(0);
    expect(getCanonicalProgressForRomajiGuide(plan, 2)).toBe(0);
  });

  it("moves to the complete canonical digraph boundary when the unit completes", () => {
    const plan = buildRomajiTypingPlan("しゅう");

    expect(getCanonicalProgressForRomajiGuide(plan, 3)).toBe(2);
    expect(getCanonicalProgressForRomajiGuide(plan, 4)).toBe(3);
  });

  it("maps looping guide cycles to cumulative canonical progress", () => {
    const plan = buildRomajiTypingPlan("しゅう");

    expect(getCanonicalProgressForRomajiGuide(plan, 4, true)).toBe(3);
    expect(getCanonicalProgressForRomajiGuide(plan, 7, true)).toBe(5);
    expect(getCanonicalProgressForRomajiGuide(plan, 8, true)).toBe(6);
  });
});
