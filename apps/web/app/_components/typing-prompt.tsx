type TypingPromptProps = {
  promptText: string;
  progressIndex: number;
  inputGuideEnabled: boolean;
};

export function TypingPrompt({ promptText, progressIndex, inputGuideEnabled }: TypingPromptProps) {
  return (
    <div className="promptBox" aria-label="課題文">
      {promptText.split("").map((char, index) => {
        const className =
          index < progressIndex ? "char typed" : index === progressIndex && inputGuideEnabled ? "char current" : "char";

        return (
          <span className={className} key={`${char}-${index}`}>
            {char}
          </span>
        );
      })}
    </div>
  );
}
