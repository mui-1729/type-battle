import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TypingPrompt } from "../app/_components/typing-prompt";
import { buildRomajiTypingPlan } from "../app/_lib/romaji-typing";

describe("TypingPrompt", () => {
  it("moves the current guide unit after a completed kana character", () => {
    const plan = buildRomajiTypingPlan("かき");
    const markup = renderToStaticMarkup(
      <TypingPrompt
        displayText="柿"
        inputText="かき"
        progressIndex={1}
        inputGuideEnabled
        romajiPlan={plan}
      />
    );

    expect(markup).toContain(
      '<span class="char typed">k</span><span class="char typed">a</span><span class="char current">k</span>'
    );
  });

  it("keeps a digraph unit current while kana progress is inside that unit", () => {
    const plan = buildRomajiTypingPlan("しゅう");
    const markup = renderToStaticMarkup(
      <TypingPrompt
        displayText="集中"
        inputText="しゅう"
        progressIndex={1}
        inputGuideEnabled
        romajiPlan={plan}
      />
    );

    expect(markup).toContain('<span class="char current">s</span><span class="char">h</span><span class="char">u</span>');
  });

  it("preserves pending romaji prefix rendering", () => {
    const plan = buildRomajiTypingPlan("か");
    const markup = renderToStaticMarkup(
      <TypingPrompt
        displayText="か"
        inputText={plan.guide}
        progressIndex={0}
        inputGuideEnabled
        pendingInput="k"
        romajiPlan={plan}
      />
    );

    expect(markup).toContain('<span class="char typed">k</span><span class="char current">a</span>');
  });
});
