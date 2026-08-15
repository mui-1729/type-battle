import { describe, expect, it } from "vitest";
import { getScrollTopToRevealTarget } from "../app/_lib/scroll-visibility";

describe("scroll visibility", () => {
  it("aligns an obscured target to the visible container top", () => {
    expect(getScrollTopToRevealTarget({
      scrollTop: 40,
      containerTop: 80,
      containerBottom: 500,
      targetTop: 430,
      targetBottom: 614,
      padding: 12
    })).toBe(378);
  });

  it("scrolls up when the target is above the visible container", () => {
    expect(getScrollTopToRevealTarget({
      scrollTop: 120,
      containerTop: 80,
      containerBottom: 500,
      targetTop: 60,
      targetBottom: 140,
      padding: 12
    })).toBe(88);
  });

  it("does not move an already visible target", () => {
    expect(getScrollTopToRevealTarget({
      scrollTop: 72,
      containerTop: 80,
      containerBottom: 500,
      targetTop: 120,
      targetBottom: 460,
      padding: 12
    })).toBe(72);
  });

  it("never returns a negative scroll position", () => {
    expect(getScrollTopToRevealTarget({
      scrollTop: 4,
      containerTop: 80,
      containerBottom: 500,
      targetTop: 0,
      targetBottom: 100,
      padding: 12
    })).toBe(0);
  });
});
