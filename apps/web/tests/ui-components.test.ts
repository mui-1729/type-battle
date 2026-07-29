import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, SectionHeading, SurfaceCard } from "../app/_components/ui";
import { PlayerIdentity } from "../app/_components/player-identity";
import { HomeModeMenu } from "../app/_components/home-mode-menu";
import { LobbyPrep } from "../app/_components/lobby-prep";
import { StickFigure } from "../app/_components/stick-figure";
import { INITIAL_REACTION_FEEDBACK } from "../app/_lib/reaction-feedback";
import type { RoomState } from "@type-battle/shared";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("shared UI foundation", () => {
  it("renders stick figure eyes as dots instead of stroked bars", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StickFigure, {
        side: "left",
        pose: "idle",
        status: "waiting",
      }),
    );

    expect(markup).toContain('<g class="stickFigureFace">');
    expect(
      markup.match(/<circle cx="(?:28|35)\.5" cy="16" r="1.5"><\/circle>/g),
    ).toHaveLength(2);
    expect(markup).not.toContain('d="M28 16h1M35 16h1"');
  });

  it("renders both equipment slots as SVG cosmetics", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StickFigure, {
        side: "right",
        pose: "ready",
        status: "waiting",
        headAccessoryId: "sunglasses",
        heldItemId: "umbrella",
      }),
    );

    expect(markup).toContain('data-head-accessory="sunglasses"');
    expect(markup).toContain('data-held-item="umbrella"');
    expect(markup).toContain('data-cosmetic-slot="head"');
    expect(markup).toContain('data-cosmetic-id="sunglasses"');
    expect(markup).toContain('data-cosmetic-slot="held"');
    expect(markup).toContain('data-cosmetic-id="umbrella"');
  });

  it("keeps button variants and accessible pressed state composable", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Button, { variant: "primary", "aria-pressed": true }, "Start")
    );

    expect(markup).toContain('class="primaryButton uiButton"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("renders headings and cards without duplicating layout markup", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        SurfaceCard,
        { className: "testCard" },
        React.createElement(SectionHeading, {
          eyebrow: "ROOM",
          title: "Lobby",
          description: "Choose a match."
        })
      )
    );

    expect(markup).toContain('class="uiCard testCard"');
    expect(markup).toContain('class="sectionHeading"');
    expect(markup).toContain("Lobby");
  });

  it.each([
    ["you", "YOU", "1P"],
    ["one", "1P", "1P"],
    ["two", "2P", "2P"],
    ["com", "COM", "2P"]
  ] as const)("makes %s distinct with text and slot", (kind, label, slot) => {
    const markup = renderToStaticMarkup(
      React.createElement(PlayerIdentity, { nickname: "Player", kind, slot })
    );

    expect(markup).toContain(`data-player-role="${kind}"`);
    expect(markup).toContain(label);
    expect(markup).toContain(slot);
  });

  it("keeps the home entry point to two clear modes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(HomeModeMenu, {
        onBattle: vi.fn(),
        onSolo: vi.fn(),
        equipment: { headAccessoryId: "cap", heldItemId: "wood-sword" },
        styleCoins: 25,
        onOpenShop: vi.fn(),
        onOpenEquipment: vi.fn(),
      })
    );

    expect(markup).toContain("対戦する");
    expect(markup).toContain("ひとりで遊ぶ");
    expect(markup).toContain("遊び方を見る");
    expect(markup).toContain("ショップ");
    expect(markup).toContain("装備を変更");
    expect((markup.match(/modeCard(?:Battle|Solo)/g) ?? [])).toHaveLength(2);
  });

  it("renders the two-player lobby with self-only accessory controls", () => {
    const room = {
      roomCode: "ABC123",
      hostPlayerId: "host",
      status: "waiting",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      maxPlayers: 2,
      players: [
        {
          id: "host",
          nickname: "Alice",
          connected: true,
          ready: true,
          isHost: true,
          isBot: false,
          progressIndex: 0,
          correctCharacters: 0,
          totalTypedCharacters: 0,
          mistakes: 0,
          maxStreak: 0,
          currentStreak: 0,
          wpm: 0,
          accuracy: 100
        },
        {
          id: "guest",
          nickname: "Bob",
          connected: true,
          ready: false,
          isHost: false,
          isBot: false,
          progressIndex: 0,
          correctCharacters: 0,
          totalTypedCharacters: 0,
          mistakes: 0,
          maxStreak: 0,
          currentStreak: 0,
          wpm: 0,
          accuracy: 100
        }
      ]
    } satisfies RoomState;
    const markup = renderToStaticMarkup(
      React.createElement(LobbyPrep, {
        room,
        localPlayerId: "host",
        equipment: { headAccessoryId: "cap", heldItemId: "wood-sword" },
        ownedHeadAccessoryIds: ["none", "cap", "headband"],
        ownedHeldItemIds: ["none", "wood-sword"],
        onEquipmentChange: vi.fn(),
        onCopyRoomCode: vi.fn(),
        onToggleReady: vi.fn(),
        onMatchRuleChange: vi.fn(),
        onPromptCategoryChange: vi.fn(),
        onBotDifficultyChange: vi.fn(),
        onReaction: vi.fn(),
        reactionFeedback: INITIAL_REACTION_FEEDBACK,
        remoteReaction: { playerId: "guest", reaction: "よろしく" },
        remoteReactionsEnabled: true
      })
    );

    expect(markup).toContain('data-testid="lobby-prep"');
    expect(markup).toContain("1P");
    expect(markup).toContain("2P");
    expect(markup).toContain("Alice");
    expect(markup).toContain("Bob");
    expect(markup.match(/aria-label="頭装備"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="手持ち装備"/g)).toHaveLength(1);
    expect(markup).toContain("両者READYで開始します");
    expect(markup).toContain("Bob: 「よろしく」");
    expect(markup.match(/lobbyReactionBubble/g)).toHaveLength(1);
  });

  it("explains hidden incoming reactions while keeping lobby sending available", () => {
    const room = {
      roomCode: "ABC123",
      hostPlayerId: "host",
      status: "waiting",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      maxPlayers: 2,
      players: [{
        id: "host",
        nickname: "Alice",
        connected: true,
        ready: false,
        isHost: true,
        isBot: false,
        progressIndex: 0,
        correctCharacters: 0,
        totalTypedCharacters: 0,
        mistakes: 0,
        maxStreak: 0,
        currentStreak: 0,
        wpm: 0,
        accuracy: 100
      }]
    } satisfies RoomState;
    const markup = renderToStaticMarkup(
      React.createElement(LobbyPrep, {
        room,
        localPlayerId: "host",
        equipment: { headAccessoryId: "cap", heldItemId: "wood-sword" },
        ownedHeadAccessoryIds: ["none", "cap", "headband"],
        ownedHeldItemIds: ["none", "wood-sword"],
        onEquipmentChange: vi.fn(),
        onCopyRoomCode: vi.fn(),
        onToggleReady: vi.fn(),
        onMatchRuleChange: vi.fn(),
        onPromptCategoryChange: vi.fn(),
        onBotDifficultyChange: vi.fn(),
        onReaction: vi.fn(),
        reactionFeedback: INITIAL_REACTION_FEEDBACK,
        remoteReaction: null,
        remoteReactionsEnabled: false
      })
    );

    expect(markup).toContain("相手のリアクションは非表示です。自分からは送信できます。");
    expect(markup).not.toContain("reactionButton active");
    expect(markup).not.toContain("reactionButton\" disabled");
  });
});
