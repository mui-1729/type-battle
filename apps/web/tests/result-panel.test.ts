import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatchResult } from "@type-battle/shared";
import { ResultPanel } from "../app/_components/result-panel";
import { createReactionErrorFeedback, createSentReactionFeedback } from "../app/_lib/reaction-feedback";

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

  it("disables an exhausted daily retry and explains when it resets", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResultPanel, {
        result,
        isRoomResult: false,
        practiceMode: "daily",
        onRetry: vi.fn(),
        retryDisabledReason: "今日の挑戦上限（5回）に達しました。次のデイリーチャレンジは0:00から挑戦できます。"
      })
    );

    expect(markup).toContain("もう一度挑戦");
    expect(markup).toContain("disabled");
    expect(markup).toMatch(/aria-describedby="[^"]+"/);
    expect(markup).toContain('role="status"');
    expect(markup).toContain("今日の挑戦上限（5回）に達しました");
    expect(markup).toContain("0:00から挑戦できます");
  });

  it("shows acknowledged cooldown and names the remote result reaction", () => {
    const twoPlayerResult: MatchResult = {
      ...result,
      players: [
        result.players[0]!,
        {
          ...result.players[0]!,
          id: "player-2",
          nickname: "Bob",
          isHost: false,
          rank: 2
        }
      ]
    };
    const markup = renderToStaticMarkup(
      React.createElement(ResultPanel, {
        result: twoPlayerResult,
        isRoomResult: true,
        localPlayerId: "player-1",
        onRetry: vi.fn(),
        onReaction: vi.fn(),
        reactionFeedback: createSentReactionFeedback("ナイス"),
        remoteReaction: { playerId: "player-2", reaction: "よろしく" },
        remoteReactionsEnabled: true
      })
    );

    expect(markup).toContain("ナイス を送信しました。次は3秒後に送信できます。");
    expect(markup).toContain("Bob: 「よろしく」");
    expect(markup.match(/resultReactionBubble/g)).toHaveLength(2);
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("disabled");
  });

  it("renders reaction ACK errors as alerts without disabling retry", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResultPanel, {
        result,
        isRoomResult: true,
        localPlayerId: "player-1",
        onRetry: vi.fn(),
        onReaction: vi.fn(),
        reactionFeedback: createReactionErrorFeedback("リアクションを送信できませんでした。"),
        remoteReactionsEnabled: false
      })
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("リアクションを送信できませんでした。");
    expect(markup).not.toMatch(/resultReactions[^]*<button[^>]*disabled/);
  });
});
