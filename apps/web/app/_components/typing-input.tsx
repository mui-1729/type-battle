import type { DeviceKind } from "@type-battle/shared";
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type RefObject
} from "react";
import {
  beginMobileComposition,
  createMobileInputBufferState,
  synchronizeMobileInputBuffer,
  updateMobileInputBuffer,
  type MobileInputContext
} from "../_lib/mobile-input-buffer";

type TypingInputProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  deviceKind: DeviceKind;
  expectedText: string;
  progressIndex: number;
  acceptingInput: boolean;
  loop?: boolean;
  inputKey?: string | number;
  onTextInput: (text: string) => void;
};

export function TypingInput({
  inputRef,
  deviceKind,
  expectedText,
  progressIndex,
  acceptingInput,
  loop = false,
  inputKey = "",
  onTextInput
}: TypingInputProps) {
  const bufferRef = useRef(createMobileInputBufferState(progressIndex));
  const context: MobileInputContext = {
    expectedText,
    progressIndex,
    acceptingInput,
    loop,
    inputKey
  };

  useEffect(() => {
    const synchronized = synchronizeMobileInputBuffer(bufferRef.current, context);
    bufferRef.current = synchronized.state;

    if (synchronized.clearValue && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [acceptingInput, expectedText, inputKey, inputRef, loop, progressIndex]);

  const processValue = (
    input: HTMLTextAreaElement,
    options: { composing: boolean; commit?: boolean }
  ) => {
    const result = updateMobileInputBuffer(bufferRef.current, {
      ...context,
      value: input.value,
      composing: options.composing,
      ...(options.commit === undefined ? {} : { commit: options.commit })
    });
    bufferRef.current = result.state;

    if (result.clearValue) {
      input.value = "";
    }

    if (result.emittedText) {
      onTextInput(result.emittedText);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    processValue(event.currentTarget, {
      composing: isInputComposing(event.nativeEvent) || bufferRef.current.composing
    });
  };

  const handleCompositionStart = () => {
    bufferRef.current = beginMobileComposition(bufferRef.current, context);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    processValue(event.currentTarget, { composing: false, commit: true });
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
  };

  return (
    <textarea
      ref={inputRef}
      className="typingInput"
      aria-label="入力欄"
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      aria-disabled={!acceptingInput}
      data-input-state={acceptingInput ? "ready" : "armed"}
      inputMode="text"
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onPaste={handlePaste}
      placeholder={deviceKind === "mobile" ? "画面をタップして入力を再開" : "開始したらそのままタイプ"}
      lang={deviceKind === "mobile" ? "ja" : "en"}
      rows={1}
      spellCheck={false}
      suppressHydrationWarning
    />
  );
}

function isInputComposing(event: Event): boolean {
  return "isComposing" in event && event.isComposing === true;
}