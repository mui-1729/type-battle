import { advanceRomajiProgress, buildRomajiTypingPlan, getRomajiTypingUnitIndex } from "./romaji-typing.js";
import { calculateAccuracy, calculateWpm } from "./scoring.js";
import { advanceProgress, createEmptyProgress } from "./typing-progress.js";
import type { Prompt, TypingProgress } from "./game-state.js";
import type { InternalPlayer, InternalRoom } from "./room-engine.js";

const HP_BATTLE_MAX_HP = 100;
const HP_BATTLE_MISTAKE_DAMAGE = 1;
const MISTAKE_GUARD_STREAK = 20;
const MAX_MISTAKE_GUARDS = 3;

type ProgressState = ReturnType<typeof createProgressState>;

export function applyProgress(player: InternalPlayer, room: InternalRoom, payload: TypingProgress): boolean {
  if (!isValidTypingProgressPayload(payload) || payload.sequence <= player.lastInputSequence) {
    return false;
  }

  player.lastInputSequence = payload.sequence;
  const promptLength = getPromptLength(room);
  if (!room.prompt || promptLength <= 0) {
    return false;
  }

  const previousProgressIndex = player.progressIndex;
  const previousMistakes = player.mistakes;
  const now = Date.now();
  const startedAt = room.serverStartAt ?? now;
  const loopingMatch = room.matchRule === "timeAttack" || room.matchRule === "hpBattle";
  const kanaInput = containsKana(payload.input);
  let attackDamageDelta = 0;

  if (kanaInput) {
    for (const typedChar of Array.from(payload.input)) {
      const expectedIndex = loopingMatch ? modulo(player.progressIndex, promptLength) : player.progressIndex;
      const before = createProgressState(player);
      const after = advanceProgress(before, room.prompt.typing.hiragana[expectedIndex], typedChar);
      applyGuardedProgress(player, before, after);
      player.progressIndex = loopingMatch ? modulo(after.progressIndex, promptLength) : after.progressIndex;
      const completedCharacters = Math.max(after.progressIndex - before.progressIndex, 0);
      attackDamageDelta += completedCharacters;
    }

    player.typingProgressIndex = getRomajiProgressIndexForCanonicalProgress(room.prompt, player.progressIndex, loopingMatch);
  } else {
    const plan = buildRomajiTypingPlan(room.prompt.typing.hiragana);
    const guideLength = plan.guide.length;
    for (const typedChar of Array.from(payload.input)) {
      const cursor = loopingMatch && guideLength > 0 ? modulo(player.typingProgressIndex, guideLength) : player.typingProgressIndex;
      const cycleBase = loopingMatch ? player.typingProgressIndex - cursor : 0;
      const before = createProgressState(player, cursor);
      const beforeUnitIndex = getRomajiTypingUnitIndex(plan, before.progressIndex);
      const after = advanceRomajiProgress(before, plan, typedChar);
      const completedUnit = after.progressIndex > before.progressIndex ? plan.units[beforeUnitIndex] : undefined;

      applyGuardedProgress(player, before, after);
      player.typingProgressIndex = cycleBase + after.progressIndex;

      if (completedUnit) {
        const canonicalDelta = Array.from(completedUnit.hiragana).length;
        player.progressIndex = loopingMatch
          ? modulo(player.progressIndex + canonicalDelta, promptLength)
          : clamp(player.progressIndex + canonicalDelta, 0, promptLength);
        attackDamageDelta += completedUnit.guide.length;
      }
    }
  }

  if (!loopingMatch) {
    player.progressIndex = clamp(player.progressIndex, 0, promptLength);
  }
  player.wpm = calculateWpm(player.correctCharacters, now - startedAt);
  player.accuracy = calculateAccuracy(player.correctCharacters, player.totalTypedCharacters);

  if (room.matchRule !== "hpBattle") {
    if (!loopingMatch && player.progressIndex >= promptLength && previousProgressIndex < promptLength) {
      player.finishedAt = now;
      player.finishTimeMs = now - startedAt;
      player.finishStatus = "finished";
    }
    return true;
  }

  const mistakeDelta = Math.max(player.mistakes - previousMistakes, 0);
  if (attackDamageDelta > 0) {
    for (const opponent of room.players.values()) {
      if (opponent.id === player.id || opponent.hp === undefined || opponent.hp <= 0) {
        continue;
      }
      applyHpDamage(opponent, attackDamageDelta, room, now);
    }
  }

  if (mistakeDelta > 0) {
    applyHpDamage(player, mistakeDelta * HP_BATTLE_MISTAKE_DAMAGE, room, now);
  }

  if (player.progressIndex >= promptLength && previousProgressIndex < promptLength) {
    player.finishedAt = now;
    player.finishTimeMs = now - startedAt;
    player.finishStatus = "finished";
  }

  return true;
}

