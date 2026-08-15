export type TypingInputMode = "kana" | "romaji";

const KANA_INPUT_PATTERN = /[\u3040-\u30ff\uff66-\uff9f]/u;
const ROMAJI_INPUT_PATTERN = /[a-z]/iu;

export function resolveTypingInputMode(
  currentMode: TypingInputMode,
  value: string
): TypingInputMode {
  if (KANA_INPUT_PATTERN.test(value)) {
    return "kana";
  }

  if (ROMAJI_INPUT_PATTERN.test(value)) {
    return "romaji";
  }

  return currentMode;
}

export function containsKanaTypingInput(value: string): boolean {
  return KANA_INPUT_PATTERN.test(value);
}
