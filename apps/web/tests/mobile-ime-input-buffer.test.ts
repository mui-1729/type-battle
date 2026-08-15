import { describe, expect, it } from "vitest";
import {
  beginMobileComposition,
  createMobileInputBufferState,
  type MobileInputContext
} from "../app/_lib/mobile-input-buffer";
import { updateMobileImeInputBuffer } from "../app/_lib/mobile-ime-input-buffer";

const baseContext: MobileInputContext = {
  expectedText: "か",
  progressIndex: 0,
  acceptingInput: true,
  inputKey: "round-1"
};

describe("mobile IME input buffer", () => {
  it("does not consume a matching character before IME commit", () => {
    const state = beginMobileComposition(createMobileInputBufferState(0), baseContext);
    const provisional = updateMobileImeInputBuffer(state, {
      ...baseContext,
      value: "か",
      composing: true
    });

    expect(provisional.emittedText).toBe("");
    expect(provisional.state.optimisticProgressIndex).toBe(0);
  });

  it("scores the transformed final character instead of the provisional match", () => {
    let state = beginMobileComposition(createMobileInputBufferState(0), baseContext);
    const provisional = updateMobileImeInputBuffer(state, {
      ...baseContext,
      value: "か",
      composing: true
    });
    state = provisional.state;

    const transformed = updateMobileImeInputBuffer(state, {
      ...baseContext,
      value: "が",
      composing: true
    });
    expect(transformed.emittedText).toBe("");

    const committed = updateMobileImeInputBuffer(transformed.state, {
      ...baseContext,
      value: "が",
      composing: false,
      commit: true
    });

    expect(committed.emittedText).toBe("が");
    expect(committed.state.optimisticProgressIndex).toBe(0);
  });

  it("emits a matching character exactly once when composition commits unchanged", () => {
    let state = beginMobileComposition(createMobileInputBufferState(0), baseContext);
    const provisional = updateMobileImeInputBuffer(state, {
      ...baseContext,
      value: "か",
      composing: true
    });
    state = provisional.state;

    const committed = updateMobileImeInputBuffer(state, {
      ...baseContext,
      value: "か",
      composing: false,
      commit: true
    });

    expect(provisional.emittedText).toBe("");
    expect(committed.emittedText).toBe("か");
    expect(committed.state.optimisticProgressIndex).toBe(1);
  });

  it("streams stable composition prefix while keeping the mutable tail deferred", () => {
    const context = { ...baseContext, expectedText: "がぱ" };
    let state = beginMobileComposition(createMobileInputBufferState(0), context);

    const first = updateMobileImeInputBuffer(state, {
      ...context,
      value: "が",
      composing: true
    });
    expect(first.emittedText).toBe("");
    state = first.state;

    const second = updateMobileImeInputBuffer(state, {
      ...context,
      value: "がぱ",
      composing: true
    });
    expect(second.emittedText).toBe("が");
    state = second.state;

    const committed = updateMobileImeInputBuffer(state, {
      ...context,
      value: "がぱ",
      composing: false,
      commit: true
    });
    expect(committed.emittedText).toBe("ぱ");
  });
});