export function applyBotProgress(
  bot: InternalPlayer,
  room: InternalRoom,
  charsToAdd: number,
  totalTypedDelta: number,
  isMistake: boolean
): void {
  const promptLength = getPromptLength(room);
  const now = Date.now();
  const startedAt = room.serverStartAt ?? now;
  const loopingMatch = room.matchRule === "timeAttack" || room.matchRule === "hpBattle";
  const progressDelta = loopingMatch
    ? charsToAdd
    : Math.min(charsToAdd, Math.max(promptLength - bot.progressIndex, 0));

  bot.totalTypedCharacters += totalTypedDelta;

  if (isMistake) {
    if ((bot.mistakeGuards ?? 0) > 0) {
      bot.mistakeGuards = Math.max((bot.mistakeGuards ?? 0) - 1, 0);
    } else {
      bot.mistakes += totalTypedDelta;
      bot.currentStreak = 0;
      if (room.matchRule === "hpBattle") {
        applyHpDamage(bot, totalTypedDelta * HP_BATTLE_MISTAKE_DAMAGE, room, now);
      }
    }
  } else if (progressDelta > 0) {
    const previousStreak = bot.currentStreak;
    bot.progressIndex += progressDelta;
    bot.correctCharacters += progressDelta;
    bot.currentStreak += progressDelta;
    bot.maxStreak = Math.max(bot.maxStreak, bot.currentStreak);
    if (room.matchRule === "hpBattle") {
      bot.progressIndex = modulo(bot.progressIndex, promptLength);
      for (const opponent of room.players.values()) {
        if (opponent.id !== bot.id && opponent.hp !== undefined && opponent.hp > 0) {
          applyHpDamage(opponent, progressDelta, room, now);
        }
      }
    }
    const earned = Math.floor(bot.currentStreak / MISTAKE_GUARD_STREAK) - Math.floor(previousStreak / MISTAKE_GUARD_STREAK);
    bot.mistakeGuards = Math.min((bot.mistakeGuards ?? 0) + Math.max(earned, 0), MAX_MISTAKE_GUARDS);
  }

  bot.wpm = calculateWpm(bot.correctCharacters, now - startedAt);
  bot.accuracy = calculateAccuracy(bot.correctCharacters, bot.totalTypedCharacters);
}

export function resetPlayers(room: InternalRoom, preserveConnectionState = false): void {
  const maxHp = room.matchRule === "hpBattle" ? HP_BATTLE_MAX_HP : undefined;

  for (const player of room.players.values()) {
    player.ready = false;
    player.progressIndex = 0;
    player.correctCharacters = 0;
    player.totalTypedCharacters = 0;
    player.mistakes = 0;
    player.mistakeGuards = 0;
    player.maxStreak = 0;
    player.currentStreak = 0;
    player.typingProgressIndex = 0;
    player.pendingInput = "";
    player.lastInputSequence = 0;
    player.wpm = 0;
    player.accuracy = 100;
    if (maxHp !== undefined) {
      player.maxHp = maxHp;
      player.hp = maxHp;
    } else {
      delete player.maxHp;
      delete player.hp;
    }
    delete player.forfeited;
    delete player.finishStatus;
    if (!preserveConnectionState) {
      delete player.disconnectedAt;
    }
    delete player.finishedAt;
    delete player.finishTimeMs;
  }
}

