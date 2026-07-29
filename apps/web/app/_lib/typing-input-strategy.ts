import type { DeviceKind } from "@type-battle/shared";
import {
  advanceLoopingRomajiProgressWithMistakes,
  getCanonicalProgressIndex,
  getRomajiProgressIndexForCanonicalProgress
} from "./looping-typing";
import {
  advanceRomajiProgressWithMistakes,
  type RomajiTypingPlan
} from "./romaji-typing";
import {
  advanceProgressWithMistakes,
  type ProgressState,
  type ProgressUpdate
} from "./typing-progress";

export type TypingInputStrategy = {
  previous: ProgressState;
  typedText: string;
  deviceKind: DeviceKind;
  canonicalText: string;
  displayText: string;
  romajiPlan: RomajiTypingPlan | null;
  loop: boolean;
  inputMode?: "kana" | "romaji";
  progressBase?: number;
};

export function advanceTypingProgress({
  previous,
  typedText,
  deviceKind,
  canonicalText,
  displayText,
  romajiPlan,
  loop,
  inputMode = deviceKind === "mobile" ? "kana" : "romaji",
  progressBase = 0
}: TypingInputStrategy): ProgressUpdate {
  if (progressBase > 0) {
    const localPrevious = { ...previous, progressIndex: Math.max(0, previous.progressIndex - progressBase) };
    const next = advanceTypingProgress({
      previous: localPrevious,
      typedText,
      deviceKind,
      canonicalText,
      displayText,
      romajiPlan,
      loop: false,
      inputMode
    });
    return { ...next, progress: { ...next.progress, progressIndex: next.progress.progressIndex + progressBase } };
  }
  const nextMode = containsKanaInput(typedText) ? "kana" : "romaji";
  let modePrevious = previous;

  if (romajiPlan && inputMode !== nextMode) {
    const canonicalProgressIndex =
      inputMode === "kana" ? previous.progressIndex : getCanonicalProgressIndex(romajiPlan, previous.progressIndex);
    modePrevious = {
      ...previous,
      progressIndex:
        nextMode === "kana"
          ? canonicalProgressIndex
          : getRomajiProgressIndexForCanonicalProgress(romajiPlan, canonicalProgressIndex),
      pendingInput: ""
    };
  }

  if (nextMode === "kana") {
    return advanceProgressWithMistakes(modePrevious, canonicalText, typedText, loop);
  }

  if (romajiPlan && containsKanaInput(typedText)) {
    const canonicalPrevious = modePrevious;
    const next = advanceProgressWithMistakes(canonicalPrevious, canonicalText, typedText, loop);

    return {
      ...next,
      progress: {
        ...next.progress,
        progressIndex: getRomajiProgressIndexForCanonicalProgress(
          romajiPlan,
          next.progress.progressIndex
        )
      }
    };
  }

  if (romajiPlan) {
    return loop
      ? advanceLoopingRomajiProgressWithMistakes(modePrevious, romajiPlan, typedText)
      : advanceRomajiProgressWithMistakes(modePrevious, romajiPlan, typedText);
  }

  return advanceProgressWithMistakes(previous, displayText, typedText, loop);
}

function containsKanaInput(value: string): boolean {
  return /[\u3040-\u30ff\uff66-\uff9f]/u.test(value);
}
