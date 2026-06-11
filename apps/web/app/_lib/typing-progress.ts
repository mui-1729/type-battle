export type ProgressState = {
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
  currentStreak: number;
  maxStreak: number;
};

export function createEmptyProgress(): ProgressState {
  return {
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    currentStreak: 0,
    maxStreak: 0
  };
}

export function advanceProgress(
  previous: ProgressState,
  expectedChar: string | undefined,
  typedChar: string
): ProgressState {
  const correct = typedChar === expectedChar;
  const nextIndex = correct ? previous.progressIndex + 1 : previous.progressIndex;

  return {
    progressIndex: nextIndex,
    correctCharacters: correct ? previous.correctCharacters + 1 : previous.correctCharacters,
    totalTypedCharacters: previous.totalTypedCharacters + 1,
    mistakes: correct ? previous.mistakes : previous.mistakes + 1,
    currentStreak: correct ? previous.currentStreak + 1 : 0,
    maxStreak: correct ? Math.max(previous.maxStreak, previous.currentStreak + 1) : previous.maxStreak
  };
}

export function advanceProgressByText(
  previous: ProgressState,
  promptText: string,
  typedText: string
): ProgressState {
  return Array.from(typedText).reduce(
    (progress, typedChar) => advanceProgress(progress, promptText[progress.progressIndex], typedChar),
    previous
  );
}
