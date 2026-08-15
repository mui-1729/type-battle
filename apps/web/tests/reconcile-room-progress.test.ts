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
      inputMode: "romaji",
      typingProgressIndex: 0,
      pendingInput: "k",
      correctCharacters: 1,
      totalTypedCharacters: 1,
      currentStreak: 1,
      maxStreak: 1
    })).toMatchObject({ progressIndex: 0, pendingInput: "k", totalTypedCharacters: 1 });
  });

  it("uses canonical progress for desktop kana input instead of the romaji guide coordinate", () => {
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
      deviceKind: "desktop",
      inputMode: "kana",
      progressIndex: 1,
      typingProgressIndex: 2,
      totalTypedCharacters: 1,
      correctCharacters: 1,
      currentStreak: 1,
      maxStreak: 1
    })).toMatchObject({ progressIndex: 1, pendingInput: "" });
  });

  it("restores romaji partial input on a mobile physical keyboard", () => {
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
      deviceKind: "mobile",
      inputMode: "romaji",
      progressIndex: 0,
      typingProgressIndex: 0,
      pendingInput: "k",
      totalTypedCharacters: 1,
      correctCharacters: 1,
      currentStreak: 1,
      maxStreak: 1
    })).toMatchObject({ progressIndex: 0, pendingInput: "k" });
  });

  it("falls back to the current local mode for older server states without inputMode", () => {
    const localProgress = {
      progressIndex: 0,
      pendingInput: "",
      correctCharacters: 0,
      totalTypedCharacters: 0,
      mistakes: 0,
      currentStreak: 0,
      maxStreak: 0
    };
    const legacyPlayer: PlayerState = {
      ...player,
      deviceKind: "desktop",
      progressIndex: 1,
      typingProgressIndex: 2,
      totalTypedCharacters: 1,
      correctCharacters: 1,
      currentStreak: 1,
      maxStreak: 1
    };

    expect(reconcileRoomProgress(localProgress, legacyPlayer, "kana"))
      .toMatchObject({ progressIndex: 1, pendingInput: "" });
  });
});
