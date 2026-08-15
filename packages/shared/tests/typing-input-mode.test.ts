import { describe, expect, it } from "vitest";
import { resolveTypingInputMode } from "../src/typing-input-mode";

describe("typing input mode", () => {
  it.each(["、", "。", "！", "？", ",", ".", "!", "?", " ", "-"])(
    "keeps kana mode for neutral input %s",
    (value) => {
      expect(resolveTypingInputMode("kana", value)).toBe("kana");
    }
  );

  it.each(["、", "。", ",", ".", " ", "-"])(
    "keeps romaji mode for neutral input %s",
    (value) => {
      expect(resolveTypingInputMode("romaji", value)).toBe("romaji");
    }
  );

  it("switches to kana when kana text arrives", () => {
    expect(resolveTypingInputMode("romaji", "か")).toBe("kana");
  });

  it("switches to romaji when latin text arrives", () => {
    expect(resolveTypingInputMode("kana", "k")).toBe("romaji");
  });

  it("treats the Japanese prolonged sound mark as kana", () => {
    expect(resolveTypingInputMode("romaji", "ー")).toBe("kana");
  });
});
