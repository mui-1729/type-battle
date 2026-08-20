import { describe, expect, it } from "vitest";
import {
  isValidRoomCode,
  normalizeNickname,
  validateNickname,
  validateRoomCode,
} from "../src/validation.js";

describe("room code validation", () => {
  it("accepts the generated room code alphabet", () => {
    expect(isValidRoomCode("AB23CD")).toBe(true);
    expect(isValidRoomCode(" ab23cd ")).toBe(true);
    expect(validateRoomCode("XY987Z")).toBeNull();
  });

  it("rejects ambiguous characters and invalid lengths", () => {
    expect(isValidRoomCode("AB12CD")).toBe(false);
    expect(isValidRoomCode("AB0OCD")).toBe(false);
    expect(isValidRoomCode("ABCDE")).toBe(false);
    expect(validateRoomCode("AB12CD")).toBe("ルームコードの形式が正しくありません。");
  });
});

describe("nickname validation", () => {
  it("keeps normal Japanese and latin nicknames usable", () => {
    expect(normalizeNickname("  Alice   Bob  ")).toBe("Alice Bob");
    expect(validateNickname("Alice_02")).toBeNull();
    expect(validateNickname("タイピング太郎")).toBeNull();
    expect(validateNickname("🎮Player")).toBeNull();
  });

  it("rejects empty and overlong nicknames", () => {
    expect(validateNickname("   ")).toBe("ニックネームを入力してください。");
    expect(validateNickname("あ".repeat(19))).toBe("ニックネームは18文字以内にしてください。");
  });

  it("rejects control, bidi, and zero-width display spoofing characters", () => {
    for (const nickname of ["Alice\nBob", "Alice\u200BBob", "Alice\u202EBob", "Alice\u2066Bob"]) {
      expect(validateNickname(nickname)).toBe("表示に使用できない文字が含まれています。");
    }
  });

  it("rejects links and contact information", () => {
    for (const nickname of [
      "https://example.com",
      "www.example.jp",
      "discord.gg/example",
      "name@example.com",
    ]) {
      expect(validateNickname(nickname)).toBe("URLや連絡先はニックネームに使用できません。");
    }
  });

  it("rejects canonicalized reserved and high-confidence blocked names", () => {
    for (const nickname of [
      "ＡＤＭＩＮ",
      "Type Battle 公式",
      "運営",
      "死ね",
      "ＦＵＣＫ－ＹＯＵ",
    ]) {
      expect(validateNickname(nickname)).toBe("このニックネームは使用できません。");
    }
  });
});
