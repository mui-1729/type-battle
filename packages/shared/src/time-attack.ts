import type { Prompt } from "./game-state.js";
import { PROMPTS } from "./prompts.js";

export type TimeAttackPromptPosition = {
  prompt: Prompt;
  promptIndex: number;
  progressIndex: number;
  completedPrompts: number;
};

export function getTimeAttackPromptPositionByGuide(
  prompts: Prompt[],
  cumulativeGuideIndex: number
): TimeAttackPromptPosition | null {
  let cursor = Math.max(0, Math.floor(cumulativeGuideIndex));
  for (let index = 0; index < prompts.length; index += 1) {
    const prompt = prompts[index]!;
    const guideLength = prompt.typing.romaji.length;
    if (cursor < guideLength) {
      return {
        prompt,
        promptIndex: index,
        progressIndex: cursor,
        completedPrompts: index
      };
    }
    cursor -= guideLength;
  }
  return prompts.length ? {
    prompt: prompts[prompts.length - 1]!,
    promptIndex: prompts.length - 1,
    progressIndex: prompts[prompts.length - 1]!.typing.romaji.length,
    completedPrompts: prompts.length
  } : null;
}

export function getTimeAttackPromptPosition(
  prompts: Prompt[],
  cumulativeProgressIndex: number
): TimeAttackPromptPosition | null {
  if (prompts.length === 0) {
    return null;
  }

  const lengths = prompts.map((prompt) => Array.from(prompt.typing.hiragana).length);
  const cycleLength = lengths.reduce((total, length) => total + length, 0);
  if (cycleLength <= 0) {
    return null;
  }

  const safeProgress = Math.max(0, Math.floor(cumulativeProgressIndex));
  if (safeProgress >= cycleLength) {
    const lastPrompt = prompts[prompts.length - 1]!;
    return {
      prompt: lastPrompt,
      promptIndex: prompts.length - 1,
      progressIndex: Array.from(lastPrompt.typing.hiragana).length,
      completedPrompts: prompts.length
    };
  }
  let cursor = safeProgress;

  for (let index = 0; index < prompts.length; index += 1) {
    const length = lengths[index] ?? 0;
    if (cursor < length) {
      return {
        prompt: prompts[index]!,
        promptIndex: index,
        progressIndex: cursor,
        completedPrompts: index
      };
    }
    cursor -= length;
  }

  return {
    prompt: prompts[0]!,
    promptIndex: 0,
    progressIndex: 0,
    completedPrompts: prompts.length
  };
}

export function getTimeAttackPromptSequence(prompts: Prompt[], seed: number): Prompt[] {
  if (prompts.length <= 1) {
    return [...prompts];
  }

  const offset = Math.abs(Math.floor(seed)) % prompts.length;
  return [...prompts.slice(offset), ...prompts.slice(0, offset)];
}

export function resolveTimeAttackPrompts(promptIds: string[] | undefined, fallback: Prompt): Prompt[] {
  if (!promptIds?.length) {
    return [fallback];
  }
  const byId = new Map(PROMPTS.map((prompt) => [prompt.id, prompt]));
  const resolved = promptIds.map((id) => byId.get(id)).filter((prompt): prompt is Prompt => Boolean(prompt));
  return resolved.length > 0 ? resolved : [fallback];
}
