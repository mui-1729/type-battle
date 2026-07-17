import { describe, expect, it } from "vitest";
import { PROMPTS } from "@type-battle/shared";
import {
  advanceRomajiProgressByText,
  advanceRomajiProgressWithMistakes,
  buildRomajiTypingPlan,
  pickRomajiDisplayCandidate
} from "../app/_lib/romaji-typing";
import { createEmptyProgress } from "../app/_lib/typing-progress";

describe("romaji typing", () => {
  it("matches the current prompt guide text", () => {
    for (const prompt of PROMPTS) {
      const plan = buildRomajiTypingPlan(prompt.typing.hiragana);
      expect(plan.guide).toBe(prompt.typing.romaji);
    }
  });

  it("accepts chi and ti for ち", () => {
    const plan = buildRomajiTypingPlan("ち");

    const chi = advanceRomajiProgressByText(createEmptyProgress(), plan, "chi");
    expect(chi.progressIndex).toBe(plan.guide.length);
    expect(chi.correctCharacters).toBe(3);
    expect(chi.mistakes).toBe(0);

    const ti = advanceRomajiProgressByText(createEmptyProgress(), plan, "ti");
    expect(ti.progressIndex).toBe(plan.guide.length);
    expect(ti.correctCharacters).toBe(2);
    expect(ti.mistakes).toBe(0);
  });

  it("keeps romaji aliases working while collecting mistake samples", () => {
    const plan = buildRomajiTypingPlan("し");

    const si = advanceRomajiProgressWithMistakes(createEmptyProgress(), plan, "si");
    expect(si.progress.progressIndex).toBe(plan.guide.length);
    expect(si.progress.correctCharacters).toBe(2);
    expect(si.progress.mistakes).toBe(0);
    expect(si.mistakeSamples).toEqual([]);

    const wrong = advanceRomajiProgressWithMistakes(createEmptyProgress(), plan, "sx");
    expect(wrong.progress.progressIndex).toBe(0);
    expect(wrong.progress.mistakes).toBe(1);
    expect(wrong.mistakeSamples).toEqual([{ expectedChar: "し", typedChar: "x" }]);
  });

  it("keeps a valid prefix after a single wrong character", () => {
    const plan = buildRomajiTypingPlan("ち");
    const result = advanceRomajiProgressWithMistakes(createEmptyProgress(), plan, "toi");

    expect(result.progress.progressIndex).toBe(plan.guide.length);
    expect(result.progress.pendingInput).toBe("");
    expect(result.progress.correctCharacters).toBe(2);
    expect(result.progress.mistakes).toBe(1);
    expect(result.mistakeSamples).toEqual([{ expectedChar: "ち", typedChar: "o" }]);
  });

  it("accepts multiple romaji paths for しゅうちゅう", () => {
    const plan = buildRomajiTypingPlan("しゅうちゅう。");
    const progress = advanceRomajiProgressByText(createEmptyProgress(), plan, "syuuchyuu.");

    expect(progress.progressIndex).toBe(plan.guide.length);
    expect(progress.correctCharacters).toBe(10);
    expect(progress.mistakes).toBe(0);
  });

  it("accepts cchi and tti for っち", () => {
    const plan = buildRomajiTypingPlan("っち");

    const cchi = advanceRomajiProgressByText(createEmptyProgress(), plan, "cchi");
    expect(cchi.progressIndex).toBe(plan.guide.length);
    expect(cchi.correctCharacters).toBe(4);

    const tti = advanceRomajiProgressByText(createEmptyProgress(), plan, "tti");
    expect(tti.progressIndex).toBe(plan.guide.length);
    expect(tti.correctCharacters).toBe(3);
  });

  it("chooses a display candidate that matches the typed prefix", () => {
    const suPlan = buildRomajiTypingPlan("す");
    expect(pickRomajiDisplayCandidate(suPlan.units[0]!, "s")).toBe("su");

    const chiPlan = buildRomajiTypingPlan("ち");
    expect(pickRomajiDisplayCandidate(chiPlan.units[0]!, "t")).toBe("ti");
  });
});
