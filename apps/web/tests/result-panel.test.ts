import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatchResult } from "@type-battle/shared";
import { ResultPanel } from "../app/_components/result-panel";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const result: MatchResult = {
  roomCode: "AB23CD",
  prompt: {
    id: "prompt-1",
    text: "テスト",
    category: "short",
    typing: { romaji: "tesuto", hiragana: "てすと" }
  },
  matchRule: "race",
  players: [
    {
      id: "player-1",
      nickname: "Alice",
      connected: true,
      ready: false,
      isHost: true,
      isBot: false,
      progressIndex: 3,
      correctCharacters: 6,
      totalTypedCharacters: 6,
      mistakes: 0,
      maxStreak: 6,
      currentStreak: 6,
      wpm: 80,
      accuracy: 100,
      rank: 1,
      finishGap: 0
    }
  ]
};

describe("ResultPanel", () => {
  it("shows a waiting status instead of a rematch button to non-hosts", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResultPanel, {
        result,
        isRoomResult: true,
        onRetry: vi.fn(),
        canRetry: false
      })
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("相手の再戦READYを待っています。");
    expect(markup).not.toContain("再戦する</button>");
    expect(markup).not.toContain("不具合を報告");
  });

  it("disables the host action while pending and renders a local alert", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResultPanel, {
        result,
        isRoomResult: true,
        onRetry: vi.fn(),
        canRetry: true,
        retryPending: true,
        retryError: "再戦を開始できませんでした。"
      })
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("READYを送信中…");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("再戦を開始できませんでした。");
  });

  it("keeps the practice retry action available", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResultPanel, {
        result,
        isRoomResult: false,
        onRetry: vi.fn()
      })
    );

    expect(markup).toContain("もう一度練習");
    expect(markup).toContain("<button");
  });
});
