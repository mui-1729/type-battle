type TypingPromptProps = {
  displayText: string;
  inputText: string;
  progressIndex: number;
  inputGuideEnabled: boolean;
};

export function TypingPrompt({ displayText, inputText, progressIndex, inputGuideEnabled }: TypingPromptProps) {
  return (
    <div className="promptBox" aria-label="課題文">
      <div className="promptDisplay">{displayText}</div>
      {inputGuideEnabled ? (
        <div className="promptGuide" aria-label="入力ガイド">
          {inputText.split("").map((char, index) => {
            const className =
              index < progressIndex ? "char typed" : index === progressIndex ? "char current" : "char";

            return (
              <span className={className} key={`${char}-${index}`}>
                {char}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
