import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatchResult, PlayerState, RoomState } from "@type-battle/shared";
import { getStageSummary } from "../app/_components/battle-stage";
import { HpPushStage } from "../app/_components/hp-push-stage";
import { RaceStage } from "../app/_components/race-stage";
import {
  BATTLE_STAGE_COORDINATES,
  assignBattleSides,
  createBattleStageViewModel,
  getHpAdvantage,
  getResultAnimationTransition,
  toCargoPosition,
  toProgressRatio,
  toRacePosition
} from "../app/_lib/battle-stage";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const prompt = {
  id: "prompt-1",
  text: "テスト",
  category: "short" as const,
  typing: {
    romaji: "abcdefghij",
    hiragana: "あいうえおかきくけこ"
  }
};

const leftPlayer = createPlayer({ id: "player-b", nickname: "Alice", isHost: true });
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

  it("clamps HP below zero and above max before calculating pressure", () => {
    expect(toCargoPosition(150, 100, -20, 100)).toBe(BATTLE_STAGE_COORDINATES.cargoMax);
    expect(toCargoPosition(-20, 100, 150, 100)).toBe(BATTLE_STAGE_COORDINATES.cargoMin);
  });

  it("reports HP advantage without treating invalid values as a winner", () => {
    expect(getHpAdvantage(50, 100, 25, 50)).toBe("even");
    expect(getHpAdvantage(100, 100, 50, 100)).toBe("left");
    expect(getHpAdvantage(25, 100, 100, 100)).toBe("right");
    expect(getHpAdvantage(50, 0, 50, 100)).toBe("unknown");
  });
});