export function resetPlayerInputSession(player: InternalPlayer, room: InternalRoom): void {
  player.lastInputSequence = 0;
  player.pendingInput = "";
  player.typingProgressIndex =
    player.deviceKind === "desktop" && room.prompt
      ? getRomajiProgressIndexForCanonicalProgress(room.prompt, player.progressIndex)
      : player.progressIndex;
}

function createProgressState(player: InternalPlayer, progressIndex = player.progressIndex) {
  return {
    ...createEmptyProgress(),
    progressIndex,
    correctCharacters: player.correctCharacters,
    totalTypedCharacters: player.totalTypedCharacters,
    mistakes: player.mistakes,
    currentStreak: player.currentStreak,
    maxStreak: player.maxStreak,
    pendingInput: player.pendingInput
  };
}

function applyProgressState(player: InternalPlayer, progress: ProgressState): void {
  player.correctCharacters = progress.correctCharacters;
  player.totalTypedCharacters = progress.totalTypedCharacters;
  player.mistakes = progress.mistakes;
  player.currentStreak = progress.currentStreak;
  player.maxStreak = progress.maxStreak;
  player.pendingInput = progress.pendingInput;

}

function applyGuardedProgress(player: InternalPlayer, before: ProgressState, after: ProgressState): void {
  const mistake = after.mistakes > before.mistakes;
  const guarded = mistake && (player.mistakeGuards ?? 0) > 0;

  if (guarded) {
    player.mistakeGuards = Math.max((player.mistakeGuards ?? 0) - 1, 0);
    after.mistakes = before.mistakes;
    after.currentStreak = before.currentStreak;
    after.maxStreak = before.maxStreak;
  }

  if (!guarded && after.currentStreak > 0) {
    const earned = Math.floor(after.currentStreak / MISTAKE_GUARD_STREAK) - Math.floor(before.currentStreak / MISTAKE_GUARD_STREAK);
    if (earned > 0) {
      player.mistakeGuards = Math.min((player.mistakeGuards ?? 0) + earned, MAX_MISTAKE_GUARDS);
    }
  }

  applyProgressState(player, after);
}

function getRomajiProgressIndexForCanonicalProgress(prompt: Prompt, canonicalProgressIndex: number, loop = false): number {
  const plan = buildRomajiTypingPlan(prompt.typing.hiragana);
  const canonicalLength = plan.units.reduce((total, unit) => total + Array.from(unit.hiragana).length, 0);
  if (!plan.guide || canonicalLength <= 0) {
    return 0;
  }

  const cycles = loop ? Math.floor(canonicalProgressIndex / canonicalLength) : 0;
  const cursor = loop ? modulo(canonicalProgressIndex, canonicalLength) : canonicalProgressIndex;
  let canonicalCursor = 0;
  let romajiCursor = 0;

  for (const unit of plan.units) {
    const unitLength = Array.from(unit.hiragana).length;
    if (canonicalCursor + unitLength > cursor) {
      break;
    }

    canonicalCursor += unitLength;
    romajiCursor += unit.guide.length;
  }

  return cycles * plan.guide.length + romajiCursor;
}

function applyHpDamage(player: InternalPlayer, damage: number, room: InternalRoom, now: number): void {
  if (damage <= 0 || player.hp === undefined || player.hp <= 0) {
    return;
  }

  const nextHp = Math.max(0, player.hp - (room.suddenDeath ? damage * 2 : damage));

  if (nextHp === player.hp) {
    return;
  }

  player.hp = nextHp;

  if (nextHp === 0) {
    player.finishedAt = now;
    delete player.finishTimeMs;
    player.finishStatus = "eliminated";
  }
}

function containsKana(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function getPromptLength(room: InternalRoom): number {
  return room.prompt ? Array.from(room.prompt.typing.hiragana).length : 0;
}

export function isValidTypingProgressPayload(payload: TypingProgress): boolean {
  return (
    typeof payload.input === "string" &&
    Array.from(payload.input).length <= 16 &&
    Number.isSafeInteger(payload.sequence) &&
    payload.sequence >= 1
  );
}
