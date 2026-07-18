import {
  calculateAccuracy,
  calculateProgress,
  calculateWpm,
  getDailyChallengeInfo,
  pickDailyChallengePrompt
} from "@type-battle/shared";
import type {
  DeviceKind,
  MatchResult,
  Prompt,
  PromptCategory,
  RoomState
} from "@type-battle/shared";
import {
  getVisibleDailyChallengeRecord,
  type DailyChallengeRecord
} from "../../lib/daily-challenge";
import {
  summarizeMistakeTrendRecord,
  type MistakeTrendRecord
} from "../../lib/mistake-trends";
import {
  getCanonicalProgressIndex
} from "./looping-typing";
import { buildRomajiTypingPlan } from "./romaji-typing";
import { getProgressSyncState, type ProgressSyncState } from "./progress-sync";
import type { ProgressState } from "./typing-progress";

export type PracticeSession = {
  practiceId: string;
  prompt: Prompt;
  startedAt: number;
  category: PromptCategory;
  deviceKind: DeviceKind;
  mode: "practice" | "daily";
  challengeKey?: string;
};

export type HomePageViewModelInput = {
  now: number;
  room: RoomState | null;
  playerId: string;
  currentPlayer: RoomState["players"][number] | null;
  result: MatchResult | null;
  practiceSession: PracticeSession | null;
  practiceResult: MatchResult | null;
  dailyChallengeNow: Date;
  dailyChallengeRecord: DailyChallengeRecord | null;
  mistakeTrendRecord: MistakeTrendRecord | null;
  localProgress: ProgressState;
  practiceProgress: ProgressState;
  connected: boolean;
  lastProgressSentAt: number | null;
  syncClock: number;
  matchTimerMs: number;
  inputMode?: "kana" | "romaji";
  inputModeInitialized?: boolean;
  roomFinishPending?: boolean;
};

