import { Fragment } from "react";
import type { RomajiTypingPlan } from "../_lib/romaji-typing";
import { getRomajiTypingUnitIndex, pickRomajiDisplayCandidate } from "../_lib/romaji-typing";

type TypingPromptProps = {
  displayText: string;
  inputText: string;
  progressIndex: number;
  inputGuideEnabled: boolean;
  pendingInput?: string;
  romajiPlan?: RomajiTypingPlan | null;
};

export function TypingPrompt({
  displayText,
  inputText,
  progressIndex,
  inputGuideEnabled,
  pendingInput = "",
  romajiPlan = null
}: TypingPromptProps) {
  return (
    <div className="promptBox" aria-label="課題文">
      <div className="promptDisplay">{displayText}</div>
      {inputGuideEnabled ? (
        romajiPlan ? (
          <div className="promptGuide" aria-label="入力ガイド">
            {romajiPlan.units.map((unit, unitIndex) => {
              const currentUnitIndex = getRomajiTypingUnitIndex(romajiPlan, progressIndex);

              if (unitIndex < currentUnitIndex) {
                return (
                  <Fragment key={`${unit.hiragana}-${unitIndex}`}>
                    {renderChars(unit.guide, "typed")}
                  </Fragment>
                );
              }

              if (unitIndex > currentUnitIndex) {
                return (
                  <Fragment key={`${unit.hiragana}-${unitIndex}`}>
                    {renderChars(unit.guide, "")}
                  </Fragment>
                );
              }

              const displayCandidate = pickRomajiDisplayCandidate(unit, pendingInput);
              const typedLength = Math.min(pendingInput.length, displayCandidate.length);

              return (
                <Fragment key={`${unit.hiragana}-${unitIndex}`}>
                  {renderChars(displayCandidate.slice(0, typedLength), "typed")}
                  {renderCurrentAndFutureChars(displayCandidate.slice(typedLength))}
                </Fragment>
              );
            })}
          </div>
        ) : (
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
        )
      ) : null}
    </div>
  );
}

function renderChars(text: string, className: string) {
  return text.split("").map((char, index) => (
    <span className={`char ${className}`.trim()} key={`${char}-${index}-${className}`}>
      {char}
    </span>
  ));
}

function renderCurrentAndFutureChars(text: string) {
  return text.split("").map((char, index) => (
    <span className={index === 0 ? "char current" : "char"} key={`${char}-${index}`}>
      {char}
    </span>
  ));
}
