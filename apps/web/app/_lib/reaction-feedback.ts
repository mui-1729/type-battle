import type { QuickReaction } from "@type-battle/shared";

export const REACTION_DISPLAY_MS = 2_400;
export const REACTION_COOLDOWN_MS = 3_000;

export type ReactionFeedback = {
  phase: "idle" | "sending" | "cooldown" | "error";
  reaction: QuickReaction | null;
  message: string;
};

export const INITIAL_REACTION_FEEDBACK: ReactionFeedback = {
  phase: "idle",
  reaction: null,
  message: ""
};

export function createSendingReactionFeedback(reaction: QuickReaction): ReactionFeedback {
  return {
    phase: "sending",
    reaction,
    message: `${reaction} を送信中…`
  };
}

export function createSentReactionFeedback(reaction: QuickReaction): ReactionFeedback {
  return {
    phase: "cooldown",
    reaction,
    message: `${reaction} を送信しました。次は3秒後に送信できます。`
  };
}

export function createCooldownReactionFeedback(): ReactionFeedback {
  return {
    phase: "cooldown",
    reaction: null,
    message: "クールダウン中です。まもなく再送信できます。"
  };
}

export function createReactionErrorFeedback(message: string): ReactionFeedback {
  return {
    phase: "error",
    reaction: null,
    message
  };
}

export function isReactionInputDisabled(feedback: ReactionFeedback): boolean {
  return feedback.phase === "sending" || feedback.phase === "cooldown";
}

export function replaceReactionDisplayTimer(
  previousTimer: number | null,
  onElapsed: () => void
): number {
  if (previousTimer !== null) {
    globalThis.clearTimeout(previousTimer);
  }
  return globalThis.setTimeout(onElapsed, REACTION_DISPLAY_MS) as unknown as number;
}

export function clearReactionDisplayTimer(timer: number | null): null {
  if (timer !== null) {
    globalThis.clearTimeout(timer);
  }
  return null;
}
