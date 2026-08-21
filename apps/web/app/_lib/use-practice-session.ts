import { useCallback, type RefObject } from "react";
import {
  calculateAccuracy,
  calculateWpm,
  normalizeNickname,
  validateNickname,
  type MatchResult,
  type PlayerResult,
  type PromptCategory
} from "@type-battle/shared";
import {
  DAILY_CHALLENGE_MAX_ATTEMPTS,
  consumeDailyChallengeAttempt,
  getVisibleDailyChallengeRecord,
  loadDailyChallengeRecord,
  recordDailyChallengeAttempt,
  type DailyChallengeRecord
} from "../../lib/daily-challenge";
import type { HeadAccessoryId, HeldItemId } from "@type-battle/shared";
import { primeSoundPlayback } from "../../lib/sound";
import { detectDeviceKind } from "./device-kind";
import { getCanonicalProgressIndex } from "./looping-typing";
import { buildRomajiTypingPlan } from "./romaji-typing";
import type { PracticeSession } from "./home-page-view-model";
import type { RealtimeSocket } from "./realtime-client";
import { createEmptyProgress, type ProgressState } from "./typing-progress";

type RefBox<T> = { current: T };
type Setter<T> = (value: T) => void;

type UsePracticeSessionInput = {
  refs: {
    socketRef: RefBox<RealtimeSocket | null>;
    nicknameInputRef: RefObject<HTMLInputElement | null>;
    nicknameRef: RefBox<string>;
    inputModeRef: RefBox<"kana" | "romaji">;
    dailyAttemptConsumedRef: RefBox<boolean>;
  };
  state: {
    practiceSession: PracticeSession | null;
    practiceCategory: PromptCategory;
    dailyChallengeKey: string;
    guestId: string;
    realtimeConfigured: boolean;
    headAccessoryId: HeadAccessoryId;
    heldItemId: HeldItemId;
  };
  actions: {
    connectPracticeSocket: () => RealtimeSocket;
    disconnectPracticeSocket: () => void;
    prepareTypingInput: () => void;
    setHomeMode: (value: null) => void;
    setError: Setter<string>;
    setPracticeSession: Setter<PracticeSession | null>;
    setPracticeResult: Setter<MatchResult | null>;
    setPracticeProgress: Setter<ProgressState>;
    setDailyAttemptConsumed: Setter<boolean>;
    setDailyChallengeRecord: Setter<DailyChallengeRecord | null>;
    resetTyping: () => void;
  };
  realtimeUnavailableMessage: string;
};

