import { describe, expect, it } from "vitest";
import { PROMPTS, getDailyChallengeInfo, pickDailyChallengePrompt, pickPrompt, validatePrompt } from "../src/index.js";

describe("prompts", () => {
  it("validates the bundled prompts", () => {
    for (const prompt of PROMPTS) {
      expect(validatePrompt(prompt)).toBeNull();
    }
  });

  it("avoids repeating an excluded prompt when another option exists", () => {
    const firstShortPrompt = pickPrompt("short", 0);
    const nextShortPrompt = pickPrompt("short", 0, [firstShortPrompt.id]);

    expect(nextShortPrompt.id).not.toBe(firstShortPrompt.id);
  });

  it("rejects prompts with empty fields", () => {
    expect(
      validatePrompt({
        id: "",
        text: "",
        category: "standard",
        typing: {
          romaji: "",
          hiragana: ""
        }
      })
    ).toBe("prompt id を入力してください。");
  });

  it("creates a deterministic daily challenge key and prompt", () => {
    const date = new Date("2026-07-01T03:00:00Z");

    expect(getDailyChallengeInfo(date)).toEqual({
      challengeKey: "2026-07-01",
      seed: expect.any(Number)
    });

    const firstDailyPrompt = pickDailyChallengePrompt(date);
    const secondDailyPrompt = pickDailyChallengePrompt(date);

    expect(firstDailyPrompt).toEqual(secondDailyPrompt);
    expect(firstDailyPrompt.category).toBe("standard");
  });
});
