import { getDailyChallengeInfo, pickDailyChallengePrompt, pickPrompt } from "./prompts.js";
import { createRoomCode } from "./validation.js";
import type { Prompt, PromptCategory } from "./game-state.js";

export type PracticeStart = {
  practiceId: string;
  prompt: Prompt;
  startedAt: number;
};

export type DailyPracticeStart = PracticeStart & {
  challengeKey: string;
};

export function startPractice(nickname: string, category: PromptCategory): PracticeStart {
  void nickname;
  const practiceId = createRoomCode();
  const prompt = pickPrompt(category, Date.now());

  return {
    practiceId,
    prompt,
    startedAt: Date.now()
  };
}

export function startDailyPractice(nickname: string): DailyPracticeStart {
  void nickname;
  const practiceId = createRoomCode();
  const now = new Date();
  const prompt = pickDailyChallengePrompt(now);
  const { challengeKey } = getDailyChallengeInfo(now);

  return {
    practiceId,
    prompt,
    startedAt: Date.now(),
    challengeKey
  };
}
