import { describe, expect, it } from "vitest";
import { isValidRoomCode, validateRoomCode } from "../src/validation.js";

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
