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
};

export function advanceTypingProgress({
  previous,
  typedText,
  deviceKind,
  canonicalText,
  displayText,
  romajiPlan,
  loop
}: TypingInputStrategy): ProgressUpdate {
  if (deviceKind === "mobile") {
    return advanceProgressWithMistakes(previous, canonicalText, typedText, loop);
  }

  if (romajiPlan && containsKanaInput(typedText)) {
    const canonicalPrevious = {
      ...previous,
      progressIndex: getCanonicalProgressIndex(romajiPlan, previous.progressIndex)
    };
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
      ? advanceLoopingRomajiProgressWithMistakes(previous, romajiPlan, typedText)
      : advanceRomajiProgressWithMistakes(previous, romajiPlan, typedText);
  }

  return advanceProgressWithMistakes(previous, displayText, typedText, loop);
}

function containsKanaInput(value: string): boolean {
  return /[\u3040-\u30ff\uff66-\uff9f]/u.test(value);
}
