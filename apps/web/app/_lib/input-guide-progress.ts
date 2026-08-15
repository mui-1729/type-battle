import type { RomajiTypingPlan } from "./romaji-typing";
import { getRomajiTypingUnitIndex } from "./romaji-typing";

export function getInputGuideUnitIndex(
  plan: RomajiTypingPlan,
  progressIndex: number,
  inputText: string
): number {
  const canonicalText = plan.units.map((unit) => unit.hiragana).join("");

  if (inputText !== canonicalText) {
    return getRomajiTypingUnitIndex(plan, progressIndex);
  }

  return getCanonicalTypingUnitIndex(plan, progressIndex);
}

export function getCanonicalTypingUnitIndex(
  plan: RomajiTypingPlan,
  canonicalProgressIndex: number
): number {
  const safeProgress = Math.max(0, canonicalProgressIndex);
  let canonicalCursor = 0;

  for (let index = 0; index < plan.units.length; index += 1) {
    canonicalCursor += Array.from(plan.units[index]!.hiragana).length;

    if (safeProgress < canonicalCursor) {
      return index;
    }
  }

  return plan.units.length;
}
