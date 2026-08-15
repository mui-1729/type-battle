import {
  resolveTypingInputMode,
  type DeviceKind,
  type TypingInputMode
} from "@type-battle/shared";
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
  inputMode?: TypingInputMode;
  progressBase?: number;
  progressBaseByMode?: Partial<Record<TypingInputMode, number>>;
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
  progressBase = 0,
  progressBaseByMode
}: TypingInputStrategy): ProgressUpdate {
  const nextMode = resolveTypingInputMode(inputMode, typedText);

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
    const nextProgressBase = progressBaseByMode?.[nextMode] ?? progressBase;
    return {
      ...next,
      progress: {
        ...next.progress,
        progressIndex: next.progress.progressIndex + nextProgressBase
      }
    };
  }

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

  if (romajiPlan) {
    return loop
      ? advanceLoopingRomajiProgressWithMistakes(modePrevious, romajiPlan, typedText)
      : advanceRomajiProgressWithMistakes(modePrevious, romajiPlan, typedText);
  }

  return advanceProgressWithMistakes(modePrevious, displayText, typedText, loop);
}
