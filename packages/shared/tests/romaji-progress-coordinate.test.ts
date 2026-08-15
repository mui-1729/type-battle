import { describe, expect, it } from "vitest";
import {
  buildRomajiTypingPlan,
  getCanonicalProgressForRomajiGuide
} from "../src/index.js";

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

  it("does not double-count canonical progress already reached before a mode switch", () => {
    const plan = buildRomajiTypingPlan("しゅう");
    const canonicalBeforeSwitch = 1;
    const canonicalTargetAfterRomajiUnit = getCanonicalProgressForRomajiGuide(plan, 3);

    expect(canonicalTargetAfterRomajiUnit).toBe(2);
    expect(Math.max(canonicalTargetAfterRomajiUnit - canonicalBeforeSwitch, 0)).toBe(1);
  });

  it("does not award extra progress when canonical state is already at the unit boundary", () => {
    const plan = buildRomajiTypingPlan("しゅう");
    const canonicalBeforeSwitch = 2;
    const canonicalTargetAfterRomajiUnit = getCanonicalProgressForRomajiGuide(plan, 3);

    expect(Math.max(canonicalTargetAfterRomajiUnit - canonicalBeforeSwitch, 0)).toBe(0);
  });

  it("maps looping guide cycles to cumulative canonical progress", () => {
    const plan = buildRomajiTypingPlan("しゅう");

    expect(getCanonicalProgressForRomajiGuide(plan, 4, true)).toBe(3);
    expect(getCanonicalProgressForRomajiGuide(plan, 7, true)).toBe(5);
    expect(getCanonicalProgressForRomajiGuide(plan, 8, true)).toBe(6);
  });
});