export function getHomePageViewModel({
  now,
  room,
  playerId,
  currentPlayer,
  result,
  practiceSession,
  practiceResult,
  dailyChallengeNow,
  dailyChallengeRecord,
  mistakeTrendRecord,
  localProgress,
  practiceProgress,
  connected,
  lastProgressSentAt,
  syncClock,
  matchTimerMs,
  inputMode,
  inputModeInitialized,
  roomFinishPending = false
}: HomePageViewModelInput) {
  const activePracticePlayer = practiceResult?.players[0] ?? null;
  const activeResult = result ?? practiceResult;
  const activePrompt = room?.prompt ?? practiceSession?.prompt ?? activeResult?.prompt ?? null;
  const activePromptText = activePrompt?.text ?? "";
  const activeInputDeviceKind = room ? currentPlayer?.deviceKind ?? "desktop" : practiceSession?.deviceKind ?? "desktop";
  const activeProgress = room ? localProgress : practiceProgress;
  const deviceInputMode = activeInputDeviceKind === "mobile" ? "kana" : "romaji";
  const effectiveInputMode =
    inputModeInitialized === false || activeProgress.totalTypedCharacters === 0
      ? deviceInputMode
      : inputMode ?? (activeInputDeviceKind === "mobile" ? "kana" : "romaji");
  const dailyChallengeInfo = getDailyChallengeInfo(dailyChallengeNow);
  const dailyChallengePrompt = pickDailyChallengePrompt(dailyChallengeNow);
  const visibleDailyChallengeRecord = getVisibleDailyChallengeRecord(
    dailyChallengeRecord,
    dailyChallengeInfo.challengeKey
  );
  const activePracticeMode = practiceSession?.mode ?? "practice";
  const mistakeTrendSummary = summarizeMistakeTrendRecord(mistakeTrendRecord);
  const mistakeTrendTotal = (mistakeTrendRecord?.items ?? []).reduce((total, item) => total + item.count, 0);
  const activeRomajiTypingPlan = activePrompt ? buildRomajiTypingPlan(activePrompt.typing.hiragana) : null;
  const activeTypingText = activePrompt
    ? effectiveInputMode === "kana"
      ? activePrompt.typing.hiragana
      : activeRomajiTypingPlan?.guide ?? activePrompt.typing.romaji
    : "";
  const isRoomPlaying = room?.status === "playing";
  const isPracticePlaying = Boolean(practiceSession && !practiceResult && !room);
  const isTimeAttackPlaying = Boolean(isRoomPlaying && room?.matchRule === "timeAttack");
  const activeGuideProgressIndex =
    isTimeAttackPlaying && activeTypingText.length > 0
      ? activeProgress.progressIndex % activeTypingText.length
      : activeProgress.progressIndex;
  const activeCanonicalProgressIndex =
    effectiveInputMode === "romaji" && activeRomajiTypingPlan
      ? getCanonicalProgressIndex(activeRomajiTypingPlan, activeProgress.progressIndex)
      : activeProgress.progressIndex;
  const activeProgressPercent = calculateProgress(activeGuideProgressIndex, activeTypingText.length);
  const activeElapsedMs =
    isRoomPlaying && room?.serverStartAt
      ? now - room.serverStartAt
      : isPracticePlaying && practiceSession
        ? now - practiceSession.startedAt
        : 0;
  const activeWpm = calculateWpm(activeProgress.correctCharacters, activeElapsedMs);
  const activeAccuracy = calculateAccuracy(activeProgress.correctCharacters, activeProgress.totalTypedCharacters);
  const activeResultPlayer = room?.players.find((player) => player.id === playerId) ?? activePracticePlayer ?? null;
  const isTimeAttackExpired = Boolean(
    isTimeAttackPlaying && room?.matchEndsAt && matchTimerMs <= 0 && now >= room.matchEndsAt
  );
  const activeTimeAttackRemainingSeconds = Math.max(matchTimerMs / 1000, 0).toFixed(1);
  const acceptingTextInput =
    (isRoomPlaying && connected && !result && !isTimeAttackExpired && !roomFinishPending) || isPracticePlaying;
  const progressSyncState: ProgressSyncState = room
    ? getProgressSyncState({
        connected,
        localTypedCharacters: activeProgress.totalTypedCharacters,
        serverTypedCharacters: currentPlayer?.totalTypedCharacters ?? 0,
        lastSentAt: lastProgressSentAt,
        now: syncClock
      })
    : "synced";
  const displayRoom = room && currentPlayer
    ? {
        ...room,
        players: room.players.map((player) =>
          player.id === currentPlayer.id
            ? {
                ...player,
                progressIndex: Math.max(player.progressIndex, activeCanonicalProgressIndex),
                correctCharacters: Math.max(player.correctCharacters, activeProgress.correctCharacters),
                totalTypedCharacters: Math.max(player.totalTypedCharacters, activeProgress.totalTypedCharacters)
              }
            : player
        )
      }
    : room;
  const typingInputKey = `${String(room?.prompt?.id ?? practiceSession?.practiceId ?? "idle")}:${String(activePrompt?.id ?? "none")}`;

  return {
    activeResult,
    activePrompt,
    activePromptText,
    activeInputDeviceKind,
    dailyChallengeInfo,
    dailyChallengePrompt,
    visibleDailyChallengeRecord,
    activePracticeMode,
    mistakeTrendSummary,
    mistakeTrendTotal,
    activeRomajiTypingPlan,
    activeTypingText,
    isRoomPlaying,
    isPracticePlaying,
    activeProgress,
    isTimeAttackPlaying,
    activeGuideProgressIndex,
    activeProgressPercent,
    activeElapsedMs,
    activeWpm,
    activeAccuracy,
    activeResultPlayer,
    isTimeAttackExpired,
    activeTimeAttackRemainingSeconds,
    acceptingTextInput,
    progressSyncState,
    displayRoom,
    typingInputKey
  };
}
