import type { MatchRule, PlayerResult, PlayerState } from "./game-state.js";

const WORD_LENGTH = 5;
const MIN_ELAPSED_MS = 1;

export function calculateWpm(correctCharacters: number, elapsedMs: number): number {
  const safeElapsedMs = Math.max(elapsedMs, MIN_ELAPSED_MS);
  const minutes = safeElapsedMs / 60_000;
  return roundToOne((correctCharacters / WORD_LENGTH) / minutes);
}

export function calculateAccuracy(
  correctCharacters: number,
  totalTypedCharacters: number
): number {
  if (totalTypedCharacters <= 0) {
    return 100;
  }

  return roundToOne((correctCharacters / totalTypedCharacters) * 100);
}

export function calculateProgress(progressIndex: number, promptLength: number): number {
  if (promptLength <= 0) {
    return 0;
  }

  return Math.min(100, roundToOne((progressIndex / promptLength) * 100));
}

export function rankPlayers(
  players: PlayerState[],
  promptLength: number | ((player: PlayerState) => number),
  matchRule: MatchRule = "race"
): PlayerResult[] {
  const sorted = [...players].sort((a, b) => comparePlayers(a, b, promptLength, matchRule));

  const getPromptLength = typeof promptLength === "function" ? promptLength : () => promptLength;
  const winner = sorted[0];
  const winnerTime = isPlayerFinished(winner, getPromptLength) ? winner?.finishTimeMs : undefined;

  return sorted.map((player, index): PlayerResult => {
    const isFinished = isPlayerFinished(player, getPromptLength);
    const finishGap =
      isFinished &&
      winner &&
      player.id !== winner.id &&
      winnerTime !== undefined &&
      player.finishTimeMs !== undefined
        ? player.finishTimeMs - winnerTime
        : undefined;

    return {
      ...player,
      rank: index + 1,
      maxStreak: player.maxStreak,
      finishGap
    };
  });
}

function comparePlayers(
  a: PlayerState,
  b: PlayerState,
  promptLength: number | ((player: PlayerState) => number),
  matchRule: MatchRule
): number {
  const getPromptLength = typeof promptLength === "function" ? promptLength : () => promptLength;
  const aFinished = isPlayerFinished(a, getPromptLength);
  const bFinished = isPlayerFinished(b, getPromptLength);

  if (matchRule === "timeAttack") {
    if (a.progressIndex !== b.progressIndex) {
      return b.progressIndex - a.progressIndex;
    }

    if (a.accuracy !== b.accuracy) {
      return b.accuracy - a.accuracy;
    }

    if (a.mistakes !== b.mistakes) {
      return a.mistakes - b.mistakes;
    }

    if (a.maxStreak !== b.maxStreak) {
      return b.maxStreak - a.maxStreak;
    }

    return 0;
  }

  if (matchRule === "hpBattle") {
    if (aFinished && bFinished) {
      const aHp = a.hp ?? 0;
      const bHp = b.hp ?? 0;

      if (aHp !== bHp) {
        return bHp - aHp;
      }
    } else if (aFinished !== bFinished) {
      return aFinished ? -1 : 1;
    } else {
      const aHp = a.hp ?? 0;
      const bHp = b.hp ?? 0;

      if (aHp !== bHp) {
        return bHp - aHp;
      }
    }
  }

  if (aFinished && bFinished) {
    return (a.finishTimeMs ?? Number.MAX_SAFE_INTEGER) - (b.finishTimeMs ?? Number.MAX_SAFE_INTEGER);
  }

  if (aFinished !== bFinished) {
    return aFinished ? -1 : 1;
  }

  if (a.progressIndex !== b.progressIndex) {
    return b.progressIndex - a.progressIndex;
  }

  if (a.wpm !== b.wpm) {
    return b.wpm - a.wpm;
  }

  if (a.accuracy !== b.accuracy) {
    return b.accuracy - a.accuracy;
  }

  return a.mistakes - b.mistakes;
}

function isPlayerFinished(
  player: PlayerState | undefined,
  getPromptLength: (player: PlayerState) => number
): player is PlayerState {
  if (!player) {
    return false;
  }

  if (player.finishStatus !== undefined) {
    return player.finishStatus === "finished";
  }

  return player.progressIndex >= getPromptLength(player);
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}
