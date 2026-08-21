import { useCallback, useEffect, type RefObject } from "react";
import {
  resolveTypingInputMode,
  type DeviceKind,
  type MatchResult,
  type Prompt,
  type RoomState
} from "@type-battle/shared";
import type { PlayerSettings } from "../../lib/player-settings";
import { playTypingSound } from "../../lib/sound";
import type { PracticeSession } from "./home-page-view-model";
import { getCanonicalProgressIndex } from "./looping-typing";
import type { RealtimeSocket } from "./realtime-client";
import type { RomajiTypingPlan } from "./romaji-typing";
import { shouldHandleDesktopTypingKey } from "./desktop-typing-input";
import { advanceTypingProgress } from "./typing-input-strategy";
import { createTypingMessageBatch } from "./typing-message-batch";
import type { MistakeSample, ProgressState } from "./typing-progress";

type RefBox<T> = { current: T };
type Setter<T> = (value: T) => void;

type UseTypingSessionInput = {
  refs: {
    socketRef: RefBox<RealtimeSocket | null>;
    roomRef: RefBox<RoomState | null>;
    resultRef: RefBox<MatchResult | null>;
    inputSequenceRef: RefBox<number>;
    roomFinishPendingRef: RefBox<boolean>;
    typingInputRef: RefObject<HTMLTextAreaElement | null>;
    localProgressRef: RefBox<ProgressState>;
    practiceProgressRef: RefBox<ProgressState>;
    inputModeRef: RefBox<"kana" | "romaji">;
    settingsRef: RefBox<PlayerSettings>;
  };
  state: {
    activeInputDeviceKind: DeviceKind;
    activeTypingText: string;
    activePrompt: Prompt | null;
    activeRomajiTypingPlan: RomajiTypingPlan | null;
    activeProgressBase: number;
    activeCanonicalProgressBase: number;
    activeRomajiProgressBase: number;
    isLoopingMatchPlaying: boolean;
    usesTimeAttackPromptSequence: boolean;
    practiceSession: PracticeSession | null;
    practiceResult: MatchResult | null;
    room: RoomState | null;
    acceptingTextInput: boolean;
    exitRequested: boolean;
  };
  actions: {
    setLastProgressSentAt: Setter<number | null>;
    setSyncClock: Setter<number>;
    setRoomFinishPending: Setter<boolean>;
    setInputMode: Setter<"kana" | "romaji">;
    setLocalProgress: Setter<ProgressState>;
    setPracticeProgress: Setter<ProgressState>;
    recordMistakeSamples: (samples: MistakeSample[]) => void;
    consumeDailyAttempt: () => void;
    finishPractice: (progress: ProgressState) => void;
  };
};

