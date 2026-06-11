import { describe, expect, it } from "vitest";
import { calculateAccuracy, calculateProgress, calculateWpm, rankPlayers } from "../src";
import type { PlayerState } from "../src";

const basePlayer: PlayerState = {
  id: "p1",
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

  it("ranks players and includes streak and gap", () => {
    const players = rankPlayers(
      [
        { ...basePlayer, id: "winner", progressIndex: 10, finishTimeMs: 1000 },
        { ...basePlayer, id: "loser", progressIndex: 10, finishTimeMs: 1500 }
      ],
      10
    );

    expect(players[0]?.id).toBe("winner");
    expect(players[0]?.finishGap).toBeUndefined();
    expect(players[1]?.id).toBe("loser");
    expect(players[1]?.finishGap).toBe(500);
  });

  it("ranks hp battle players by completion and remaining hp", () => {
    const mixedPlayers = rankPlayers(
      [
        { ...basePlayer, id: "finished", progressIndex: 10, hp: 20, maxHp: 100 },
        { ...basePlayer, id: "stillPlaying", progressIndex: 4, hp: 100, maxHp: 100 }
      ],
      10,
      "hpBattle"
    );

    expect(mixedPlayers[0]?.id).toBe("finished");
    expect(mixedPlayers[1]?.id).toBe("stillPlaying");

    const finishedPlayers = rankPlayers(
      [
        { ...basePlayer, id: "lowHp", progressIndex: 10, hp: 20, maxHp: 100, finishTimeMs: 1000 },
        { ...basePlayer, id: "highHp", progressIndex: 10, hp: 80, maxHp: 100, finishTimeMs: 1200 }
      ],
      10,
      "hpBattle"
    );

    expect(finishedPlayers[0]?.id).toBe("highHp");
    expect(finishedPlayers[1]?.id).toBe("lowHp");
  });
});
