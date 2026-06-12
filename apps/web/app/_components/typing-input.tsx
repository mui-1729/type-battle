import type { ChangeEvent, CompositionEvent, RefObject } from "react";

type TypingInputProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  onTextInput: (text: string) => void;
};

export function TypingInput({ inputRef, disabled, onTextInput }: TypingInputProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (isInputComposing(event.nativeEvent)) {
      return;
    }

    consumeInput(event.currentTarget, onTextInput);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    consumeInput(event.currentTarget, onTextInput);
  };

  return (
    <textarea
      ref={inputRef}
      className="typingInput"
      aria-label="入力欄"
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      disabled={disabled}
      inputMode="text"
      onChange={handleChange}
      onCompositionEnd={handleCompositionEnd}
      placeholder="ここに入力"
      rows={1}
      spellCheck={false}
      suppressHydrationWarning
    />
  );
}

function consumeInput(input: HTMLTextAreaElement, onTextInput: (text: string) => void) {
  const typedText = input.value;

  if (!typedText) {
    return;
  }

  input.value = "";
  onTextInput(typedText);
}

function isInputComposing(event: Event): boolean {
  return "isComposing" in event && event.isComposing === true;
}
