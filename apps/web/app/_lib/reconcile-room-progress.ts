import type { PlayerState, TypingInputMode } from "@type-battle/shared";
import type { ProgressState } from "./typing-progress";

export function reconcileRoomProgress(
  previous: ProgressState,
  player: PlayerState,
  localInputMode: TypingInputMode = player.deviceKind === "mobile" ? "kana" : "romaji"
): ProgressState {
  // Local input is optimistic. A state with fewer processed keystrokes is an
  // older server broadcast and must not move the input guide backwards.
  if (player.totalTypedCharacters < previous.totalTypedCharacters) {
    return previous;
  }

  const inputMode = player.inputMode ?? localInputMode;
  const progressIndex =
    inputMode === "romaji"
      ? player.typingProgressIndex ?? player.progressIndex
      : player.progressIndex;
  const pendingInput = inputMode === "romaji" ? player.pendingInput ?? "" : "";

  if (
    progressIndex === previous.progressIndex &&
    pendingInput === previous.pendingInput &&
    player.correctCharacters === previous.correctCharacters &&
    player.totalTypedCharacters === previous.totalTypedCharacters &&
    player.mistakes === previous.mistakes &&
    player.currentStreak === previous.currentStreak &&
    player.maxStreak === previous.maxStreak
  ) {
    return previous;
  }

  return {
    progressIndex,
    correctCharacters: player.correctCharacters,
    totalTypedCharacters: player.totalTypedCharacters,
    mistakes: player.mistakes,
    currentStreak: player.currentStreak,
    maxStreak: player.maxStreak,
    pendingInput
  };
}
