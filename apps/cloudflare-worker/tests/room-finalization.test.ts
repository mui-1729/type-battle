import { describe, expect, it, vi } from "vitest";
import type { MatchResult, PlayerState } from "@type-battle/shared";
import {
  areHumanPlayersFinished,
  finalizeRoomState,
  prepareRoomFinalization,
  type FinalizationPlayer,
  type FinalizationRoom
} from "../src/room-finalization.js";

type TestPlayer = FinalizationPlayer;
type TestRoom = FinalizationRoom<TestPlayer>;

function createPlayer(id: string, overrides: Partial<PlayerState> = {}): TestPlayer {
  return {
    id,
    nickname: id,
    connected: true,
    ready: true,
    isHost: id === "host",
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

function createRoom(matchRule: TestRoom["matchRule"], players: TestPlayer[]): TestRoom {
  return {
    status: "playing",
    matchRule,
    players: new Map(players.map((player) => [player.id, player]))
  };
}

function createResult(): MatchResult {
  return {
    roomCode: "ABC123",
    prompt: {
      id: "prompt-1",
      text: "test",
      category: "short",
      typing: { romaji: "tesuto", hiragana: "てすと" }
    },
    matchRule: "race",
    players: [
      {
        ...createPlayer("host", { finishStatus: "finished" }),
        rank: 1,
        finishGap: undefined
      }
    ]
  };
}

const typingLength = () => 10;

describe("room finalization policy", () => {
  it("marks unfinished race players before finalization", () => {
    const winner = createPlayer("host", { progressIndex: 10, finishStatus: "finished" });
    const opponent = createPlayer("guest", { progressIndex: 4 });
    const room = createRoom("race", [winner, opponent]);

    expect(prepareRoomFinalization(room, typingLength, 1234)).toBe(true);
    expect(opponent.finishStatus).toBe("unfinished");
    expect(opponent.finishedAt).toBe(1234);
    expect(opponent.finishTimeMs).toBeUndefined();
  });

  it("does not finalize time attack from progress completion", () => {
    const room = createRoom("timeAttack", [
      createPlayer("host", { progressIndex: 10, finishStatus: "finished" })
    ]);

    expect(prepareRoomFinalization(room, typingLength, 1234)).toBe(false);
    expect(areHumanPlayersFinished(room, typingLength)).toBe(false);
  });

  it("finalizes HP battle when a player is eliminated", () => {
    const room = createRoom("hpBattle", [
      createPlayer("host", { hp: 100 }),
      createPlayer("guest", { hp: 0, finishStatus: "eliminated" })
    ]);

    expect(prepareRoomFinalization(room, typingLength, 1234)).toBe(true);
  });

  it("marks an unfinished bot when all humans are done", () => {
    const bot = createPlayer("bot", { isBot: true, progressIndex: 3 });
    const room = createRoom("race", [
      createPlayer("host", { progressIndex: 10, finishStatus: "finished" }),
      bot
    ]);

    expect(prepareRoomFinalization(room, typingLength, 5678)).toBe(true);
    expect(bot.finishStatus).toBe("unfinished");
    expect(bot.finishedAt).toBe(5678);
  });

  it("keeps terminal result idempotent", () => {
    const room = createRoom("race", [createPlayer("host")]);
    const result = createResult();
    const create = vi.fn(() => result);

    expect(finalizeRoomState(room, create, 1000)).toBe(result);
    expect(room.status).toBe("finished");
    expect(room.finishedAt).toBe(1000);
    expect(finalizeRoomState(room, create, 2000)).toBe(result);
    expect(room.finishedAt).toBe(1000);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
