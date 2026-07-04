import { logger } from "./logger.js";
import { recordGuestSession, recordMatchResult } from "./persistence.js";
import {
  BOT_TICK_MS,
  advanceBot,
  checkExpiredTimeAttackMatches,
  checkForForfeits,
  cleanupExpiredRooms,
  createRoom,
  explicitLeaveBySocket,
  finishTyping,
  getMetrics,
  getRoom,
  joinRoom,
  leaveBySocket,
  markPlaying,
  metrics,
  rematch,
  rooms,
  setBotDifficulty,
  setMatchRule,
  setPromptCategory,
  setReady,
  setRoomEngineConfig,
  setRoomEngineHooks,
  startDailyPractice,
  startMatch,
  startPractice,
  updateProgress
} from "@type-battle/shared/room-engine";

setRoomEngineHooks({
  logger,
  recordGuestSession,
  recordMatchResult
});

setRoomEngineConfig({
  timeAttackMs: Number(process.env.TIME_ATTACK_MS ?? (process.env.NODE_ENV === "test" ? 5_000 : 30_000))
});

export {
  BOT_TICK_MS,
  advanceBot,
  checkExpiredTimeAttackMatches,
  checkForForfeits,
  cleanupExpiredRooms,
  createRoom,
  explicitLeaveBySocket,
  finishTyping,
  getMetrics,
  getRoom,
  joinRoom,
  leaveBySocket,
  markPlaying,
  metrics,
  rematch,
  rooms,
  setBotDifficulty,
  setMatchRule,
  setPromptCategory,
  setReady,
  startDailyPractice,
  startMatch,
  startPractice,
  updateProgress
};