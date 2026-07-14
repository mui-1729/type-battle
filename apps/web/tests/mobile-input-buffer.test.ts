import { describe, expect, it } from "vitest";
import {
  beginMobileComposition,
  createMobileInputBufferState,
  synchronizeMobileInputBuffer,
  updateMobileInputBuffer,
  type MobileInputContext
} from "../app/_lib/mobile-input-buffer";

const baseContext: MobileInputContext = {
  expectedText: "がぱっゃ",
  progressIndex: 0,
  acceptingInput: true,
  inputKey: "round-1"
};

describe("mobile input buffer", () => {
  it.each([
    ["か", "が"],
    ["は", "ぱ"],
    ["つ", "っ"],
    ["や", "ゃ"]
  ])("defers %s until it is transformed to %s", (intermediate, completed) => {
    let state = createMobileInputBufferState(0);
    const context = { ...baseContext, expectedText: completed };

    const provisional = updateMobileInputBuffer(state, {
      ...context,
      value: intermediate,
      composing: false
    });
    expect(provisional.emittedText).toBe("");
    expect(provisional.clearValue).toBe(false);

    state = provisional.state;
    const final = updateMobileInputBuffer(state, {
      ...context,
      value: completed,
      composing: false
    });
    expect(final.emittedText).toBe(completed);
    expect(final.clearValue).toBe(true);
  });

  it("emits composition updates without duplicating compositionend", () => {
    const context = { ...baseContext, expectedText: "がぱ" };
    let state = beginMobileComposition(createMobileInputBufferState(0), context);

    const first = updateMobileInputBuffer(state, {
      ...context,
      value: "が",
      composing: true
    });
    expect(first.emittedText).toBe("が");

    state = first.state;
    const second = updateMobileInputBuffer(state, {
      ...context,
      value: "がぱ",
      composing: true
    });
    expect(second.emittedText).toBe("ぱ");

    const settled = updateMobileInputBuffer(second.state, {
      ...context,
      value: "がぱ",
      composing: false,
      commit: true
    });
    expect(settled.emittedText).toBe("");
    expect(settled.clearValue).toBe(true);
  });

  it("does not score a provisional character that is cancelled", () => {
    const context = { ...baseContext, expectedText: "が" };
    const provisional = updateMobileInputBuffer(createMobileInputBufferState(0), {
      ...context,
      value: "か",
      composing: true
    });
    const cancelled = updateMobileInputBuffer(provisional.state, {
      ...context,
      value: "",
      composing: true
    });

    expect(provisional.emittedText).toBe("");
    expect(cancelled.emittedText).toBe("");
  });

  it("commits an unresolved wrong character exactly once", () => {
    const context = { ...baseContext, expectedText: "が" };
    const provisional = updateMobileInputBuffer(createMobileInputBufferState(0), {
      ...context,
      value: "か",
      composing: true
    });
    const committed = updateMobileInputBuffer(provisional.state, {
      ...context,
      value: "か",
      composing: false,
      commit: true
    });

    expect(committed.emittedText).toBe("か");
    expect(committed.clearValue).toBe(true);
  });

  it("discards countdown input when scoring is disabled", () => {
    const result = updateMobileInputBuffer(createMobileInputBufferState(0), {
      ...baseContext,
      acceptingInput: false,
      value: "が",
      composing: false
    });

    expect(result.emittedText).toBe("");
    expect(result.clearValue).toBe(true);
  });

  it("resets buffered composition when the prompt generation changes", () => {
    const context = { ...baseContext, expectedText: "が" };
    const provisional = updateMobileInputBuffer(createMobileInputBufferState(0), {
      ...context,
      value: "か",
      composing: true
    });
    const synchronized = synchronizeMobileInputBuffer(provisional.state, {
      ...context,
      inputKey: "round-2"
    });

    expect(synchronized.clearValue).toBe(true);
    expect(synchronized.state.handledValue).toBe("");
  });

  it("wraps the expected cursor for time attack", () => {
    const result = updateMobileInputBuffer(createMobileInputBufferState(2), {
      ...baseContext,
      expectedText: "かな",
      progressIndex: 2,
      loop: true,
      value: "か",
      composing: false
    });

    expect(result.emittedText).toBe("か");
    expect(result.state.optimisticProgressIndex).toBe(3);
  });
});