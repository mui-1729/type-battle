export type MobileInputBufferState = {
  contextKey: string;
  handledValue: string;
  externalProgressIndex: number;
  optimisticProgressIndex: number;
  composing: boolean;
  settledComposition: boolean;
};

export type MobileInputContext = {
  expectedText: string;
  progressIndex: number;
  loop?: boolean;
  acceptingInput: boolean;
  inputKey?: string | number;
};

export type MobileInputUpdate = MobileInputContext & {
  value: string;
  composing: boolean;
  commit?: boolean;
};

export type MobileInputBufferResult = {
  state: MobileInputBufferState;
  emittedText: string;
  clearValue: boolean;
};

const SMALL_KANA_BASE: Readonly<Record<string, string>> = {
  "ぁ": "あ",
  "ぃ": "い",
  "ぅ": "う",
  "ぇ": "え",
  "ぉ": "お",
  "っ": "つ",
  "ゃ": "や",
  "ゅ": "ゆ",
  "ょ": "よ",
  "ゎ": "わ",
  "ゕ": "か",
  "ゖ": "け"
};

export function createMobileInputContextKey({
  expectedText,
  loop = false,
  inputKey = ""
}: Pick<MobileInputContext, "expectedText" | "loop" | "inputKey">): string {
  return `${String(inputKey)}\u0000${loop ? "loop" : "once"}\u0000${expectedText}`;
}

export function createMobileInputBufferState(
  progressIndex = 0,
  contextKey = ""
): MobileInputBufferState {
  return {
    contextKey,
    handledValue: "",
    externalProgressIndex: progressIndex,
    optimisticProgressIndex: progressIndex,
    composing: false,
    settledComposition: false
  };
}

export function synchronizeMobileInputBuffer(
  previous: MobileInputBufferState,
  context: MobileInputContext
): { state: MobileInputBufferState; clearValue: boolean } {
  const contextKey = createMobileInputContextKey(context);

  if (!context.acceptingInput || previous.contextKey !== contextKey) {
    return {
      state: createMobileInputBufferState(context.progressIndex, contextKey),
      clearValue: true
    };
  }

  if (context.progressIndex === previous.optimisticProgressIndex) {
    return {
      state: {
        ...previous,
        externalProgressIndex: context.progressIndex
      },
      clearValue: false
    };
  }

  if (context.progressIndex !== previous.externalProgressIndex) {
    return {
      state: createMobileInputBufferState(context.progressIndex, contextKey),
      clearValue: true
    };
  }

  return { state: previous, clearValue: false };
}

export function beginMobileComposition(
  previous: MobileInputBufferState,
  context: MobileInputContext
): MobileInputBufferState {
  const synchronized = synchronizeMobileInputBuffer(previous, context).state;

  if (!context.acceptingInput) {
    return synchronized;
  }

  return {
    ...synchronized,
    handledValue: "",
    composing: true,
    settledComposition: false
  };
}

export function updateMobileInputBuffer(
  previous: MobileInputBufferState,
  update: MobileInputUpdate
): MobileInputBufferResult {
  const synchronized = synchronizeMobileInputBuffer(previous, update);
  let state = synchronized.state;

  if (!update.acceptingInput || !update.expectedText) {
    return {
      state: createMobileInputBufferState(update.progressIndex, createMobileInputContextKey(update)),
      emittedText: "",
      clearValue: true
    };
  }

  if (!update.value) {
    return {
      state: {
        ...state,
        handledValue: "",
        composing: update.composing && !update.commit,
        settledComposition: false
      },
      emittedText: "",
      clearValue: synchronized.clearValue
    };
  }

  if (state.settledComposition && update.value === state.handledValue) {
    return {
      state,
      emittedText: "",
      clearValue: true
    };
  }

  if (state.settledComposition) {
    state = {
      ...state,
      handledValue: "",
      settledComposition: false
    };
  }

  if (!update.value.startsWith(state.handledValue)) {
    // Already emitted composition text cannot be rolled back through the
    // append-only typing contract. Ignore the edited prefix and clear it when
    // the composition settles instead of emitting the replacement twice.
    return {
      state: {
        ...state,
        handledValue: update.value,
        composing: update.composing && !update.commit,
        settledComposition: Boolean(update.commit)
      },
      emittedText: "",
      clearValue: Boolean(update.commit)
    };
  }

  const valueCharacters = Array.from(update.value);
  const handledCharacterCount = Array.from(state.handledValue).length;
  const pendingCharacters = valueCharacters.slice(handledCharacterCount);
  let handledValue = state.handledValue;
  let optimisticProgressIndex = state.optimisticProgressIndex;
  let emittedText = "";

  for (const [index, typedCharacter] of pendingCharacters.entries()) {
    const expectedCharacter = getExpectedCharacter(
      update.expectedText,
      optimisticProgressIndex,
      update.loop
    );
    const correct = typedCharacter === expectedCharacter;
    const isLastCharacter = index === pendingCharacters.length - 1;
    const shouldDefer =
      isLastCharacter &&
      !update.commit &&
      !correct &&
      (update.composing || isKanaTransformationCandidate(typedCharacter, expectedCharacter));

    if (shouldDefer) {
      break;
    }

    emittedText += typedCharacter;
    handledValue += typedCharacter;

    if (correct) {
      optimisticProgressIndex += 1;
    }
  }

  const hasDeferredInput = Array.from(handledValue).length < valueCharacters.length;
  const compositionSettled = Boolean(update.commit);
  const clearValue =
    compositionSettled ||
    (!update.composing && !hasDeferredInput && emittedText.length > 0);

  const nextState: MobileInputBufferState = {
    ...state,
    handledValue:
      clearValue && !compositionSettled
        ? ""
        : compositionSettled
          ? update.value
          : handledValue,
    optimisticProgressIndex,
    composing: update.composing && !compositionSettled,
    settledComposition: compositionSettled
  };

  return {
    state: nextState,
    emittedText,
    clearValue
  };
}

export function getExpectedCharacter(
  expectedText: string,
  progressIndex: number,
  loop = false
): string | undefined {
  const characters = Array.from(expectedText);

  if (characters.length === 0 || progressIndex < 0) {
    return undefined;
  }

  const index = loop ? progressIndex % characters.length : progressIndex;
  return characters[index];
}

export function isKanaTransformationCandidate(
  typedCharacter: string,
  expectedCharacter: string | undefined
): boolean {
  if (!expectedCharacter || typedCharacter === expectedCharacter) {
    return false;
  }

  return getKanaTransformationBase(typedCharacter) === getKanaTransformationBase(expectedCharacter);
}

function getKanaTransformationBase(character: string): string {
  const normalizedCharacter = Array.from(character.normalize("NFD"))[0] ?? character;
  return SMALL_KANA_BASE[normalizedCharacter] ?? normalizedCharacter;
}
