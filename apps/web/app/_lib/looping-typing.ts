import {
  advanceRomajiProgress,
  getRomajiTypingUnitIndex,
  type RomajiTypingPlan
} from "./romaji-typing";
import type { MistakeSample, ProgressState, ProgressUpdate } from "./typing-progress";

export function advanceLoopingRomajiProgressWithMistakes(
  previous: ProgressState,
  plan: RomajiTypingPlan,
  typedText: string
): ProgressUpdate {
  if (!plan.guide) {
    return { progress: previous, mistakeSamples: [] };
  }

  return Array.from(typedText).reduce<ProgressUpdate>(
    (state, typedChar) => {
      const cycleBase = state.progress.progressIndex - modulo(state.progress.progressIndex, plan.guide.length);
      const cursor = modulo(state.progress.progressIndex, plan.guide.length);
      const unit = plan.units[getRomajiTypingUnitIndex(plan, cursor)];
      const localPrevious = { ...state.progress, progressIndex: cursor };
      const localNext = advanceRomajiProgress(localPrevious, plan, typedChar);

      if (localNext.mistakes > localPrevious.mistakes) {
        state.mistakeSamples.push({
          expectedChar: unit?.hiragana ?? "",
          typedChar
        });
      }

      state.progress = {
        ...localNext,
        progressIndex: cycleBase + localNext.progressIndex
      };
      return state;
    },
    { progress: previous, mistakeSamples: [] as MistakeSample[] }
  );
}

export function getCanonicalProgressIndex(plan: RomajiTypingPlan, typingProgressIndex: number): number {
  if (!plan.guide) {
    return 0;
  }

  const canonicalCycleLength = plan.units.reduce(
    (total, unit) => total + Array.from(unit.hiragana).length,
    0
  );
  const cycles = Math.floor(Math.max(typingProgressIndex, 0) / plan.guide.length);
  const cursor = modulo(Math.max(typingProgressIndex, 0), plan.guide.length);
  let guideCursor = 0;
  let canonicalCursor = 0;

  for (const unit of plan.units) {
    const nextGuideCursor = guideCursor + unit.guide.length;
    if (nextGuideCursor > cursor) {
      break;
    }

    guideCursor = nextGuideCursor;
    canonicalCursor += Array.from(unit.hiragana).length;
  }

  return cycles * canonicalCycleLength + canonicalCursor;
}

export function getRomajiProgressIndexForCanonicalProgress(
  plan: RomajiTypingPlan,
  canonicalProgressIndex: number
): number {
  const canonicalCycleLength = plan.units.reduce(
    (total, unit) => total + Array.from(unit.hiragana).length,
    0
  );

  if (!plan.guide || canonicalCycleLength <= 0) {
    return 0;
  }

  const safeProgress = Math.max(canonicalProgressIndex, 0);
  const cycles = Math.floor(safeProgress / canonicalCycleLength);
  const cursor = modulo(safeProgress, canonicalCycleLength);
  let canonicalCursor = 0;
  let guideCursor = 0;

  for (const unit of plan.units) {
    const unitLength = Array.from(unit.hiragana).length;
    if (canonicalCursor + unitLength > cursor) {
      break;
    }

    canonicalCursor += unitLength;
    guideCursor += unit.guide.length;
  }

  return cycles * plan.guide.length + guideCursor;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}