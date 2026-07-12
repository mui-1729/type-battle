import { describe, expect, it } from "vitest";
import type { MatchResult, PlayerState, RoomState } from "@type-battle/shared";
import {
  BATTLE_STAGE_COORDINATES,
  assignBattleSides,
  createBattleStageViewModel,
  getResultAnimationTransition,
  toCargoPosition,
  toProgressRatio,
  toRacePosition
} from "../app/_lib/battle-stage";

const prompt = {
  id: "prompt-1",
  text: "テスト",
  category: "short" as const,
  typing: {
    romaji: "abcdefghij",
    hiragana: "あいうえおかきくけこ"
  }
};

const leftPlayer = createPlayer({ id: "player-b", nickname: "Alice" });
const rightPlayer = createPlayer({ id: "player-a", nickname: "COM", isBot: true });

describe("battle stage coordinate transforms", () => {
  it("converts progress at 0%, 50%, and 100% to each running lane", () => {
    expect(toRacePosition(0, "left")).toBe(BATTLE_STAGE_COORDINATES.leftStart);
    expect(toRacePosition(0.5, "left")).toBe((BATTLE_STAGE_COORDINATES.leftStart + BATTLE_STAGE_COORDINATES.leftCargo) / 2);
    expect(toRacePosition(1, "left")).toBe(BATTLE_STAGE_COORDINATES.leftCargo);
    expect(toRacePosition(0, "right")).toBe(BATTLE_STAGE_COORDINATES.rightStart);
    expect(toRacePosition(0.5, "right")).toBe((BATTLE_STAGE_COORDINATES.rightStart + BATTLE_STAGE_COORDINATES.rightCargo) / 2);
    expect(toRacePosition(1, "right")).toBe(BATTLE_STAGE_COORDINATES.rightCargo);
  });

  it("clamps progress and handles an invalid prompt length", () => {
    expect(toProgressRatio(-5, 10)).toBe(0);
    expect(toProgressRatio(5, 10)).toBe(0.5);
    expect(toProgressRatio(15, 10)).toBe(1);
    expect(toProgressRatio(5, 0)).toBe(0);
  });

  it("maps equal and unequal HP ratios to a safe cargo position", () => {
    expect(toCargoPosition(50, 100, 25, 50)).toBe(50);
    expect(toCargoPosition(100, 100, 50, 100)).toBe(65);
    expect(toCargoPosition(50, 100, 100, 100)).toBe(35);
    expect(toCargoPosition(0, 100, 100, 100)).toBe(BATTLE_STAGE_COORDINATES.cargoMin);
    expect(toCargoPosition(100, 100, 0, 100)).toBe(BATTLE_STAGE_COORDINATES.cargoMax);
  });

  it("falls back to the center when max HP is zero, missing, or invalid", () => {
    expect(toCargoPosition(50, 0, 50, 100)).toBe(BATTLE_STAGE_COORDINATES.cargoCenter);
    expect(toCargoPosition(50, undefined, 50, 100)).toBe(BATTLE_STAGE_COORDINATES.cargoCenter);
    expect(toCargoPosition(Number.NaN, 100, 50, 100)).toBe(BATTLE_STAGE_COORDINATES.cargoCenter);
  });
});

describe("battle stage view model", () => {
  it("pins the local player to the left independent of the player array order", () => {
    expect(assignBattleSides([rightPlayer, leftPlayer], leftPlayer.id)).toEqual({
      leftPlayerId: leftPlayer.id,
      rightPlayerId: rightPlayer.id
    });
    expect(assignBattleSides([leftPlayer, rightPlayer], leftPlayer.id)).toEqual({
      leftPlayerId: leftPlayer.id,
      rightPlayerId: rightPlayer.id
    });
  });

  it("uses a deterministic id order before a local player id is available", () => {
    expect(assignBattleSides([leftPlayer, rightPlayer], "")).toEqual({
      leftPlayerId: rightPlayer.id,
      rightPlayerId: leftPlayer.id
    });
  });

  it("overlays authoritative result state without using rank order for sides", () => {
    const room = createRoom({
      status: "finished",
      matchRule: "hpBattle",
      players: [{ ...leftPlayer, progressIndex: 4 }, rightPlayer]
    });
    const result: MatchResult = {
      roomCode: room.roomCode,
      prompt,
      matchRule: "race",
      players: [
        { ...rightPlayer, rank: 1, maxStreak: 10, finishGap: 0, progressIndex: 10, finishStatus: "finished" },
        { ...leftPlayer, rank: 2, maxStreak: 4, finishGap: 200, progressIndex: 8, finishStatus: "finished" }
      ]
    };

    const view = createBattleStageViewModel(room, result, leftPlayer.id);

    expect(view.mode).toBe("race");
    expect(view.leftPlayer?.id).toBe(leftPlayer.id);
    expect(view.rightPlayer?.id).toBe(rightPlayer.id);
    expect(view.rightPlayer?.progressRatio).toBe(1);
    expect(view.winnerId).toBe(rightPlayer.id);
  });

  it("preserves reconnecting and forfeited server states", () => {
    const room = createRoom({
      players: [
        { ...leftPlayer, connected: false },
        { ...rightPlayer, forfeited: true, finishStatus: "forfeited" }
      ]
    });

    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    expect(view.leftPlayer?.status).toBe("reconnecting");
    expect(view.rightPlayer?.status).toBe("forfeited");
  });

  it("marks players active during a match even after the server clears ready flags", () => {
    const room = createRoom({
      status: "playing",
      players: [{ ...leftPlayer, ready: false }, { ...rightPlayer, ready: false }]
    });

    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    expect(view.leftPlayer?.status).toBe("active");
    expect(view.rightPlayer?.status).toBe("active");
  });

  it("resets the result animation when a rematch clears the result", () => {
    expect(getResultAnimationTransition(null, "ROOM01:player-a")).toBe("enter");
    expect(getResultAnimationTransition("ROOM01:player-a", "ROOM01:player-a")).toBe("stable");
    expect(getResultAnimationTransition("ROOM01:player-a", null)).toBe("reset");
    expect(getResultAnimationTransition(null, null)).toBe("stable");
  });
});

function createPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "player",
    nickname: "Player",
    connected: true,
    ready: true,
    isHost: false,
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

function createRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: "ROOM01",
    hostPlayerId: leftPlayer.id,
    status: "playing",
    matchRule: "race",
    botDifficulty: "normal",
    promptCategory: "short",
    prompt,
    players: [leftPlayer, rightPlayer],
    maxPlayers: 2,
    ...overrides
  };
}
