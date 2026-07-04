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
  startDailyPractice,
  startMatch,
  startPractice,
  updateProgress,
  setRoomEngineHooks
} from "@type-battle/shared";

setRoomEngineHooks({
  logger,
  recordGuestSession,
  recordMatchResult
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
