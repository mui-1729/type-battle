import React, { Fragment } from "react";
import type { RomajiTypingPlan } from "../_lib/romaji-typing";
import { getInputGuideUnitIndex } from "../_lib/input-guide-progress";

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
              const currentUnitIndex = getInputGuideUnitIndex(romajiPlan, progressIndex, inputText);

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

              const typedGuideLength = getStableGuideTypedLength(unit.guide, pendingInput);

              return (
                <Fragment key={`${unit.hiragana}-${unitIndex}`}>
                  {renderCurrentUnitChars(unit.guide, typedGuideLength)}
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

function getStableGuideTypedLength(guide: string, pendingInput: string): number {
  const guideCharacters = Array.from(guide);
  const pendingCharacters = Array.from(pendingInput);
  let matched = 0;

  while (
    matched < guideCharacters.length &&
    matched < pendingCharacters.length &&
    guideCharacters[matched] === pendingCharacters[matched]
  ) {
    matched += 1;
  }

  return matched;
}

function renderChars(text: string, className: string) {
  return text.split("").map((char, index) => (
    <span className={`char ${className}`.trim()} key={`${char}-${index}-${className}`}>
      {char}
    </span>
  ));
}

function renderCurrentUnitChars(text: string, typedLength: number) {
  return text.split("").map((char, index) => (
    <span className={index < typedLength ? "char typed" : "char current"} key={`${char}-${index}`}>
      {char}
    </span>
  ));
}
