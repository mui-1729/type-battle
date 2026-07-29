import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_REACTION_FEEDBACK,
  REACTION_DISPLAY_MS,
  clearReactionDisplayTimer,
  createCooldownReactionFeedback,
  createReactionErrorFeedback,
  createSendingReactionFeedback,
  createSentReactionFeedback,
  isReactionInputDisabled,
  replaceReactionDisplayTimer
} from "../app/_lib/reaction-feedback";

describe("reaction feedback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("distinguishes sending, acknowledged cooldown, and idle states", () => {
    const sending = createSendingReactionFeedback("よろしく");
    const sent = createSentReactionFeedback("よろしく");
    const cooldown = createCooldownReactionFeedback();

    expect(sending).toMatchObject({ phase: "sending", reaction: "よろしく" });
    expect(sending.message).toContain("送信中");
    expect(sent).toMatchObject({ phase: "cooldown", reaction: "よろしく" });
    expect(sent.message).toContain("3秒後");
    expect(cooldown).toMatchObject({ phase: "cooldown", reaction: null });
    expect(isReactionInputDisabled(sending)).toBe(true);
    expect(isReactionInputDisabled(sent)).toBe(true);
    expect(isReactionInputDisabled(INITIAL_REACTION_FEEDBACK)).toBe(false);
  });

  it("keeps transport errors visible without locking reaction input", () => {
    const feedback = createReactionErrorFeedback("リアクションを送信できませんでした。");

    expect(feedback).toEqual({
      phase: "error",
      reaction: null,
      message: "リアクションを送信できませんでした。"
    });
    expect(isReactionInputDisabled(feedback)).toBe(false);
  });

  it("clears an incoming reaction after the display duration", () => {
    vi.useFakeTimers();
    let reaction: string | null = "よろしく";
    const timer = replaceReactionDisplayTimer(null, () => {
      reaction = null;
    });

    vi.advanceTimersByTime(REACTION_DISPLAY_MS - 1);
    expect(reaction).toBe("よろしく");
    vi.advanceTimersByTime(1);
    expect(reaction).toBeNull();

    clearReactionDisplayTimer(timer);
  });

  it("cancels the previous timer when another reaction arrives", () => {
    vi.useFakeTimers();
    let reaction: string | null = "よろしく";
    let timer = replaceReactionDisplayTimer(null, () => {
      reaction = null;
    });

    vi.advanceTimersByTime(REACTION_DISPLAY_MS - 400);
    reaction = "ナイス";
    timer = replaceReactionDisplayTimer(timer, () => {
      reaction = null;
    });
    vi.advanceTimersByTime(401);
    expect(reaction).toBe("ナイス");
    vi.advanceTimersByTime(REACTION_DISPLAY_MS - 401);
    expect(reaction).toBeNull();

    clearReactionDisplayTimer(timer);
  });
});
