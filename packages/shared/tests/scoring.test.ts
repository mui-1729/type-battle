import { describe, expect, it } from "vitest";
import { calculateAccuracy, calculateProgress, calculateWpm, rankPlayers } from "../src";
import type { PlayerState } from "../src";

const basePlayer: PlayerState = {
  id: "p1",
  nickname: "Player",
  connected: true,
  ready: true,
  isHost: false,
  progressIndex: 0,
  correctCharacters: 0,
  totalTypedCharacters: 0,
  mistakes: 0,
  wpm: 0,
  accuracy: 100
};

describe("scoring", () => {
  it("calculates WPM using five characters per word", () => {
    expect(calculateWpm(50, 60_000)).toBe(10);
  });

  it("keeps accuracy at 100 before typing starts", () => {
    expect(calculateAccuracy(0, 0)).toBe(100);
  });

  it("calculates accuracy from correct and typed characters", () => {
    expect(calculateAccuracy(8, 10)).toBe(80);
  });

  it("caps progress at 100 percent", () => {
    expect(calculateProgress(120, 100)).toBe(100);
  });

  it("ranks finished players by finish time", () => {
    const players = rankPlayers(
      [
        { ...basePlayer, id: "slow", progressIndex: 10, finishTimeMs: 1200 },
        { ...basePlayer, id: "fast", progressIndex: 10, finishTimeMs: 900 }
      ],
      10
    );

    expect(players[0]?.id).toBe("fast");
  });

  it("ranks unfinished players by progress before speed", () => {
    const players = rankPlayers(
      [
        { ...basePlayer, id: "fast", progressIndex: 4, wpm: 100 },
        { ...basePlayer, id: "ahead", progressIndex: 7, wpm: 20 }
      ],
      10
    );

    expect(players[0]?.id).toBe("ahead");
  });
});
