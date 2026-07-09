import { describe, expect, it } from "vitest";
import { PROMPTS, getDailyChallengeInfo, pickDailyChallengePrompt, pickPrompt, validatePrompt, type Prompt } from "../src/index.js";

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

  it("rejects prompts that are too short, too long, or disabled", () => {
    expect(
      validatePrompt({
        id: "short",
        text: "a",
        category: "short",
        typing: {
          romaji: "a",
          hiragana: "あ"
        }
      })
    ).toBe("課題文は2文字以上にしてください。");

    expect(
      validatePrompt({
        id: "disabled",
        text: "有効",
        category: "short",
        enabled: false,
        typing: {
          romaji: "yuukou",
          hiragana: "ゆうこう"
        }
      })
    ).toBe("課題文は無効化されています。");

    expect(
      validatePrompt({
        id: "long",
        text: "あ".repeat(241),
        category: "standard",
        typing: {
          romaji: "a".repeat(241),
          hiragana: "あ".repeat(241)
        }
      })
    ).toBe("課題文は240文字以内にしてください。");
  });

  it("accepts prompts at the boundary lengths and rejects control characters", () => {
    expect(
      validatePrompt({
        id: "boundary",
        text: "ああ",
        category: "short",
        typing: {
          romaji: "aa",
          hiragana: "ああ"
        }
      })
    ).toBeNull();

    expect(
      validatePrompt({
        id: "boundary-long",
        text: "あ".repeat(240),
        category: "standard",
        typing: {
          romaji: "a".repeat(240),
          hiragana: "あ".repeat(240)
        }
      })
    ).toBeNull();

    expect(
      validatePrompt({
        id: "control-text",
        text: "あ\nい",
        category: "short",
        typing: {
          romaji: "ai",
          hiragana: "あい"
        }
      })
    ).toBe("課題文に改行や制御文字を含めないでください。");

    expect(
      validatePrompt({
        id: "control-guide",
        text: "有効",
        category: "short",
        typing: {
          romaji: "a\ti",
          hiragana: "あい"
        }
      })
    ).toBe("入力ガイドに改行や制御文字を含めないでください。");
  });

  it("skips invalid prompts when selecting from a prompt pool", () => {
    const invalidPrompt = {
      id: "invalid",
      text: "無効",
      category: "short",
      enabled: false,
      typing: {
        romaji: "mukou",
        hiragana: "むこう"
      }
    } satisfies Prompt;
    const validPrompt = {
      id: "valid",
      text: "有効",
      category: "short",
      typing: {
        romaji: "yuukou",
        hiragana: "ゆうこう"
      }
    } satisfies Prompt;

    expect(pickPrompt("short", 0, [], [invalidPrompt, validPrompt]).id).toBe("valid");
  });

  it("falls back to a valid standard prompt when the requested category has none", () => {
    const invalidShortPrompt = {
      id: "invalid-short",
      text: "無効",
      category: "short",
      enabled: false,
      typing: {
        romaji: "mukou",
        hiragana: "むこう"
      }
    } satisfies Prompt;
    const validStandardPrompt = {
      id: "valid-standard",
      text: "有効",
      category: "standard",
      typing: {
        romaji: "yuukou",
        hiragana: "ゆうこう"
      }
    } satisfies Prompt;

    expect(pickPrompt("short", 0, [], [invalidShortPrompt, validStandardPrompt]).id).toBe("valid-standard");
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
