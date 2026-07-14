export type ProgressState = {
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
  currentStreak: number;
  maxStreak: number;
  pendingInput: string;
};

export function createEmptyProgress(): ProgressState {
  return {
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    currentStreak: 0,
    maxStreak: 0,
    pendingInput: ""
  };
}

export type MistakeSample = {
  expectedChar: string;
  typedChar: string;
};

export type ProgressUpdate = {
  progress: ProgressState;
  mistakeSamples: MistakeSample[];
};

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
    maxStreak: correct ? Math.max(previous.maxStreak, previous.currentStreak + 1) : previous.maxStreak,
    pendingInput: previous.pendingInput
  };
}

export function advanceProgressWithMistakes(
  previous: ProgressState,
  promptText: string,
  typedText: string,
  loop = false
): ProgressUpdate {
  const promptCharacters = Array.from(promptText);

  return Array.from(typedText).reduce<ProgressUpdate>(
    (state, typedChar) => {
      const cursor =
        loop && promptCharacters.length > 0
          ? state.progress.progressIndex % promptCharacters.length
          : state.progress.progressIndex;
      const expectedChar = promptCharacters[cursor];
      const nextProgress = advanceProgress(state.progress, expectedChar, typedChar);

      if (nextProgress.mistakes > state.progress.mistakes) {
        state.mistakeSamples.push({
          expectedChar: expectedChar ?? "",
          typedChar
        });
      }

      state.progress = nextProgress;
      return state;
    },
    {
      progress: previous,
      mistakeSamples: []
    }
  );
}

export function advanceProgressByText(
  previous: ProgressState,
  promptText: string,
  typedText: string,
  loop = false
): ProgressState {
  return advanceProgressWithMistakes(previous, promptText, typedText, loop).progress;
}