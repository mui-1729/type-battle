import { describe, expect, it } from "vitest";
import type { PlayerState, RoomState } from "@type-battle/shared";
import { getHomePageViewModel, type HomePageViewModelInput } from "../app/_lib/home-page-view-model";
import { createEmptyProgress } from "../app/_lib/typing-progress";

const prompt = {
  id: "prompt-1",
  text: "テスト",
  category: "short" as const,
  typing: {
    romaji: "tesuto",
    hiragana: "てすと"
  }
};

function createPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "player-1",
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
    accuracy: 100,
    ...overrides
  };
}

function createRoom(player: PlayerState): RoomState {
  return {
    roomCode: "AB23CD",
    hostPlayerId: player.id,
    status: "playing",
    matchRule: "timeAttack",
    botDifficulty: "normal",
    promptCategory: "short",
    prompt,
    serverStartAt: 1_000,
    matchEndsAt: 61_000,
    players: [player],
    maxPlayers: 2
  };
}

function createInput(overrides: Partial<HomePageViewModelInput> = {}): HomePageViewModelInput {
  return {
    now: 5_000,
    room: null,
    playerId: "",
    currentPlayer: null,
    result: null,
    practiceSession: null,
    practiceResult: null,
    dailyChallengeNow: new Date("2026-07-16T00:00:00+09:00"),
    dailyChallengeRecord: null,
    mistakeTrendRecord: null,
    localProgress: createEmptyProgress(),
    practiceProgress: createEmptyProgress(),
    connected: false,
    lastProgressSentAt: null,
    syncClock: 5_000,
    matchTimerMs: 56_000,
    ...overrides
  };
}

describe("getHomePageViewModel", () => {
  it("keeps authoritative room data while overlaying optimistic local progress", () => {
    const serverPlayer = createPlayer({
      progressIndex: 1,
      totalTypedCharacters: 1,
      correctCharacters: 1,
      deviceKind: "mobile"
    });
    const room = createRoom(serverPlayer);
    const view = getHomePageViewModel(createInput({
      room,
      playerId: serverPlayer.id,
      currentPlayer: serverPlayer,
      connected: true,
      localProgress: {
        ...createEmptyProgress(),
        progressIndex: 2,
        correctCharacters: 2,
        totalTypedCharacters: 2
      }
    }));

    expect(view.isRoomPlaying).toBe(true);
    expect(view.isTimeAttackPlaying).toBe(true);
    expect(view.activeProgressPercent).toBeGreaterThan(0);
    expect(view.displayRoom?.players[0]).toMatchObject({
      progressIndex: 2,
      correctCharacters: 2,
      totalTypedCharacters: 2
    });
    expect(room.players[0]).toMatchObject({
      progressIndex: 1,
      totalTypedCharacters: 1
    });
  });

  it("uses practice state when no room is active", () => {
    const view = getHomePageViewModel(createInput({
      practiceSession: {
        practiceId: "practice-1",
        prompt,
        startedAt: 1_000,
        category: "short",
        deviceKind: "mobile",
        mode: "practice"
      },
      practiceProgress: {
        ...createEmptyProgress(),
        progressIndex: 2,
        correctCharacters: 2,
        totalTypedCharacters: 2
      }
    }));

    expect(view.isPracticePlaying).toBe(true);
    expect(view.activeInputDeviceKind).toBe("mobile");
    expect(view.activeTypingText).toBe(prompt.typing.hiragana);
    expect(view.activeProgressPercent).toBeGreaterThan(0);
    expect(view.typingInputKey).toBe("practice-1:prompt-1");
  });
});
