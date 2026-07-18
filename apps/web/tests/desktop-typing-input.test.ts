import { describe, expect, it } from "vitest";
import { shouldHandleDesktopTypingKey } from "../app/_lib/desktop-typing-input";

const keyDown = {
  roomPlaying: true,
  practiceActive: false,
  acceptingTextInput: true,
  roomFinishPending: false,
  exitRequested: false,
  defaultPrevented: false,
  isComposing: false,
  keyCode: 65,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  editableTarget: false,
  key: "a"
};

describe("desktop typing input", () => {
  it("rejects a queued room key synchronously after a race finish is emitted", () => {
    expect(shouldHandleDesktopTypingKey({
      ...keyDown,
      roomFinishPending: true
    })).toBe(false);
  });

  it("does not apply the room finish guard to practice input", () => {
    expect(shouldHandleDesktopTypingKey({
      ...keyDown,
      roomPlaying: false,
      practiceActive: true,
      roomFinishPending: true
    })).toBe(true);
  });

  it("accepts an ordinary printable room key while the race is active", () => {
    expect(shouldHandleDesktopTypingKey(keyDown)).toBe(true);
  });
});
