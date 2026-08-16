import { describe, expect, it } from "vitest";
import {
  createMatchTraceId,
  inferMatchFinalizeReason,
  summarizeMatchPlayers
} from "../src/match-observability";

const player = {
  id: "guest-1",
  isBot: false,
  connected: true,
  progressIndex: 10,
  totalTypedCharacters: 12,
  mistakes: 2
};

describe("match observability", () => {
  it("creates one stable trace id per room round", () => {
    expect(createMatchTraceId(" ab12cd ", 4)).toBe("AB12CD:4");
  });

  it("prioritizes an explicit forfeit reason", () => {
    expect(inferMatchFinalizeReason({
      matchRule: "race",
      now: 1_000,
      players: [{ ...player, finishStatus: "forfeited" }]
    })).toBe("forfeit");
  });

  it("detects time attack expiry", () => {
    expect(inferMatchFinalizeReason({
      matchRule: "timeAttack",
      now: 10_000,
      matchEndsAt: 9_999,
      players: [player]
    })).toBe("time_attack_expired");
  });

  it("detects HP elimination before a time-limit fallback", () => {
    expect(inferMatchFinalizeReason({
      matchRule: "hpBattle",
      now: 10_000,
      matchEndsAt: 9_999,
      players: [{ ...player, hp: 0, finishStatus: "eliminated" }]
    })).toBe("hp_elimination");
  });

  it("detects a race winner", () => {
    expect(inferMatchFinalizeReason({
      matchRule: "race",
      now: 10_000,
      players: [{ ...player, finishStatus: "finished" }]
    })).toBe("race_finished");
  });

  it("summarizes players without nickname or session metadata", () => {
    expect(summarizeMatchPlayers([{ ...player, hp: 70, finishStatus: "finished" }]))
      .toEqual([{
        playerId: "guest-1",
        isBot: false,
        connected: true,
        progressIndex: 10,
        totalTypedCharacters: 12,
        mistakes: 2,
        hp: 70,
        finishStatus: "finished"
      }]);
  });
});