describe("battle stage view model", () => {
  it("keeps the host in the 1P lane independent of the player array order", () => {
    expect(assignBattleSides([rightPlayer, leftPlayer], rightPlayer.id)).toEqual({
      leftPlayerId: leftPlayer.id,
      rightPlayerId: rightPlayer.id
    });
    expect(assignBattleSides([leftPlayer, rightPlayer], rightPlayer.id)).toEqual({
      leftPlayerId: leftPlayer.id,
      rightPlayerId: rightPlayer.id
    });
  });

  it("uses a deterministic id order before a local player id is available", () => {
    expect(assignBattleSides([leftPlayer, rightPlayer], "")).toEqual({
      leftPlayerId: leftPlayer.id,
      rightPlayerId: rightPlayer.id
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

  it("keeps a departed opponent from the result and reports the confirmed winner", () => {
    const room = createRoom({
      status: "finished",
      players: [leftPlayer]
    });
    const result = createResult(rightPlayer.id);

    const view = createBattleStageViewModel(room, result, leftPlayer.id);

    expect(view.players).toHaveLength(2);
    expect(view.leftPlayer?.id).toBe(leftPlayer.id);
    expect(view.rightPlayer?.id).toBe(rightPlayer.id);
    expect(view.rightPlayer?.isWinner).toBe(true);
    expect(view.rightPlayer?.progressRatio).toBe(1);
    expect(getStageSummary(view)).toBe("COM の勝利");
  });

  it("still reports a missing opponent while waiting without a result", () => {
    const view = createBattleStageViewModel(createRoom({ status: "waiting", players: [leftPlayer] }), null, leftPlayer.id);

    expect(getStageSummary(view)).toBe("対戦相手を待っています");
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

describe("race and time attack presentation", () => {
  it("keeps completed players in separate lanes without claiming cargo before a result", () => {
    const room = createRoom({
      players: [
        { ...leftPlayer, progressIndex: 10 },
        { ...rightPlayer, progressIndex: 10 }
      ]
    });
    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(RaceStage, { view, timeAttackExpired: false }));

    expect(markup).toContain('data-stage-state="goal-wait"');
    expect(markup).toContain('data-result-ready="false"');
    expect(markup.match(/class="raceLane /g)).toHaveLength(2);
    expect(markup).toContain('aria-valuenow="100"');
    expect(markup).toContain('class="raceGoalTape"');
    expect(markup).not.toContain('data-outcome="winner"');
  });

  it("marks only the server-ranked winner and claims cargo after the result", () => {
    const room = createRoom({ status: "finished" });
    const leftWinnerView = createBattleStageViewModel(room, createResult(leftPlayer.id), leftPlayer.id);
    const rightWinnerView = createBattleStageViewModel(room, createResult(rightPlayer.id), leftPlayer.id);
    const leftMarkup = renderToStaticMarkup(React.createElement(RaceStage, {
      view: leftWinnerView,
      timeAttackExpired: false
    }));
    const rightMarkup = renderToStaticMarkup(React.createElement(RaceStage, {
      view: rightWinnerView,
      timeAttackExpired: false
    }));

    expect(leftMarkup).toContain('data-result-ready="true"');
    expect(leftMarkup).toContain('data-player-id="player-b" data-outcome="winner"');
    expect(leftMarkup).toContain('class="raceWinnerCallout"');
    expect(leftMarkup).toContain('data-outcome="winner"');
    expect(rightMarkup).toContain('data-player-id="player-a" data-outcome="winner"');
  });

  it("shows a stopped time attack state until the server result arrives", () => {
    const room = createRoom({ matchRule: "timeAttack" });
    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(RaceStage, { view, timeAttackExpired: true }));

    expect(markup).toContain('data-stage-state="time-expired"');
    expect(markup).toContain('data-time-expired="true"');
    expect(markup).toContain('data-pose="tired"');
    expect(markup).toContain('class="raceLane raceLaneOne"');
    expect(markup).toContain("判定待ち");
    expect(markup).not.toContain('data-outcome="winner"');
  });

  it("does not render losing outcomes during the finished-state result gap", () => {
    const room = createRoom({ status: "finished" });
    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(RaceStage, { view, timeAttackExpired: false }));

    expect(markup).toContain('data-stage-state="result-pending"');
    expect(markup).toContain('data-outcome="neutral"');
    expect(markup).not.toContain('data-outcome="loser"');
  });
});

describe("HP push presentation", () => {
  it("keeps equal HP centered and labels both players as even", () => {
    const room = createRoom({
      matchRule: "hpBattle",
      players: [
        { ...leftPlayer, hp: 50, maxHp: 100 },
        { ...rightPlayer, hp: 25, maxHp: 50 }
      ]
    });
    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(HpPushStage, { view }));

    expect(markup).toContain('data-hp-advantage="even"');
    expect(markup).toContain('data-cargo-position="50.0"');
    expect(markup).toContain('data-advantage="even"');
    expect(markup).toContain("互角");
    expect(markup).toContain('class="hpBattlePlayer hpBattlePlayerLeft"');
    expect(markup).toContain('class="hpBattlePlayer hpBattlePlayerRight"');
    expect(markup).toContain('aria-label="Alice のHP"');
    expect(markup).toContain('aria-label="COM のHP"');
    expect(markup).toContain("hpBattleVs");
  });

  it("shows the lower-HP opponent as trailing with a live HP bar", () => {
    const room = createRoom({
      matchRule: "hpBattle",
      players: [
        { ...leftPlayer, hp: 100, maxHp: 100 },
        { ...rightPlayer, hp: 25, maxHp: 100 }
      ]
    });
    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(HpPushStage, { view }));

    expect(markup).toContain('data-hp-advantage="left"');
    expect(markup).toContain('data-cargo-position="72.5"');
    expect(markup).toContain("COM");
    expect(markup).toContain('aria-label="COM のHP"');
    expect(markup).toContain('data-advantage="trailing"');
  });

  it("does not show KO before a server result confirms elimination", () => {
    const room = createRoom({
      matchRule: "hpBattle",
      players: [
        { ...leftPlayer, hp: 0, maxHp: 100 },
        { ...rightPlayer, hp: 100, maxHp: 100 }
      ]
    });
    const view = createBattleStageViewModel(room, null, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(HpPushStage, { view }));

    expect(markup).toContain('data-cargo-position="20.0"');
    expect(markup).toContain('data-result-ready="false"');
    expect(markup).not.toContain("KO!");
  });

  it("shows KO and impact styling only for a confirmed eliminated loser", () => {
    const room = createRoom({
      status: "finished",
      matchRule: "hpBattle",
      players: [
        { ...leftPlayer, hp: 0, maxHp: 100, finishStatus: "eliminated" },
        { ...rightPlayer, hp: 100, maxHp: 100, finishStatus: "finished" }
      ]
    });
    const result = createHpResult({ loserFinishStatus: "eliminated", loserHp: 0 });
    const view = createBattleStageViewModel(room, result, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(HpPushStage, { view }));

    expect(markup).toContain('data-stage-state="elimination-result"');
    expect(markup).toContain('data-player-id="player-b"');
    expect(markup).toContain('data-impact="large"');
    expect(markup).toContain("KO!");
    expect(markup).toContain("COM の勝利");
  });

  it("shows DOUBLE KO when both server result players have zero HP", () => {
    const room = createRoom({ status: "finished", matchRule: "hpBattle" });
    const result = createHpResult({ loserFinishStatus: "eliminated", loserHp: 0 });
    result.players.forEach((player) => {
      player.hp = 0;
      player.finishStatus = "eliminated";
    });
    const view = createBattleStageViewModel(room, result, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(HpPushStage, { view }));

    expect(markup).toContain("DOUBLE KO");
  });

  it("does not crush a completed or forfeited loser", () => {
    const room = createRoom({ status: "finished", matchRule: "hpBattle" });
    const finishedView = createBattleStageViewModel(
      room,
      createHpResult({ loserFinishStatus: "finished", loserHp: 0 }),
      leftPlayer.id
    );
    const forfeitedView = createBattleStageViewModel(
      room,
      createHpResult({ loserFinishStatus: "forfeited", loserHp: 0 }),
      leftPlayer.id
    );
    const finishedMarkup = renderToStaticMarkup(React.createElement(HpPushStage, { view: finishedView }));
    const forfeitedMarkup = renderToStaticMarkup(React.createElement(HpPushStage, { view: forfeitedView }));

    expect(finishedMarkup).not.toContain('data-eliminated="true"');
    expect(finishedMarkup).not.toContain("battleStageDefeatEffect");
    expect(forfeitedMarkup).not.toContain('data-eliminated="true"');
    expect(forfeitedMarkup).not.toContain("battleStageDefeatEffect");
    expect(forfeitedMarkup).toContain("棄権");
  });

  it("does not turn a disconnected unfinished player into an elimination", () => {
    const room = createRoom({ status: "finished", matchRule: "hpBattle" });
    const result = createHpResult({ loserFinishStatus: "unfinished", loserHp: 0 });
    const disconnectedLoser = result.players.find((player) => player.id === leftPlayer.id);
    if (disconnectedLoser) {
      disconnectedLoser.connected = false;
    }
    const view = createBattleStageViewModel(room, result, leftPlayer.id);
    const markup = renderToStaticMarkup(React.createElement(HpPushStage, { view }));

    expect(markup).not.toContain('data-eliminated="true"');
    expect(markup).not.toContain("battleStageDefeatEffect");
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

function createResult(winnerId: string): MatchResult {
  const winner = winnerId === leftPlayer.id ? leftPlayer : rightPlayer;
  const loser = winnerId === leftPlayer.id ? rightPlayer : leftPlayer;

  return {
    roomCode: "ROOM01",
    prompt,
    matchRule: "race",
    players: [
      { ...winner, rank: 1, maxStreak: 10, finishGap: 0, finishStatus: "finished" },
      { ...loser, rank: 2, maxStreak: 4, finishGap: 200, finishStatus: "finished" }
    ]
  };
}

function createHpResult({
  loserFinishStatus,
  loserHp
}: {
  loserFinishStatus: "finished" | "forfeited" | "eliminated" | "unfinished";
  loserHp: number;
}): MatchResult {
  return {
    roomCode: "ROOM01",
    prompt,
    matchRule: "hpBattle",
    players: [
      {
        ...rightPlayer,
        hp: 100,
        maxHp: 100,
        rank: 1,
        maxStreak: 10,
        finishGap: 0,
        finishStatus: "finished"
      },
      {
        ...leftPlayer,
        hp: loserHp,
        maxHp: 100,
        rank: 2,
        maxStreak: 4,
        finishGap: 200,
        finishStatus: loserFinishStatus,
        ...(loserFinishStatus === "forfeited" ? { forfeited: true } : {})
      }
    ]
  };
}