export function usePracticeSession({
  refs,
  state,
  actions,
  realtimeUnavailableMessage
}: UsePracticeSessionInput) {
  const startPractice = useCallback(() => {
    const currentNickname = refs.nicknameInputRef.current?.value ?? refs.nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!state.realtimeConfigured || validationError || !state.guestId) {
      actions.setError(validationError ?? realtimeUnavailableMessage);
      return;
    }

    const socket = actions.connectPracticeSocket();
    actions.prepareTypingInput();
    actions.setHomeMode(null);
    void primeSoundPlayback();
    socket.emit(
      "practice:start",
      { nickname: normalizeNickname(currentNickname), category: state.practiceCategory },
      (response) => {
        if (refs.socketRef.current !== socket) {
          return;
        }

        if (!response.ok) {
          actions.setError(response.error);
          actions.disconnectPracticeSocket();
          return;
        }

        actions.disconnectPracticeSocket();
        actions.setError("");
        actions.setPracticeSession({
          ...response.data,
          category: state.practiceCategory,
          deviceKind,
          mode: "practice"
        });
        actions.setPracticeResult(null);
        actions.setPracticeProgress(createEmptyProgress());
        actions.resetTyping();
      }
    );
  }, [actions, realtimeUnavailableMessage, refs, state.guestId, state.practiceCategory, state.realtimeConfigured]);

  const consumeDailyAttempt = useCallback(() => {
    const session = state.practiceSession;
    if (!session || session.mode !== "daily" || refs.dailyAttemptConsumedRef.current) {
      return;
    }

    const record = consumeDailyChallengeAttempt(
      window.localStorage,
      session.challengeKey ?? state.dailyChallengeKey,
      session.prompt.id,
      Date.now()
    );
    if (!record) {
      return;
    }

    refs.dailyAttemptConsumedRef.current = true;
    actions.setDailyAttemptConsumed(true);
    actions.setDailyChallengeRecord(
      getVisibleDailyChallengeRecord(record, state.dailyChallengeKey)
    );
  }, [actions, refs.dailyAttemptConsumedRef, state.dailyChallengeKey, state.practiceSession]);

  const startDailyChallenge = useCallback(() => {
    const currentNickname = refs.nicknameInputRef.current?.value ?? refs.nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!state.realtimeConfigured || validationError || !state.guestId) {
      actions.setError(validationError ?? realtimeUnavailableMessage);
      return;
    }

    const currentRecord = loadDailyChallengeRecord(
      window.localStorage,
      state.dailyChallengeKey
    );
    if ((currentRecord?.attempts ?? 0) >= DAILY_CHALLENGE_MAX_ATTEMPTS) {
      actions.setError("今日のデイリー挑戦回数を使い切りました。次の日付まで待ってください。");
      return;
    }

    const socket = actions.connectPracticeSocket();
    actions.prepareTypingInput();
    actions.setHomeMode(null);
    void primeSoundPlayback();
    socket.emit("practice:dailyStart", { nickname: normalizeNickname(currentNickname) }, (response) => {
      if (refs.socketRef.current !== socket) {
        return;
      }

      if (!response.ok) {
        actions.setError(response.error);
        actions.disconnectPracticeSocket();
        return;
      }

      actions.disconnectPracticeSocket();
      actions.setError("");
      actions.setPracticeSession({
        ...response.data,
        category: "standard",
        deviceKind,
        mode: "daily",
        ...(response.data.challengeKey ? { challengeKey: response.data.challengeKey } : {})
      });
      actions.setPracticeResult(null);
      actions.setPracticeProgress(createEmptyProgress());
      refs.dailyAttemptConsumedRef.current = false;
      actions.setDailyAttemptConsumed(false);
      actions.resetTyping();
    });
  }, [actions, realtimeUnavailableMessage, refs, state.dailyChallengeKey, state.guestId, state.realtimeConfigured]);

  const finishPractice = useCallback(
    (finalProgress: ProgressState) => {
      const session = state.practiceSession;
      if (!session) {
        return;
      }

      if (session.mode === "daily") {
        consumeDailyAttempt();
      }

      const now = Date.now();
      const finishTimeMs = now - session.startedAt;
      const canonicalProgressIndex = refs.inputModeRef.current === "kana"
        ? finalProgress.progressIndex
        : getCanonicalProgressIndex(
            buildRomajiTypingPlan(session.prompt.typing.hiragana),
            finalProgress.progressIndex
          );
      const player: PlayerResult = {
        id: session.practiceId,
        nickname: normalizeNickname(refs.nicknameRef.current),
        connected: true,
        ready: true,
        isHost: true,
        isBot: false,
        progressIndex: canonicalProgressIndex,
        correctCharacters: finalProgress.correctCharacters,
        totalTypedCharacters: finalProgress.totalTypedCharacters,
        mistakes: finalProgress.mistakes,
        headAccessoryId: state.headAccessoryId,
        heldItemId: state.heldItemId,
        maxStreak: finalProgress.maxStreak,
        currentStreak: finalProgress.currentStreak,
        wpm: calculateWpm(finalProgress.correctCharacters, finishTimeMs),
        accuracy: calculateAccuracy(
          finalProgress.correctCharacters,
          finalProgress.totalTypedCharacters
        ),
        finishedAt: now,
        finishTimeMs,
        rank: 1,
        finishGap: undefined
      };

      actions.setPracticeResult({
        roomCode: session.practiceId,
        prompt: session.prompt,
        players: [player]
      });

      if (session.mode === "daily" && session.challengeKey) {
        const { visibleRecord } = recordDailyChallengeAttempt(
          window.localStorage,
          {
            challengeKey: session.challengeKey,
            promptId: session.prompt.id,
            wpm: player.wpm,
            accuracy: player.accuracy,
            mistakes: player.mistakes,
            finishTimeMs,
            completedAt: player.finishedAt ?? now,
            attemptConsumed: refs.dailyAttemptConsumedRef.current
          },
          state.dailyChallengeKey
        );
        actions.setDailyChallengeRecord(visibleRecord);
      }

      actions.disconnectPracticeSocket();
    },
    [actions, consumeDailyAttempt, refs, state.dailyChallengeKey, state.headAccessoryId, state.heldItemId, state.practiceSession]
  );

  return {
    consumeDailyAttempt,
    finishPractice,
    startDailyChallenge,
    startPractice
  };
}