export function useTypingSession({ refs, state, actions }: UseTypingSessionInput) {
  const emitProgress = useCallback((input: string, finish: boolean) => {
    const socket = refs.socketRef.current;
    const currentRoom = refs.roomRef.current;
    if (!socket || !currentRoom || !socket.isConnected()) {
      return;
    }

    const messages = createTypingMessageBatch({
      roomCode: currentRoom.roomCode,
      text: input,
      finish,
      previousSequence: refs.inputSequenceRef.current
    });
    refs.inputSequenceRef.current = messages.at(-1)!.payload.sequence;
    const now = Date.now();
    actions.setLastProgressSentAt(now);
    actions.setSyncClock(now);

    if (finish && currentRoom.matchRule === "race") {
      refs.roomFinishPendingRef.current = true;
      actions.setRoomFinishPending(true);
      refs.typingInputRef.current?.blur();
    }

    for (const message of messages) {
      socket.emit(message.event, message.payload);
    }
  }, [actions, refs]);

  const handleTypedText = useCallback((typedText: string) => {
    if (!typedText || refs.roomFinishPendingRef.current) {
      return;
    }

    const currentRoom = refs.roomRef.current;
    if (currentRoom?.status === "playing" && currentRoom.prompt && !refs.resultRef.current) {
      const previous = refs.localProgressRef.current;
      const next = advanceTypingProgress({
        previous,
        typedText,
        deviceKind: state.activeInputDeviceKind,
        canonicalText: state.activePrompt?.typing.hiragana ?? state.activeTypingText,
        displayText: state.activeTypingText,
        romajiPlan: state.activeRomajiTypingPlan,
        loop: state.isLoopingMatchPlaying && !state.usesTimeAttackPromptSequence,
        progressBase: state.activeProgressBase,
        progressBaseByMode: {
          kana: state.activeCanonicalProgressBase,
          romaji: state.activeRomajiProgressBase
        },
        inputMode: refs.inputModeRef.current
      });
      const nextInputMode = resolveTypingInputMode(refs.inputModeRef.current, typedText);
      refs.inputModeRef.current = nextInputMode;
      actions.setInputMode(nextInputMode);
      const correct = next.progress.correctCharacters > previous.correctCharacters;

      actions.setLocalProgress(next.progress);
      refs.localProgressRef.current = next.progress;
      actions.recordMistakeSamples(next.mistakeSamples);
      void playTypingSound({ enabled: refs.settingsRef.current.soundEnabled }, correct);
      emitProgress(
        typedText,
        !state.isLoopingMatchPlaying
          && getCanonicalProgress(next.progress, refs.inputModeRef.current, state.activeRomajiTypingPlan)
            >= Array.from(state.activePrompt?.typing.hiragana ?? state.activeTypingText).length
      );
      return;
    }

    if (state.practiceSession && !state.practiceResult && !state.room) {
      const previous = refs.practiceProgressRef.current;
      const next = advanceTypingProgress({
        previous,
        typedText,
        deviceKind: state.activeInputDeviceKind,
        canonicalText: state.activePrompt?.typing.hiragana ?? state.activeTypingText,
        displayText: state.activeTypingText,
        romajiPlan: state.activeRomajiTypingPlan,
        loop: state.isLoopingMatchPlaying && !state.usesTimeAttackPromptSequence,
        progressBase: state.activeProgressBase,
        progressBaseByMode: {
          kana: state.activeCanonicalProgressBase,
          romaji: state.activeRomajiProgressBase
        },
        inputMode: refs.inputModeRef.current
      });
      const nextInputMode = resolveTypingInputMode(refs.inputModeRef.current, typedText);
      refs.inputModeRef.current = nextInputMode;
      actions.setInputMode(nextInputMode);
      const correct = next.progress.correctCharacters > previous.correctCharacters;

      actions.setPracticeProgress(next.progress);
      refs.practiceProgressRef.current = next.progress;
      actions.recordMistakeSamples(next.mistakeSamples);
      if (state.practiceSession.mode === "daily" && correct) {
        actions.consumeDailyAttempt();
      }

      if (
        getCanonicalProgress(next.progress, refs.inputModeRef.current, state.activeRomajiTypingPlan)
          >= Array.from(state.activePrompt?.typing.hiragana ?? state.activeTypingText).length
      ) {
        actions.finishPractice(next.progress);
      }

      void playTypingSound({ enabled: refs.settingsRef.current.soundEnabled }, correct);
    }
  }, [actions, emitProgress, refs, state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const practiceActive = Boolean(
        state.practiceSession && !state.practiceResult && !state.room
      );
      const roomPlaying = state.room?.status === "playing";
      if (!shouldHandleDesktopTypingKey({
        roomPlaying,
        practiceActive,
        acceptingTextInput: state.acceptingTextInput,
        roomFinishPending: refs.roomFinishPendingRef.current,
        exitRequested: state.exitRequested,
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        editableTarget: isEditableTarget(event.target),
        key: event.key
      })) {
        return;
      }

      event.preventDefault();
      handleTypedText(event.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTypedText, refs.roomFinishPendingRef, state.acceptingTextInput, state.exitRequested, state.practiceResult, state.practiceSession, state.room]);

  return { handleTypedText };
}

function getCanonicalProgress(
  progress: ProgressState,
  inputMode: "kana" | "romaji",
  romajiPlan: RomajiTypingPlan | null
): number {
  if (inputMode === "kana") {
    return progress.progressIndex;
  }
  return getCanonicalProgressIndex(romajiPlan!, progress.progressIndex);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && target.matches("input, textarea, select, button, a, [role='button'], [contenteditable='true']");
}
