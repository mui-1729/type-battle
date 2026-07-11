import { describe, expect, it } from "vitest";
import type { PlayerState } from "@type-battle/shared";
import { reconcileRoomProgress } from "../app/_lib/reconcile-room-progress";

const player: PlayerState = {
  id: "player-1",
  nickname: "Alice",
  connected: true,
  ready: true,
  isHost: true,
  isBot: false,
  progressIndex: 1,
  typingProgressIndex: 3,
  pendingInput: "",
  correctCharacters: 3,
  totalTypedCharacters: 3,
  mistakes: 0,
  maxStreak: 3,
  currentStreak: 3,
  wpm: 60,
  accuracy: 100
};

describe("reconcileRoomProgress", () => {
  it("does not overwrite optimistic local input with a delayed server state", () => {
    const localProgress = {
      progressIndex: 6,
      pendingInput: "",
      correctCharacters: 6,
      totalTypedCharacters: 6,
      mistakes: 0,
      currentStreak: 6,
      maxStreak: 6
    };

    expect(reconcileRoomProgress(localProgress, player)).toBe(localProgress);
  });

  it("restores pending input when the server state is at least as recent", () => {
    const localProgress = {
      progressIndex: 0,
      pendingInput: "",
      correctCharacters: 0,
      totalTypedCharacters: 0,
      mistakes: 0,
      currentStreak: 0,
      maxStreak: 0
    };

    expect(reconcileRoomProgress(localProgress, {
      ...player,
      typingProgressIndex: 0,
      pendingInput: "k",
      correctCharacters: 1,
      totalTypedCharacters: 1,
      currentStreak: 1,
      maxStreak: 1
    })).toMatchObject({ progressIndex: 0, pendingInput: "k", totalTypedCharacters: 1 });
  });
});
