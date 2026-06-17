import { describe, expect, it } from "vitest";
import { PROMPTS, pickPrompt, validatePrompt } from "../src";

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
});
