import type { Prompt, PromptCategory } from "./game-state.js";
import { getPromptsByCategory, PROMPTS } from "./prompts.js";
import { buildRomajiTypingPlan } from "./romaji-typing.js";

export type TimeAttackPromptPosition = {
  prompt: Prompt;
  promptIndex: number;
  progressIndex: number;
  completedPrompts: number;
};

export function getTimeAttackPromptPositionByGuide(
  prompts: readonly Prompt[],
  cumulativeGuideIndex: number
): TimeAttackPromptPosition | null {
  let cursor = Math.max(0, Math.floor(cumulativeGuideIndex));
  for (let index = 0; index < prompts.length; index += 1) {
    const prompt = prompts[index]!;
    const guideLength = buildRomajiTypingPlan(prompt.typing.hiragana).guide.length;
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
  prompts: readonly Prompt[],
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

export function getTimeAttackPromptSequence(prompts: readonly Prompt[], seed: number): Prompt[] {
  const uniquePrompts = [...new Map(prompts.map((prompt) => [prompt.id, prompt])).values()];
  if (uniquePrompts.length <= 1) {
    return uniquePrompts;
  }

  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
  const offset = safeSeed % uniquePrompts.length;
  return [...uniquePrompts.slice(offset), ...uniquePrompts.slice(0, offset)];
}

export function createTimeAttackPromptSequence(
  firstPrompt: Prompt,
  category: PromptCategory,
  seed: number
): Prompt[] {
  const enabledPrompts = PROMPTS.filter((prompt) => prompt.enabled !== false);
  const categoryPrompts = getPromptsByCategory(category, enabledPrompts)
    .filter((prompt) => prompt.id !== firstPrompt.id);
  const categoryIds = new Set(categoryPrompts.map((prompt) => prompt.id));
  const remainingPrompts = enabledPrompts.filter(
    (prompt) => prompt.id !== firstPrompt.id && !categoryIds.has(prompt.id)
  );

  return [
    firstPrompt,
    ...getTimeAttackPromptSequence(categoryPrompts, seed),
    ...getTimeAttackPromptSequence(remainingPrompts, seed + 1)
  ];
}

export function resolveTimeAttackPrompts(
  promptIds: readonly string[] | undefined,
  fallback: Prompt
): Prompt[] {
  if (!promptIds?.length) {
    return [fallback];
  }
  const byId = new Map(PROMPTS.map((prompt) => [prompt.id, prompt]));
  const seen = new Set<string>();
  const resolved = promptIds
    .map((id) => byId.get(id))
    .filter((prompt): prompt is Prompt => {
      if (!prompt || prompt.enabled === false || seen.has(prompt.id)) {
        return false;
      }
      seen.add(prompt.id);
      return true;
    });
  return resolved.length > 0 ? resolved : [fallback];
}

export function getTimeAttackPromptTotalLength(prompts: readonly Prompt[]): number {
  return prompts.reduce(
    (total, prompt) => total + Array.from(prompt.typing.hiragana).length,
    0
  );
}
