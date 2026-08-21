"use client";

import Link from "next/link";
import { Clipboard, Swords, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  createRealtimeSocket,
  getDefaultRealtimeUrl,
  type RealtimeTransport,
  type RealtimeSocket
} from "./_lib/realtime-client";
import {
  calculateAccuracy,
  calculateWpm,
  createRoomCode,
  normalizeNickname,
  resolveTypingInputMode,
  validateNickname
} from "@type-battle/shared";
import type {
  EquipmentSelection,
  MatchmakingAssignedHostPayload,
  MatchmakingMatchedPayload,
  MatchmakingTimeoutPayload,
  MatchRule,
  MatchResult,
  PlayerResult,
  PromptCategory,
  QuickReaction,
  RoomState
} from "@type-battle/shared";
import { loadBlockedPlayers } from "../lib/blocked-players";
import { GameHeader } from "./_components/game-header";
import { HomeModeMenu } from "./_components/home-mode-menu";
import { SoloModeMenu } from "./_components/solo-mode-menu";
import { LobbyPrep } from "./_components/lobby-prep";
import { BattleStage } from "./_components/battle-stage";
import { PlayerSettingsModal } from "./_components/player-settings-modal";
import { ExitConfirmationModal } from "./_components/exit-confirmation-modal";
import { MatchSettingsModal } from "./_components/match-settings-modal";
import { ProgressBlock } from "./_components/progress-block";
import { ResultPanel } from "./_components/result-panel";
import { RivalBar } from "./_components/rival-bar";
import { Stat } from "./_components/stat";
import { TypingInput } from "./_components/typing-input";
import { TypingPrompt } from "./_components/typing-prompt";
import { TutorialOverlay } from "./_components/tutorial-overlay";
import { PlayerIdentity } from "./_components/player-identity";
import { PracticeStage } from "./_components/practice-stage";
import { CosmeticCustomizationModal } from "./_components/cosmetic-customization-modal";
import { SectionHeading, SurfaceCard } from "./_components/ui";
import {
  createEmptyProgress,
  type MistakeSample,
  type ProgressState
} from "./_lib/typing-progress";
import {
  buildRomajiTypingPlan
} from "./_lib/romaji-typing";
import {
  getCanonicalProgressIndex
} from "./_lib/looping-typing";
import {
  getHomePageViewModel,
  type PracticeSession
} from "./_lib/home-page-view-model";
import { detectDeviceKind } from "./_lib/device-kind";
import { advanceTypingProgress } from "./_lib/typing-input-strategy";
import { createTypingMessageBatch } from "./_lib/typing-message-batch";
import { shouldHandleDesktopTypingKey } from "./_lib/desktop-typing-input";
import { reconcileRoomProgress } from "./_lib/reconcile-room-progress";
import { resolveRoomSnapshot } from "./_lib/room-state-order";
import { copyText } from "./_lib/clipboard";
import { getProgressSyncLabel } from "./_lib/progress-sync";
import { getPracticeSocketToRelease } from "./_lib/practice-socket-lifecycle";
import { getScrollTopToRevealTarget } from "./_lib/scroll-visibility";
import {
  INITIAL_REACTION_FEEDBACK,
  REACTION_COOLDOWN_MS,
  REACTION_DISPLAY_MS,
  clearReactionDisplayTimer,
  createCooldownReactionFeedback,
  createReactionErrorFeedback,
  createSendingReactionFeedback,
  createSentReactionFeedback,
  replaceReactionDisplayTimer,
  type ReactionFeedback
} from "./_lib/reaction-feedback";
import {
  getStoredRoomJoinFailureAction,
  getStoredRoomRejoinDelayMs,
  getRoomDisconnectRecoveryState,
  type StoredRoomRecoveryState
} from "./_lib/room-reconnect";
import {
  DEVICE_KIND_LABELS,
  MATCH_RULE_DETAILS,
  PROMPT_CATEGORY_LABELS,
  getPlayerDeviceLabel,
  getPlayerConnectionLabel,
  getPlayerRoleLabel
} from "./_lib/ui-labels";
import {
  applyPlayerSettingsToDocument,
  DEFAULT_PLAYER_SETTINGS,
  loadPlayerSettings,
  persistPlayerSettings,
  type PlayerSettings
} from "../lib/player-settings";
import {
  loadGuestSession,
  persistGuestSession,
  touchGuestSession,
  type GuestSession
} from "../lib/guest-session";
import { playCountdownSound, playTypingSound, primeSoundPlayback } from "../lib/sound";
import {
  DAILY_CHALLENGE_MAX_ATTEMPTS,
  consumeDailyChallengeAttempt,
  getVisibleDailyChallengeRecord,
  loadDailyChallengeRecord,
  recordDailyChallengeAttempt,
  type DailyChallengeRecord
} from "../lib/daily-challenge";
import {
  formatMistakeTarget,
  loadMistakeTrendRecord,
  persistMistakeTrendRecord,
  updateMistakeTrendRecord,
  type MistakeTrendRecord
} from "../lib/mistake-trends";
import {
  awardStyleCoins,
  createMatchRewardKey,
  createPracticeRewardKey,
  DEFAULT_COSMETIC_PROGRESS,
  equipCosmetic,
  loadCosmeticProgress,
  persistCosmeticProgress,
  purchaseCosmetic,
  type CosmeticProgress,
  type StyleCoinRewardBreakdown,
} from "../lib/cosmetic-progress";

type ClientSocket = RealtimeSocket;

type HomeMode = "battle" | "solo";

const DAILY_CHALLENGE_RESET_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "numeric",
  minute: "2-digit"
});
type SoloSetupView = "menu" | "practice" | "daily" | "mistakes";
type ExitRequest = "room" | "practice";
type CustomizationView = "shop" | "equipment";
type QuickMatchPhase = "idle" | "searching" | "waitingHost" | "joiningRoom" | "timeout" | "error";
type QuickMatchHandoff = {
  role: "host" | "guest";
  ticketId: string;
  matchId: string;
};

const REALTIME_TRANSPORT: RealtimeTransport = "cloudflare";
const CLOUDFLARE_REALTIME_URL = process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL?.trim() ?? "";
const REALTIME_UNAVAILABLE_MESSAGE = "Realtime transport is not configured.";
const ROOM_CODE_KEY = "type-battle:room-code";

export default function HomePage() {
  const socketRef = useRef<ClientSocket | null>(null);
  const matchmakingSocketRef = useRef<ClientSocket | null>(null);
  const quickMatchHandoffRef = useRef<QuickMatchHandoff | null>(null);
  const [socketMode, setSocketMode] = useState<"practice" | "room" | null>(null);
  const settingsRef = useRef(DEFAULT_PLAYER_SETTINGS);
  const nicknameRef = useRef(DEFAULT_PLAYER_SETTINGS.nickname);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const countdownSecondRef = useRef<number | null>(null);
  const typingInputRef = useRef<HTMLTextAreaElement | null>(null);
  const matchSurfaceRef = useRef<HTMLElement | null>(null);
  const exitTriggerRef = useRef<HTMLElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [playerId, setPlayerId] = useState("");
  const playerIdRef = useRef("");
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_PLAYER_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [quickMatchPhase, setQuickMatchPhase] = useState<QuickMatchPhase>("idle");
  const [quickMatchStartedAt, setQuickMatchStartedAt] = useState<number | null>(null);
  const [quickMatchElapsedMs, setQuickMatchElapsedMs] = useState(0);
  const [quickMatchTicketId, setQuickMatchTicketId] = useState("");
  const [quickMatchMatchId, setQuickMatchMatchId] = useState("");
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [matchSettingsOpen, setMatchSettingsOpen] = useState(false);
  const [exitRequest, setExitRequest] = useState<ExitRequest | null>(null);
  const [homeMode, setHomeMode] = useState<HomeMode | null>(null);
  const [soloSetupView, setSoloSetupView] = useState<SoloSetupView>("menu");
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const [cosmeticProgress, setCosmeticProgress] = useState<CosmeticProgress>(DEFAULT_COSMETIC_PROGRESS);
  const [cosmeticProgressHydrated, setCosmeticProgressHydrated] = useState(false);
  const [latestCoinReward, setLatestCoinReward] = useState<StyleCoinRewardBreakdown | null>(null);
  const [customizationView, setCustomizationView] = useState<CustomizationView | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [remoteReaction, setRemoteReaction] = useState<{ playerId: string; reaction: QuickReaction } | null>(null);
  const [reactionFeedback, setReactionFeedback] = useState<ReactionFeedback>(INITIAL_REACTION_FEEDBACK);
  const reactionRequestPendingRef = useRef(false);
  const reactionCooldownUntilRef = useRef(0);
  const reactionDisplayTimerRef = useRef<number | null>(null);
  const reactionCooldownTimerRef = useRef<number | null>(null);
  const remoteReactionTimerRef = useRef<number | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [practiceResult, setPracticeResult] = useState<MatchResult | null>(null);
  const [practiceCategory, setPracticeCategory] = useState<PromptCategory>("standard");
  const [dailyChallengeRecord, setDailyChallengeRecord] = useState<DailyChallengeRecord | null>(null);
  const [dailyAttemptConsumed, setDailyAttemptConsumed] = useState(false);
  const [mistakeTrendRecord, setMistakeTrendRecord] = useState<MistakeTrendRecord | null>(null);
  const [error, setError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<{
    kind: "idle" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "" });
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchError, setRematchError] = useState("");
  const [storedRoomRecovery, setStoredRoomRecovery] = useState<StoredRoomRecoveryState>({
    status: "idle",
    message: ""
  });
  const [countdownMs, setCountdownMs] = useState(0);
  const [matchTimerMs, setMatchTimerMs] = useState(0);
  const [syncClock, setSyncClock] = useState(() => Date.now());
  const [lastProgressSentAt, setLastProgressSentAt] = useState<number | null>(null);
  const [localProgress, setLocalProgress] = useState<ProgressState>(createEmptyProgress());
  const [roomFinishPending, setRoomFinishPending] = useState(false);
  const [practiceProgress, setPracticeProgress] = useState<ProgressState>(createEmptyProgress());
  const [inputMode, setInputMode] = useState<"kana" | "romaji">("romaji");
  const [inputModeInitialized, setInputModeInitialized] = useState(false);
  const [localRealtimeUrl, setLocalRealtimeUrl] = useState("");
  const localProgressRef = useRef<ProgressState>(createEmptyProgress());
  const roomFinishPendingRef = useRef(false);
  const createPendingRef = useRef(false);
  const practiceProgressRef = useRef<ProgressState>(createEmptyProgress());
  const inputModeRef = useRef<"kana" | "romaji">("romaji");
  const dailyAttemptConsumedRef = useRef(false);
  const inputSequenceRef = useRef(0);
  const roomRef = useRef<RoomState | null>(null);
  const resultRef = useRef<MatchResult | null>(null);
  const guestSessionRef = useRef<GuestSession | null>(null);
  const socketModeRef = useRef<"practice" | "room" | null>(null);
  const storedRoomCodeRef = useRef<string | null>(null);
  const storedRoomJoinInFlightRef = useRef(false);
  const storedRoomJoinAttemptsRef = useRef(0);
  const storedRoomRetryTimerRef = useRef<number | null>(null);
  const autoStartRoomRef = useRef<string | null>(null);
  const attemptStoredRoomJoinRef = useRef<(socket: ClientSocket) => void>(() => undefined);
  const realtimeUrl = CLOUDFLARE_REALTIME_URL || localRealtimeUrl;
  const realtimeConfigured = realtimeUrl.length > 0;
  const guestId = guestSession?.guestId ?? "";
  const sessionId = guestSession?.sessionId ?? "";

  const nickname = settings.nickname;
  const setNickname = (next: string) => {
    nicknameRef.current = next;
    setSettings((s) => ({ ...s, nickname: next }));
  };

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.id === playerId) ?? null,
    [playerId, room]
  );
  const [dailyChallengeNow, setDailyChallengeNow] = useState(() => new Date());
  const homePageViewModel = useMemo(
    () =>
      getHomePageViewModel({
        now: Date.now(),
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
        roomFinishPending
      }),
    [
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
      roomFinishPending
    ]
  );
  const {
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
    isLoopingMatchPlaying,
    activeGuideProgressIndex,
    activeProgressPercent,
    activeWpm,
    activeAccuracy,
    activeResultPlayer,
    isTimeAttackExpired,
    activeTimeAttackRemainingSeconds,
    usesTimeAttackPromptSequence,
    activeProgressBase,
    activeCanonicalProgressBase,
    activeRomajiProgressBase,
    completedTimeAttackPrompts,
    acceptingTextInput,
    progressSyncState,
    displayRoom,
    typingInputKey
  } = homePageViewModel;

  useLayoutEffect(() => {
    const nextMode = activeInputDeviceKind === "mobile" ? "kana" : "romaji";
    inputModeRef.current = nextMode;
    setInputMode(nextMode);
    setInputModeInitialized(true);
  }, [activeInputDeviceKind, practiceSession?.practiceId, room?.roomCode, room?.round]);

  const setPromptCategory = useCallback(
    (category: "short" | "standard" | "long") => {
      const socket = socketRef.current;
      if (!room || !socket || !currentPlayer?.isHost) {
        return;
      }

      socket.emit("room:setPromptCategory", { roomCode: room.roomCode, category }, (response) => {
        if (socketRef.current !== socket) {
          return;
        }
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const setBotDifficulty = useCallback(
    (difficulty: "easy" | "normal" | "hard") => {
      const socket = socketRef.current;
      if (!room || !socket || !currentPlayer?.isHost) {
        return;
      }

      socket.emit("room:setBotDifficulty", { roomCode: room.roomCode, difficulty }, (response) => {
        if (socketRef.current !== socket) {
          return;
        }
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const setMatchRule = useCallback(
    (rule: MatchRule) => {
      const socket = socketRef.current;
      if (!room || !socket || !currentPlayer?.isHost) {
        return;
      }

      socket.emit("room:setMatchRule", { roomCode: room.roomCode, rule }, (response) => {
        if (socketRef.current !== socket) {
          return;
        }
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const clearPracticeState = useCallback(() => {
    setPracticeSession(null);
    setPracticeResult(null);
    setPracticeProgress(createEmptyProgress());
    practiceProgressRef.current = createEmptyProgress();
  }, []);

  const recordMistakeSamples = useCallback(
    (samples: MistakeSample[]) => {
      if (!settingsHydrated || samples.length === 0) {
        return;
      }

      setMistakeTrendRecord((current) => updateMistakeTrendRecord(current, samples));
    },
    [settingsHydrated]
  );

  const resetTyping = useCallback(() => {
    setLocalProgress(createEmptyProgress());
    localProgressRef.current = createEmptyProgress();
    roomFinishPendingRef.current = false;
    setRoomFinishPending(false);
    inputSequenceRef.current = 0;
    resultRef.current = null;
    setResult(null);
    setLastProgressSentAt(null);
    setLatestCoinReward(null);
  }, []);

  const prepareTypingInput = useCallback(() => {
    if (activeInputDeviceKind === "mobile") {
      return;
    }
    typingInputRef.current?.focus({ preventScroll: true });
  }, [activeInputDeviceKind]);

  const updateGuestSession = useCallback(() => {
    setGuestSession((current) => {
      if (!current) {
        return current;
      }

      return touchGuestSession(current);
    });
  }, []);

  const failPendingRoomCreate = useCallback((message: string) => {
    if (!createPendingRef.current) {
      return;
    }

    createPendingRef.current = false;
    setCreatePending(false);
    setError(message);
  }, []);

  useLayoutEffect(() => {
    roomRef.current = room;
    resultRef.current = result;
  }, [result, room]);

  useEffect(() => {
    guestSessionRef.current = guestSession;
  }, [guestSession]);

  useEffect(() => {
    socketModeRef.current = socketMode;
  }, [socketMode]);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  const clearReactionFeedbackTimers = useCallback(() => {
    if (reactionDisplayTimerRef.current !== null) {
      window.clearTimeout(reactionDisplayTimerRef.current);
      reactionDisplayTimerRef.current = null;
    }
    if (reactionCooldownTimerRef.current !== null) {
      window.clearTimeout(reactionCooldownTimerRef.current);
      reactionCooldownTimerRef.current = null;
    }
  }, []);

  const resetReactionFeedback = useCallback(() => {
    clearReactionFeedbackTimers();
    reactionRequestPendingRef.current = false;
    reactionCooldownUntilRef.current = 0;
    setReactionFeedback(INITIAL_REACTION_FEEDBACK);
  }, [clearReactionFeedbackTimers]);

  const clearRemoteReaction = useCallback(() => {
    remoteReactionTimerRef.current = clearReactionDisplayTimer(remoteReactionTimerRef.current);
    setRemoteReaction(null);
  }, []);

  useEffect(() => {
    return () => {
      clearReactionFeedbackTimers();
      remoteReactionTimerRef.current = clearReactionDisplayTimer(remoteReactionTimerRef.current);
    };
  }, [clearReactionFeedbackTimers]);

  useEffect(() => {
    resetReactionFeedback();
    clearRemoteReaction();
  }, [clearRemoteReaction, resetReactionFeedback, room?.roomCode]);

  useEffect(() => {
    if (!settings.reactionsEnabled) {
      clearRemoteReaction();
    }
  }, [clearRemoteReaction, settings.reactionsEnabled]);

  useEffect(() => {
    if (!quickMatchStartedAt || !["searching", "waitingHost", "joiningRoom"].includes(quickMatchPhase)) {
      return;
    }
    const update = () => setQuickMatchElapsedMs(Date.now() - quickMatchStartedAt);
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [quickMatchPhase, quickMatchStartedAt]);

  const attachSocketHandlers = useCallback((socket: ClientSocket, kind: "practice" | "room") => {
    const isCurrentSocket = () => socketRef.current === socket;
    const applyRoomSnapshot = (nextRoom: RoomState, beforeApply?: () => void) => {
      if (!isCurrentSocket()) {
        return false;
      }
      if (kind === "room" && createPendingRef.current && !roomRef.current) {
        return false;
      }

      const resolution = resolveRoomSnapshot(roomRef.current, resultRef.current, nextRoom);
      if (!resolution.accepted) {
        return false;
      }
      beforeApply?.();
      roomRef.current = resolution.room;
      resultRef.current = resolution.result;
      setRoom(resolution.room);
      setResult(resolution.result);

      if (nextRoom.status === "finished" || resolution.result) {
        typingInputRef.current?.blur();
      }
      return true;
    };

    socket.on("connect", () => {
      if (!isCurrentSocket()) {
        return;
      }

      setConnected(true);
      const currentRoom = roomRef.current;
      const currentSession = guestSessionRef.current;

      if (kind !== "room") {
        return;
      }

      if (!currentRoom || !currentSession) {
        attemptStoredRoomJoinRef.current(socket);
        return;
      }

      socket.emit(
        "room:join",
        {
          roomCode: currentRoom.roomCode,
          nickname: normalizeNickname(nicknameRef.current),
          guestId: currentSession.guestId,
          sessionId: currentSession.sessionId,
          deviceKind: detectDeviceKind()
        },
        (response) => {
          if (!isCurrentSocket()) {
            return;
          }

          if (!response.ok) {
            setError(response.error);
            setStoredRoomRecovery({
              status: "failed",
              message: "ルームへの再接続に失敗しました。接続を確認して再試行してください。"
            });
            return;
          }

          setStoredRoomRecovery({ status: "idle", message: "" });
          setError("");
          setPlayerId(response.data.playerId);
          storedRoomCodeRef.current = response.data.room.roomCode;
          applyRoomSnapshot(response.data.room, resetTyping);
        }
      );
    });
    socket.on("disconnect", ({ reason, willReconnect }) => {
      if (!isCurrentSocket()) {
        return;
      }

      setConnected(false);
      if (kind === "room" && createPendingRef.current && !roomRef.current) {
        failPendingRoomCreate(
          reason
            ? `ルーム作成中に接続が切れました（${reason}）。接続を確認して、もう一度お試しください。`
            : "ルーム作成中に接続が切れました。接続を確認して、もう一度お試しください。"
        );
      }
      reactionRequestPendingRef.current = false;
      setReactionFeedback((current) =>
        current.phase === "sending"
          ? createReactionErrorFeedback("接続が切れたため、リアクションを送信できませんでした。")
          : current
      );
      if (kind === "room") {
        setStoredRoomRecovery(getRoomDisconnectRecoveryState({ reason, willReconnect }));
      }
    });
    socket.on("room:state", (nextRoom) => {
      if (!isCurrentSocket()) {
        return;
      }
      applyRoomSnapshot(nextRoom);
    });
    socket.on("player:progress", (nextRoom) => {
      if (!isCurrentSocket()) {
        return;
      }
      applyRoomSnapshot(nextRoom);
    });
    socket.on("match:countdown", ({ room: nextRoom, serverStartAt }) => {
      if (!isCurrentSocket()) {
        return;
      }
      if (!applyRoomSnapshot(nextRoom, resetTyping)) {
        return;
      }
      setCountdownMs(Math.max(serverStartAt - Date.now(), 0));
    });
    socket.on("match:started", (nextRoom) => {
      if (!isCurrentSocket()) {
        return;
      }
      if (!applyRoomSnapshot(nextRoom, resetTyping)) {
        return;
      }
      setCountdownMs(0);
    });
    socket.on("match:result", (nextResult) => {
      const currentRoom = roomRef.current;
      if (!isCurrentSocket() || !currentRoom || currentRoom.roomCode !== nextResult.roomCode) {
        return;
      }

      resultRef.current = nextResult;
      setResult(nextResult);
      setCountdownMs(0);
      const finishedRoom = {
        ...currentRoom,
        status: "finished" as const,
        result: nextResult
      };
      roomRef.current = finishedRoom;
      setRoom(finishedRoom);
      typingInputRef.current?.blur();
    });
    socket.on("match:error", ({ message }) => {
      if (!isCurrentSocket()) {
        return;
      }
      if (kind === "room" && createPendingRef.current && !roomRef.current) {
        failPendingRoomCreate("ルーム作成中に接続エラーが発生しました。接続を確認して、もう一度お試しください。");
        return;
      }
      setError(message);
      setRematchError(message);
      setRematchPending(false);
    });
    socket.on("player:reaction", (payload) => {
      if (
        !isCurrentSocket() ||
        !settingsRef.current.reactionsEnabled ||
        payload.playerId === playerIdRef.current
      ) {
        return;
      }
      setRemoteReaction(payload);
      remoteReactionTimerRef.current = replaceReactionDisplayTimer(
        remoteReactionTimerRef.current,
        () => {
          remoteReactionTimerRef.current = null;
          setRemoteReaction(null);
        }
      );
    });
  }, [failPendingRoomCreate, resetTyping]);

  const connectSocket = useCallback(
    (url: string, kind: "practice" | "room") => {
    const previousSocket = socketRef.current;
    socketRef.current = null;
    storedRoomJoinInFlightRef.current = false;
    previousSocket?.disconnect();
    const socket = createRealtimeSocket({ transport: REALTIME_TRANSPORT, url });
    socketRef.current = socket;
    socketModeRef.current = kind;
    setSocketMode(kind);
    attachSocketHandlers(socket, kind);
    return socket;
    },
    [attachSocketHandlers]
  );

  const connectPracticeSocket = useCallback(() => connectSocket(realtimeUrl, "practice"), [connectSocket, realtimeUrl]);
  const connectRoomSocket = useCallback(
    (roomCode: string) => {
    const roomUrl = new URL(`/rooms/${roomCode}/socket`, realtimeUrl).toString();
    return connectSocket(roomUrl, "room");
    },
    [connectSocket, realtimeUrl]
  );

  const disconnectCurrentSocket = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    socketModeRef.current = null;
    storedRoomJoinInFlightRef.current = false;
    socket?.disconnect();
    setSocketMode(null);
    setConnected(false);
  }, []);

  const disconnectPracticeSocket = useCallback(() => {
    const socket = getPracticeSocketToRelease(socketRef.current, socketModeRef.current);
    if (!socket) {
      return;
    }

    socketRef.current = null;
    socketModeRef.current = null;
    socket.disconnect();
    setSocketMode(null);
    setConnected(false);
  }, []);

  const clearStoredRoomRetryTimer = useCallback(() => {
    if (storedRoomRetryTimerRef.current) {
      window.clearTimeout(storedRoomRetryTimerRef.current);
      storedRoomRetryTimerRef.current = null;
    }
  }, []);

  const discardStoredRoom = useCallback(
    (message: string) => {
      clearStoredRoomRetryTimer();
      storedRoomCodeRef.current = null;
      storedRoomJoinAttemptsRef.current = 0;
      storedRoomJoinInFlightRef.current = false;
      window.localStorage.removeItem(ROOM_CODE_KEY);
      setStoredRoomRecovery({ status: "idle", message: "" });
      setError(message);
      disconnectCurrentSocket();
    },
    [clearStoredRoomRetryTimer, disconnectCurrentSocket]
  );

  const attemptStoredRoomJoin = useCallback(
    (socket: ClientSocket) => {
      const storedRoomCode = storedRoomCodeRef.current;
      const currentSession = guestSessionRef.current;

      if (!storedRoomCode || !currentSession || storedRoomJoinInFlightRef.current) {
        return;
      }

      clearStoredRoomRetryTimer();
      storedRoomJoinInFlightRef.current = true;
      storedRoomJoinAttemptsRef.current += 1;
      const attempts = storedRoomJoinAttemptsRef.current;
      setStoredRoomRecovery({
        status: "reconnecting",
        message: `保存済みルームへ再接続しています（${attempts}/5）…`
      });

      socket.emit(
        "room:join",
        {
          roomCode: storedRoomCode,
          nickname: normalizeNickname(nicknameRef.current),
          guestId: currentSession.guestId,
          sessionId: currentSession.sessionId,
          deviceKind: detectDeviceKind()
        },
        (response) => {
          if (socketRef.current !== socket) {
            return;
          }

          storedRoomJoinInFlightRef.current = false;

          if (response.ok) {
            storedRoomJoinAttemptsRef.current = 0;
            storedRoomCodeRef.current = response.data.room.roomCode;
            setStoredRoomRecovery({ status: "idle", message: "" });
            setError("");
            setPlayerId(response.data.playerId);
            // Clear transient typing state before applying the stored snapshot.
            // A finished room carries its result in the snapshot, so resetting
            // afterwards would overwrite that result with null in the same batch.
            resetTyping();
            roomRef.current = response.data.room;
            resultRef.current = response.data.room.result ?? null;
            setRoom(response.data.room);
            setResult(response.data.room.result ?? null);
            updateGuestSession();
            clearPracticeState();
            const handoff = quickMatchHandoffRef.current;
            const gatewaySocket = matchmakingSocketRef.current;
            if (handoff?.role === "host" && gatewaySocket) {
              gatewaySocket.emit(
                "matchmaking:hostReady",
                { ticketId: handoff.ticketId, matchId: handoff.matchId },
                (hostReadyResponse) => {
                  if (!hostReadyResponse.ok || !hostReadyResponse.data.accepted) {
                    setQuickMatchPhase("error");
                    setError(hostReadyResponse.ok
                      ? "ホスト接続を確認できませんでした。もう一度お試しください。"
                      : hostReadyResponse.error);
                    return;
                  }
                  gatewaySocket.disconnect();
                  matchmakingSocketRef.current = null;
                  quickMatchHandoffRef.current = null;
                  setQuickMatchPhase("idle");
                }
              );
            } else if (handoff?.role === "guest" && gatewaySocket) {
              gatewaySocket.disconnect();
              matchmakingSocketRef.current = null;
              quickMatchHandoffRef.current = null;
              setQuickMatchPhase("idle");
            }
            return;
          }

          const action = getStoredRoomJoinFailureAction(response.error, attempts);
          if (action === "discard") {
            discardStoredRoom(response.error);
            return;
          }

          if (action === "pause") {
            setStoredRoomRecovery({
              status: "failed",
              message: "ルームへの再接続を一時停止しました。接続を確認して再試行してください。"
            });
            return;
          }

          const delay = getStoredRoomRejoinDelayMs(attempts);
          setStoredRoomRecovery({
            status: "reconnecting",
            message: `再接続に失敗しました。約 ${Math.ceil(delay / 1000)} 秒後に再試行します。`
          });
          storedRoomRetryTimerRef.current = window.setTimeout(() => {
            storedRoomRetryTimerRef.current = null;
            if (socketRef.current !== socket) {
              return;
            }
            attemptStoredRoomJoinRef.current(socket);
          }, delay);
        }
      );
    },
    [clearPracticeState, clearStoredRoomRetryTimer, discardStoredRoom, resetTyping, updateGuestSession]
  );

  useEffect(() => {
    attemptStoredRoomJoinRef.current = attemptStoredRoomJoin;
  }, [attemptStoredRoomJoin]);

  const retryStoredRoomJoin = useCallback(() => {
    const storedRoomCode = storedRoomCodeRef.current;
    if (!storedRoomCode) {
      setStoredRoomRecovery({ status: "idle", message: "" });
      return;
    }

    storedRoomJoinAttemptsRef.current = 0;
    setStoredRoomRecovery({ status: "reconnecting", message: "保存済みルームへ再接続しています…" });
    const socket = socketRef.current;

    if (socket && socketModeRef.current === "room" && socket.isConnected()) {
      attemptStoredRoomJoinRef.current(socket);
      return;
    }

    connectRoomSocket(storedRoomCode);
  }, [connectRoomSocket]);

  const beginQuickMatchRoomJoin = useCallback((
    assignment: MatchmakingAssignedHostPayload | MatchmakingMatchedPayload,
    role: "host" | "guest"
  ) => {
    quickMatchHandoffRef.current = {
      role,
      ticketId: assignment.ticketId,
      matchId: assignment.matchId
    };
    setQuickMatchTicketId(assignment.ticketId);
    setQuickMatchMatchId(assignment.matchId);
    setQuickMatchPhase("joiningRoom");
    storedRoomCodeRef.current = assignment.roomCode;
    window.localStorage.setItem(ROOM_CODE_KEY, assignment.roomCode);
    connectRoomSocket(assignment.roomCode);
  }, [connectRoomSocket]);

  const cancelQuickMatch = useCallback(() => {
    const socket = matchmakingSocketRef.current;
    const currentSession = guestSessionRef.current;
    if (socket && currentSession && quickMatchTicketId) {
      socket.emit(
        "matchmaking:cancel",
        {
          guestId: currentSession.guestId,
          sessionId: currentSession.sessionId,
          ticketId: quickMatchTicketId,
          ...(quickMatchMatchId ? { matchId: quickMatchMatchId } : {})
        },
        () => {}
      );
    }
    socket?.disconnect();
    matchmakingSocketRef.current = null;
    quickMatchHandoffRef.current = null;
    setQuickMatchPhase("idle");
    setQuickMatchStartedAt(null);
    setQuickMatchElapsedMs(0);
    setQuickMatchTicketId("");
    setQuickMatchMatchId("");
  }, [quickMatchMatchId, quickMatchTicketId]);

  const startQuickMatch = useCallback(() => {
    if (quickMatchPhase !== "idle" && quickMatchPhase !== "error" && quickMatchPhase !== "timeout") {
      return;
    }
    const currentSession = guestSessionRef.current;
    const currentNickname = nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    if (!realtimeConfigured || !currentSession || validationError) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    matchmakingSocketRef.current?.disconnect();
    const socket = createRealtimeSocket({ transport: REALTIME_TRANSPORT, url: realtimeUrl });
    matchmakingSocketRef.current = socket;
    quickMatchHandoffRef.current = null;
    setError("");
    setQuickMatchPhase("searching");
    setQuickMatchStartedAt(Date.now());
    setQuickMatchElapsedMs(0);
    setQuickMatchTicketId("");
    setQuickMatchMatchId("");

    socket.on("connect", () => {
      if (matchmakingSocketRef.current !== socket) return;
      socket.emit(
        "matchmaking:join",
        {
          guestId: currentSession.guestId,
          sessionId: currentSession.sessionId,
          nickname: normalizeNickname(currentNickname),
          deviceKind: detectDeviceKind(),
          blockedGuestIds: loadBlockedPlayers(window.localStorage).map((player) => player.id)
        },
        (response) => {
          if (matchmakingSocketRef.current !== socket) return;
          if (!response.ok) {
            setQuickMatchPhase("error");
            setError(response.error);
            return;
          }
          setQuickMatchTicketId(response.data.ticketId);
          if (response.data.status === "waitingHost") {
            setQuickMatchMatchId(response.data.matchId);
            setQuickMatchPhase("waitingHost");
          } else if (response.data.status === "assignedHost") {
            beginQuickMatchRoomJoin(response.data, "host");
          } else {
            setQuickMatchPhase("searching");
          }
        }
      );
    });
    socket.on("matchmaking:assignedHost", (assignment) => {
      if (matchmakingSocketRef.current === socket) {
        beginQuickMatchRoomJoin(assignment, "host");
      }
    });
    socket.on("matchmaking:waitingHost", (waiting) => {
      if (matchmakingSocketRef.current !== socket) return;
      setQuickMatchTicketId(waiting.ticketId);
      setQuickMatchMatchId(waiting.matchId);
      setQuickMatchPhase("waitingHost");
    });
    socket.on("matchmaking:matched", (assignment) => {
      if (matchmakingSocketRef.current === socket) {
        beginQuickMatchRoomJoin(assignment, "guest");
      }
    });
    socket.on("matchmaking:timeout", (timeout: MatchmakingTimeoutPayload) => {
      if (matchmakingSocketRef.current !== socket) return;
      setQuickMatchTicketId(timeout.ticketId);
      setQuickMatchMatchId(timeout.matchId ?? "");
      setQuickMatchPhase("timeout");
      socket.disconnect();
      matchmakingSocketRef.current = null;
    });
    socket.on("matchmaking:failed", (failure) => {
      if (matchmakingSocketRef.current !== socket) return;
      setQuickMatchPhase("error");
      setError(failure.retryable
        ? "マッチングを完了できませんでした。もう一度お試しください。"
        : "マッチングを続行できませんでした。");
    });
  }, [beginQuickMatchRoomJoin, quickMatchPhase, realtimeConfigured, realtimeUrl]);

  const startPractice = useCallback(() => {
    const currentNickname = nicknameInputRef.current?.value ?? nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!realtimeConfigured || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    const socket = connectPracticeSocket();
    prepareTypingInput();
    setHomeMode(null);
    void primeSoundPlayback();
    socket.emit(
      "practice:start",
      { nickname: normalizeNickname(currentNickname), category: practiceCategory },
      (response) => {
        if (socketRef.current !== socket) {
          return;
        }

        if (!response.ok) {
          setError(response.error);
          disconnectPracticeSocket();
          return;
        }

        disconnectPracticeSocket();
        setError("");
        setPracticeSession({
          ...response.data,
          category: practiceCategory,
          deviceKind,
          mode: "practice"
        });
        setPracticeResult(null);
        setPracticeProgress(createEmptyProgress());
        resetTyping();
      }
    );
  }, [connectPracticeSocket, disconnectPracticeSocket, guestId, practiceCategory, prepareTypingInput, realtimeConfigured, resetTyping]);

  const consumeDailyAttempt = useCallback(() => {
    if (!practiceSession || practiceSession.mode !== "daily" || dailyAttemptConsumedRef.current) {
      return;
    }

    const record = consumeDailyChallengeAttempt(
      window.localStorage,
      practiceSession.challengeKey ?? dailyChallengeInfo.challengeKey,
      practiceSession.prompt.id,
      Date.now()
    );
    if (!record) {
      return;
    }
    dailyAttemptConsumedRef.current = true;
    setDailyAttemptConsumed(true);
    setDailyChallengeRecord(getVisibleDailyChallengeRecord(record, dailyChallengeInfo.challengeKey));
  }, [dailyChallengeInfo.challengeKey, practiceSession]);

  const startDailyChallenge = useCallback(() => {
    const currentNickname = nicknameInputRef.current?.value ?? nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!realtimeConfigured || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    const currentRecord = loadDailyChallengeRecord(window.localStorage, dailyChallengeInfo.challengeKey);
    if ((currentRecord?.attempts ?? 0) >= DAILY_CHALLENGE_MAX_ATTEMPTS) {
      setError("今日のデイリー挑戦回数を使い切りました。次の日付まで待ってください。");
      return;
    }

    const socket = connectPracticeSocket();
    prepareTypingInput();
    setHomeMode(null);
    void primeSoundPlayback();
    socket.emit("practice:dailyStart", { nickname: normalizeNickname(currentNickname) }, (response) => {
      if (socketRef.current !== socket) {
        return;
      }

      if (!response.ok) {
        setError(response.error);
        disconnectPracticeSocket();
        return;
      }

      disconnectPracticeSocket();
      setError("");
      setPracticeSession({
        ...response.data,
        category: "standard",
        deviceKind,
        mode: "daily",
        ...(response.data.challengeKey ? { challengeKey: response.data.challengeKey } : {})
      });
        setPracticeResult(null);
        setPracticeProgress(createEmptyProgress());
        dailyAttemptConsumedRef.current = false;
        setDailyAttemptConsumed(false);
        resetTyping();
    });
  }, [connectPracticeSocket, dailyChallengeInfo.challengeKey, disconnectPracticeSocket, guestId, prepareTypingInput, realtimeConfigured, resetTyping]);

  const finishPractice = useCallback(
    (finalProgress: ProgressState) => {
      if (!practiceSession) {
        return;
      }

      if (practiceSession.mode === "daily") {
        consumeDailyAttempt();
      }

      const finishTimeMs = Date.now() - practiceSession.startedAt;
      const canonicalProgressIndex =
        inputModeRef.current === "kana"
          ? finalProgress.progressIndex
          : getCanonicalProgressIndex(
              buildRomajiTypingPlan(practiceSession.prompt.typing.hiragana),
              finalProgress.progressIndex
            );
      const player: PlayerResult = {
        id: practiceSession.practiceId,
        nickname: normalizeNickname(nicknameRef.current),
        connected: true,
        ready: true,
        isHost: true,
        isBot: false,
        progressIndex: canonicalProgressIndex,
        correctCharacters: finalProgress.correctCharacters,
        totalTypedCharacters: finalProgress.totalTypedCharacters,
        mistakes: finalProgress.mistakes,
        headAccessoryId: cosmeticProgress.headAccessoryId,
        heldItemId: cosmeticProgress.heldItemId,
        maxStreak: finalProgress.maxStreak,
        currentStreak: finalProgress.currentStreak,
        wpm: calculateWpm(finalProgress.correctCharacters, finishTimeMs),
        accuracy: calculateAccuracy(finalProgress.correctCharacters, finalProgress.totalTypedCharacters),
        finishedAt: Date.now(),
        finishTimeMs,
        rank: 1,
        finishGap: undefined
      };

      setPracticeResult({
        roomCode: practiceSession.practiceId,
        prompt: practiceSession.prompt,
        players: [player]
      });

      if (practiceSession.mode === "daily" && practiceSession.challengeKey) {
        const { visibleRecord } = recordDailyChallengeAttempt(
          window.localStorage,
          {
            challengeKey: practiceSession.challengeKey,
            promptId: practiceSession.prompt.id,
            wpm: player.wpm,
            accuracy: player.accuracy,
            mistakes: player.mistakes,
            finishTimeMs,
            completedAt: player.finishedAt ?? Date.now(),
            attemptConsumed: dailyAttemptConsumedRef.current
          },
          dailyChallengeInfo.challengeKey
        );
        setDailyChallengeRecord(visibleRecord);
      }

      disconnectPracticeSocket();
    },
    [
      consumeDailyAttempt,
      cosmeticProgress.headAccessoryId,
      cosmeticProgress.heldItemId,
      dailyChallengeInfo.challengeKey,
      disconnectPracticeSocket,
      practiceSession,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const fallbackRealtimeUrl = getDefaultRealtimeUrl(REALTIME_TRANSPORT, window.location);
    setLocalRealtimeUrl(fallbackRealtimeUrl ?? "");
  }, []);

  useEffect(() => {
    const session = loadGuestSession(window.localStorage);
    guestSessionRef.current = session;
    setGuestSession(session);
    const loadedSettings = loadPlayerSettings(window.localStorage);
    nicknameRef.current = loadedSettings.nickname;
    setSettings(loadedSettings);
    setSettingsHydrated(true);
    setTutorialStep(loadedSettings.tutorialSeen ? null : 0);
    setCosmeticProgress(loadCosmeticProgress(window.localStorage));
    setCosmeticProgressHydrated(true);

    if (!realtimeConfigured) {
      setConnected(false);
      return;
    }

    const storedRoomCode = window.localStorage.getItem(ROOM_CODE_KEY);
    const guestIdFromSession = session?.guestId ?? "";
    const sessionIdFromSession = session?.sessionId ?? "";

    if (!storedRoomCode || !guestIdFromSession || !sessionIdFromSession) {
      storedRoomCodeRef.current = null;
    } else {
      storedRoomCodeRef.current = storedRoomCode;
      setStoredRoomRecovery({ status: "reconnecting", message: "保存済みルームへ再接続しています…" });
      connectRoomSocket(storedRoomCode);
    }

    return () => {
      clearStoredRoomRetryTimer();
      socketRef.current?.disconnect();
      socketRef.current = null;
      matchmakingSocketRef.current?.disconnect();
      matchmakingSocketRef.current = null;
      socketModeRef.current = null;
      setSocketMode(null);
    };
  }, [clearStoredRoomRetryTimer, connectRoomSocket, realtimeConfigured]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    persistPlayerSettings(window.localStorage, settings);
    applyPlayerSettingsToDocument(document, settings);
    settingsRef.current = settings;
  }, [settings, settingsHydrated]);

  useEffect(() => {
    if (!cosmeticProgressHydrated) {
      return;
    }
    persistCosmeticProgress(window.localStorage, cosmeticProgress);
  }, [cosmeticProgress, cosmeticProgressHydrated]);

  useEffect(() => {
    if (
      !cosmeticProgressHydrated
      || !room
      || !currentPlayer
      || (room.status !== "waiting" && room.status !== "finished")
      || (
        currentPlayer.headAccessoryId === cosmeticProgress.headAccessoryId
        && currentPlayer.heldItemId === cosmeticProgress.heldItemId
      )
    ) {
      return;
    }
    socketRef.current?.emit("player:equipment", {
      roomCode: room.roomCode,
      headAccessoryId: cosmeticProgress.headAccessoryId,
      heldItemId: cosmeticProgress.heldItemId,
    });
  }, [
    cosmeticProgress.headAccessoryId,
    cosmeticProgress.heldItemId,
    cosmeticProgressHydrated,
    currentPlayer,
    room,
  ]);

  useEffect(() => {
    if (!cosmeticProgressHydrated || !result || !room || !playerId) {
      return;
    }
    const player = result.players.find((entry) => entry.id === playerId);
    if (!player) {
      return;
    }
    setCosmeticProgress((current) => {
      const reward = awardStyleCoins(current, {
        rewardKey: createMatchRewardKey(room.roomCode, room.round ?? 0, playerId),
        source: "match",
        completed: !player.forfeited && player.finishStatus !== "forfeited",
        won: player.rank === 1,
        typedCharacters: player.totalTypedCharacters,
        accuracy: player.accuracy,
        mistakes: player.mistakes,
      });
      if (reward.awarded) {
        setLatestCoinReward(reward.breakdown);
      }
      return reward.progress;
    });
  }, [cosmeticProgressHydrated, playerId, result, room]);

  useEffect(() => {
    if (!cosmeticProgressHydrated || !practiceResult || !practiceSession) {
      return;
    }
    const player = practiceResult.players[0];
    if (!player) {
      return;
    }
    setCosmeticProgress((current) => {
      const reward = awardStyleCoins(current, {
        rewardKey: createPracticeRewardKey(practiceSession.practiceId),
        source: practiceSession.mode,
        completed: true,
        typedCharacters: player.totalTypedCharacters,
        accuracy: player.accuracy,
        mistakes: player.mistakes,
      });
      if (reward.awarded) {
        setLatestCoinReward(reward.breakdown);
      }
      return reward.progress;
    });
  }, [cosmeticProgressHydrated, practiceResult, practiceSession]);

  useEffect(() => {
    if (!guestSession) {
      return;
    }

    persistGuestSession(window.localStorage, guestSession);
  }, [guestSession]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    setDailyChallengeRecord(loadDailyChallengeRecord(window.localStorage, dailyChallengeInfo.challengeKey));
  }, [dailyChallengeInfo.challengeKey, settingsHydrated]);

  useEffect(() => {
    const delay = Math.max(dailyChallengeInfo.nextChallengeAt - Date.now(), 1_000);
    const timer = window.setTimeout(() => {
      setDailyChallengeNow(new Date());
    }, delay);

    return () => window.clearTimeout(timer);
  }, [dailyChallengeInfo.nextChallengeAt]);

  useEffect(() => {
    if (!practiceSession || practiceSession.mode !== "daily" || dailyAttemptConsumed || practiceResult) {
      return;
    }

    const elapsed = Date.now() - practiceSession.startedAt;
    const timer = window.setTimeout(consumeDailyAttempt, Math.max(5_000 - elapsed, 0));
    return () => window.clearTimeout(timer);
  }, [consumeDailyAttempt, dailyAttemptConsumed, practiceResult, practiceSession]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    setMistakeTrendRecord(loadMistakeTrendRecord(window.localStorage));
  }, [settingsHydrated]);

  useEffect(() => {
    const handlePrimeSound = () => {
      void primeSoundPlayback();
    };

    window.addEventListener("pointerdown", handlePrimeSound, { once: true });
    window.addEventListener("keydown", handlePrimeSound, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handlePrimeSound);
      window.removeEventListener("keydown", handlePrimeSound);
    };
  }, []);

  useEffect(() => {
    localProgressRef.current = localProgress;
  }, [localProgress]);

  useEffect(() => {
    practiceProgressRef.current = practiceProgress;
  }, [practiceProgress]);

  useEffect(() => {
    if (!settingsHydrated || !mistakeTrendRecord) {
      return;
    }

    persistMistakeTrendRecord(window.localStorage, mistakeTrendRecord);
  }, [mistakeTrendRecord, settingsHydrated]);

  useEffect(() => {
    if (!currentPlayer) {
      return;
    }

    const serverInputMode = currentPlayer.inputMode;
    if (
      serverInputMode &&
      currentPlayer.totalTypedCharacters >= localProgressRef.current.totalTypedCharacters &&
      serverInputMode !== inputModeRef.current
    ) {
      inputModeRef.current = serverInputMode;
      setInputMode(serverInputMode);
    }

    setLocalProgress((previous) => reconcileRoomProgress(previous, currentPlayer, inputModeRef.current));
  }, [currentPlayer]);

  useEffect(() => {
    if (!room?.serverStartAt || room.status !== "countdown") {
      setCountdownMs(0);
      countdownSecondRef.current = null;
      return;
    }

    const interval = window.setInterval(() => {
      setCountdownMs(Math.max((room.serverStartAt ?? Date.now()) - Date.now(), 0));
    }, 100);

    return () => window.clearInterval(interval);
  }, [room?.serverStartAt, room?.status]);

  useEffect(() => {
    const matchEndsAt = room?.matchEndsAt;

    if (!room || room.status !== "playing" || (room.matchRule !== "timeAttack" && room.matchRule !== "hpBattle") || !matchEndsAt) {
      setMatchTimerMs(0);
      return;
    }

    const interval = window.setInterval(() => {
      setMatchTimerMs(Math.max(matchEndsAt - Date.now(), 0));
    }, 100);

    return () => window.clearInterval(interval);
  }, [room?.matchEndsAt, room?.matchRule, room?.status]);

  useEffect(() => {
    if (!isRoomPlaying) {
      return;
    }

    const interval = window.setInterval(() => setSyncClock(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [isRoomPlaying]);

  useEffect(() => {
    if (!room || room.status !== "countdown") {
      countdownSecondRef.current = null;
      return;
    }

    const nextSecond = Math.max(1, Math.ceil(countdownMs / 1000));

    if (countdownSecondRef.current === null) {
      countdownSecondRef.current = nextSecond;
      void playCountdownSound({ enabled: settingsRef.current.countdownSoundEnabled }, nextSecond);
      return;
    }

    if (nextSecond < countdownSecondRef.current) {
      countdownSecondRef.current = nextSecond;
      void playCountdownSound({ enabled: settingsRef.current.countdownSoundEnabled }, nextSecond);
    }
  }, [countdownMs, room]);

  useEffect(() => {
    if (!acceptingTextInput || activeInputDeviceKind === "mobile") {
      return;
    }

    const input = typingInputRef.current;
    if (!input) {
      return;
    }

    input.focus({ preventScroll: true });
  }, [acceptingTextInput, activeInputDeviceKind, activeTypingText]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const updateViewportHeight = () => {
      const nextHeight = Math.round(viewport.height);
      const layoutHeight = document.documentElement.clientHeight;
      setVisualViewportHeight(nextHeight < layoutHeight - 80 ? nextHeight : null);
    };
    updateViewportHeight();
    viewport.addEventListener("resize", updateViewportHeight);
    return () => viewport.removeEventListener("resize", updateViewportHeight);
  }, []);

  useLayoutEffect(() => {
    if (!acceptingTextInput || visualViewportHeight === null) {
      return;
    }

    const surface = matchSurfaceRef.current;
    const prompt = surface?.querySelector<HTMLElement>(".promptBox");
    if (!surface || !prompt) {
      return;
    }

    let frame: number | null = null;
    const revealTypingPrompt = () => {
      frame = null;
      const surfaceBounds = surface.getBoundingClientRect();
      const promptBounds = prompt.getBoundingClientRect();
      const nextScrollTop = getScrollTopToRevealTarget({
        scrollTop: surface.scrollTop,
        containerTop: surfaceBounds.top,
        containerBottom: surfaceBounds.bottom,
        targetTop: promptBounds.top,
        targetBottom: promptBounds.bottom,
        padding: 12
      });

      if (Math.abs(nextScrollTop - surface.scrollTop) > 1) {
        surface.scrollTo({ top: nextScrollTop, behavior: "instant" });
      }
    };
    const scheduleReveal = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(revealTypingPrompt);
    };

    scheduleReveal();
    const resizeObserver = new ResizeObserver(scheduleReveal);
    resizeObserver.observe(surface);
    resizeObserver.observe(prompt);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", scheduleReveal);

    return () => {
      resizeObserver.disconnect();
      viewport?.removeEventListener("resize", scheduleReveal);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [acceptingTextInput, activeTypingText, visualViewportHeight]);

  const emitProgress = useCallback(
    (input: string, finish: boolean) => {
      const socket = socketRef.current;
      const currentRoom = roomRef.current;

      if (!socket || !currentRoom || !socket.isConnected()) {
        return;
      }

      const messages = createTypingMessageBatch({
        roomCode: currentRoom.roomCode,
        text: input,
        finish,
        previousSequence: inputSequenceRef.current
      });
      inputSequenceRef.current = messages.at(-1)!.payload.sequence;
      setLastProgressSentAt(Date.now());
      setSyncClock(Date.now());

      if (finish) {
        if (currentRoom.matchRule === "race") {
          roomFinishPendingRef.current = true;
          setRoomFinishPending(true);
          typingInputRef.current?.blur();
        }
      }

      for (const message of messages) {
        socket.emit(message.event, message.payload);
      }
    },
    []
  );

  const handleTypedText = useCallback(
    (typedText: string) => {
      if (!typedText) {
        return;
      }

      if (roomFinishPendingRef.current) {
        return;
      }

      const currentRoom = roomRef.current;

      if (currentRoom?.status === "playing" && currentRoom.prompt && !resultRef.current) {
        const previous = localProgressRef.current;
        const next = advanceTypingProgress({
          previous,
          typedText,
          deviceKind: activeInputDeviceKind,
          canonicalText: activePrompt?.typing.hiragana ?? activeTypingText,
          displayText: activeTypingText,
          romajiPlan: activeRomajiTypingPlan,
          loop: isLoopingMatchPlaying && !usesTimeAttackPromptSequence,
          progressBase: activeProgressBase,
          progressBaseByMode: {
            kana: activeCanonicalProgressBase,
            romaji: activeRomajiProgressBase
          },
          inputMode: inputModeRef.current
        });
        const nextInputMode = resolveTypingInputMode(inputModeRef.current, typedText);
        inputModeRef.current = nextInputMode;
        setInputMode(nextInputMode);
        const correct = next.progress.correctCharacters > previous.correctCharacters;

        setLocalProgress(next.progress);
        localProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);
        void playTypingSound({ enabled: settingsRef.current.soundEnabled }, correct);
        emitProgress(
          typedText,
          !isLoopingMatchPlaying &&
            (inputModeRef.current === "kana"
              ? next.progress.progressIndex
              : getCanonicalProgressIndex(activeRomajiTypingPlan!, next.progress.progressIndex)) >=
              Array.from(activePrompt?.typing.hiragana ?? activeTypingText).length
        );
        return;
      }

      if (practiceSession && !practiceResult && !room) {
        const previous = practiceProgressRef.current;
        const next = advanceTypingProgress({
          previous,
          typedText,
          deviceKind: activeInputDeviceKind,
          canonicalText: activePrompt?.typing.hiragana ?? activeTypingText,
          displayText: activeTypingText,
          romajiPlan: activeRomajiTypingPlan,
          loop: isLoopingMatchPlaying && !usesTimeAttackPromptSequence,
          progressBase: activeProgressBase,
          progressBaseByMode: {
            kana: activeCanonicalProgressBase,
            romaji: activeRomajiProgressBase
          },
          inputMode: inputModeRef.current
        });
        const nextInputMode = resolveTypingInputMode(inputModeRef.current, typedText);
        inputModeRef.current = nextInputMode;
        setInputMode(nextInputMode);
        const correct = next.progress.correctCharacters > previous.correctCharacters;

        setPracticeProgress(next.progress);
        practiceProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);

        if (practiceSession.mode === "daily" && correct) {
          consumeDailyAttempt();
        }

        if (
          (inputModeRef.current === "kana"
            ? next.progress.progressIndex
            : getCanonicalProgressIndex(activeRomajiTypingPlan!, next.progress.progressIndex)) >=
          Array.from(activePrompt?.typing.hiragana ?? activeTypingText).length
        ) {
          finishPractice(next.progress);
        }

        void playTypingSound({ enabled: settingsRef.current.soundEnabled }, correct);
      }
    },
    [
      activeTypingText,
      emitProgress,
      isLoopingMatchPlaying,
      finishPractice,
      practiceResult,
      practiceSession,
      consumeDailyAttempt,
      recordMistakeSamples,
      activeInputDeviceKind,
      activeProgressBase,
      activePrompt,
      activeRomajiTypingPlan,
      usesTimeAttackPromptSequence,
      room
    ]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const practiceActive = Boolean(practiceSession && !practiceResult && !room);
      const roomPlaying = room?.status === "playing";

      if (!shouldHandleDesktopTypingKey({
        roomPlaying,
        practiceActive,
        acceptingTextInput,
        roomFinishPending: roomFinishPendingRef.current,
        exitRequested: exitRequest !== null,
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
      const typedKey = event.key.toLowerCase();

      if (room?.status === "playing" && room?.prompt) {
        const previous = localProgressRef.current;
        const next = advanceTypingProgress({
          previous,
          typedText: typedKey,
          deviceKind: activeInputDeviceKind,
          canonicalText: activePrompt?.typing.hiragana ?? activeTypingText,
          displayText: activeTypingText,
          romajiPlan: activeRomajiTypingPlan,
          loop: isLoopingMatchPlaying && !usesTimeAttackPromptSequence,
          progressBase: activeProgressBase,
          progressBaseByMode: {
            kana: activeCanonicalProgressBase,
            romaji: activeRomajiProgressBase
          },
          inputMode: inputModeRef.current
        });
        const nextInputMode = resolveTypingInputMode(inputModeRef.current, typedKey);
        inputModeRef.current = nextInputMode;
        setInputMode(nextInputMode);
        const correct = next.progress.correctCharacters > previous.correctCharacters;
        const soundOptions = settingsRef.current;

        setLocalProgress(next.progress);
        localProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);
        void playTypingSound({ enabled: soundOptions.soundEnabled }, correct);
        emitProgress(
          typedKey,
          !isLoopingMatchPlaying &&
            (inputModeRef.current === "kana"
              ? next.progress.progressIndex
              : getCanonicalProgressIndex(activeRomajiTypingPlan!, next.progress.progressIndex)) >=
              Array.from(activePrompt?.typing.hiragana ?? activeTypingText).length
        );
        return;
      }

      if (practiceActive && practiceSession) {
        const previous = practiceProgressRef.current;
        const next = advanceTypingProgress({
          previous,
          typedText: typedKey,
          deviceKind: activeInputDeviceKind,
          canonicalText: activePrompt?.typing.hiragana ?? activeTypingText,
          displayText: activeTypingText,
          romajiPlan: activeRomajiTypingPlan,
          loop: isLoopingMatchPlaying && !usesTimeAttackPromptSequence,
          progressBase: activeProgressBase,
          progressBaseByMode: {
            kana: activeCanonicalProgressBase,
            romaji: activeRomajiProgressBase
          },
          inputMode: inputModeRef.current
        });
        const nextInputMode = resolveTypingInputMode(inputModeRef.current, typedKey);
        inputModeRef.current = nextInputMode;
        setInputMode(nextInputMode);
        const correct = next.progress.correctCharacters > previous.correctCharacters;
        const soundOptions = settingsRef.current;

        setPracticeProgress(next.progress);
        practiceProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);

        if (practiceSession.mode === "daily" && correct) {
          consumeDailyAttempt();
        }

        if (
          (inputModeRef.current === "kana"
            ? next.progress.progressIndex
            : getCanonicalProgressIndex(activeRomajiTypingPlan!, next.progress.progressIndex)) >=
          Array.from(activePrompt?.typing.hiragana ?? activeTypingText).length
        ) {
          finishPractice(next.progress);
        }

        void playTypingSound({ enabled: soundOptions.soundEnabled }, correct);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeInputDeviceKind,
    activeProgressBase,
    activeTypingText,
    acceptingTextInput,
    emitProgress,
    finishPractice,
    consumeDailyAttempt,
    isLoopingMatchPlaying,
    practiceResult,
    practiceSession,
    recordMistakeSamples,
    activePrompt,
    activeRomajiTypingPlan,
    exitRequest,
    usesTimeAttackPromptSequence,
    room
  ]);

  const createRoom = () => {
    const currentNickname = nicknameRef.current;
    const roomCode = createRoomCode();
    const validationError = validateNickname(currentNickname);

    if (createPendingRef.current) {
      return;
    }

    setError("");

    if (!realtimeConfigured || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    createPendingRef.current = true;
    setCreatePending(true);
    setError("");
    void primeSoundPlayback();
    const socket = connectRoomSocket(roomCode);
    socket.emit(
      "room:create",
      {
        roomCode,
        nickname: normalizeNickname(currentNickname),
        guestId,
        sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        if (socketRef.current !== socket) {
          return;
        }

        if (!response.ok) {
          failPendingRoomCreate(
            response.error === "Realtime request timed out."
              ? "ルーム作成の応答がありませんでした。接続を確認して、もう一度お試しください。"
              : response.error
          );
          disconnectCurrentSocket();
          return;
        }

        createPendingRef.current = false;
        setCreatePending(false);
        setError("");
        setCopyFeedback({ kind: "idle", message: "" });
        setPlayerId(response.data.playerId);
        storedRoomCodeRef.current = response.data.roomCode;
        setRoom(response.data.room);
        window.localStorage.setItem(ROOM_CODE_KEY, response.data.roomCode);
        updateGuestSession();
        clearPracticeState();
        resetTyping();
      }
    );
  };

  const joinRoom = () => {
    const currentNickname = nicknameRef.current;
    const roomCode = joinCode.trim().toUpperCase();
    const validationError = validateNickname(currentNickname);

    setError("");

    if (!roomCode) {
      setError("ルームコードを入力してください。");
      return;
    }

    if (!realtimeConfigured || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
    setHomeMode(null);
      return;
    }

    void primeSoundPlayback();
    const socket = connectRoomSocket(roomCode);
    setJoinPending(true);
    socket.emit(
      "room:join",
      {
        roomCode,
        nickname: normalizeNickname(currentNickname),
        guestId,
        sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        setJoinPending(false);
        if (socketRef.current !== socket) {
          return;
        }

        if (!response.ok) {
          setError(response.error);
          disconnectCurrentSocket();
          return;
        }

        setError("");
        setPlayerId(response.data.playerId);
        storedRoomCodeRef.current = response.data.room.roomCode;
        setRoom(response.data.room);
        window.localStorage.setItem(ROOM_CODE_KEY, response.data.room.roomCode);
        updateGuestSession();
        clearPracticeState();
        resetTyping();
      }
    );
  };

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;

    if (socket && room) {
      socket.emit("room:leave", { roomCode: room.roomCode });
    }
    clearStoredRoomRetryTimer();
    storedRoomCodeRef.current = null;
    storedRoomJoinAttemptsRef.current = 0;
    storedRoomJoinInFlightRef.current = false;
    window.localStorage.removeItem(ROOM_CODE_KEY);
    setStoredRoomRecovery({ status: "idle", message: "" });
    setHomeMode(null);

    disconnectCurrentSocket();
    setRoom(null);
    setResult(null);
    setPlayerId("");
    clearPracticeState();
    resetTyping();
    setExitRequest(null);
  }, [clearPracticeState, clearStoredRoomRetryTimer, disconnectCurrentSocket, resetTyping, room]);

  const setReady = () => {
    if (!realtimeConfigured || !socketRef.current || !room || !currentPlayer) {
      return;
    }

    prepareTypingInput();
    socketRef.current.emit("player:ready", {
      roomCode: room.roomCode,
      ready: !currentPlayer.ready
    });
  };

  const startMatch = useCallback(() => {
    const socket = socketRef.current;
    if (!realtimeConfigured || !socket || !room) {
      return false;
    }

    prepareTypingInput();
    void primeSoundPlayback();
    socket.emit("match:start", { roomCode: room.roomCode }, (response) => {
      if (socketRef.current !== socket) {
        return;
      }
      if (!response.ok) {
        setError(response.error);
        autoStartRoomRef.current = null;
      }
    });
    return true;
  }, [prepareTypingInput, primeSoundPlayback, realtimeConfigured, room]);

  const sendReaction = useCallback((reaction: QuickReaction) => {
    const socket = socketRef.current;
    const now = Date.now();

    if (reactionRequestPendingRef.current) {
      return;
    }

    if (now < reactionCooldownUntilRef.current) {
      setReactionFeedback(createCooldownReactionFeedback());
      return;
    }

    if (!socket || !room || !connected) {
      setReactionFeedback(createReactionErrorFeedback("Realtimeに接続していないため、リアクションを送信できません。"));
      return;
    }

    clearReactionFeedbackTimers();
    reactionRequestPendingRef.current = true;
    setReactionFeedback(createSendingReactionFeedback(reaction));
    socket.emit("player:reaction", { roomCode: room.roomCode, reaction }, (response) => {
      if (socketRef.current !== socket) {
        reactionRequestPendingRef.current = false;
        return;
      }
      reactionRequestPendingRef.current = false;
      if (!response.ok) {
        reactionCooldownUntilRef.current = 0;
        setReactionFeedback(createReactionErrorFeedback(response.error));
        return;
      }

      reactionCooldownUntilRef.current = Date.now() + REACTION_COOLDOWN_MS;
      setReactionFeedback(createSentReactionFeedback(reaction));
      reactionDisplayTimerRef.current = window.setTimeout(() => {
        reactionDisplayTimerRef.current = null;
        setReactionFeedback(createCooldownReactionFeedback());
      }, REACTION_DISPLAY_MS);
      reactionCooldownTimerRef.current = window.setTimeout(() => {
        reactionCooldownTimerRef.current = null;
        reactionCooldownUntilRef.current = 0;
        setReactionFeedback(INITIAL_REACTION_FEEDBACK);
      }, REACTION_COOLDOWN_MS);
    });
  }, [clearReactionFeedbackTimers, connected, room]);

  useEffect(() => {
    if (!room || room.status !== "waiting") {
      autoStartRoomRef.current = null;
      return;
    }

    const humans = room.players.filter((player) => !player.isBot);
    const allReady = humans.length > 0 && humans.every((player) => player.ready && player.connected);

    if (!currentPlayer?.isHost || !allReady || autoStartRoomRef.current === room.roomCode) {
      if (!allReady) {
        autoStartRoomRef.current = null;
      }
      return;
    }

    autoStartRoomRef.current = room.roomCode;
    startMatch();
  }, [currentPlayer?.isHost, room, startMatch]);

  const rematch = () => {
    const socket = socketRef.current;
    if (!realtimeConfigured || !socket || !room || !currentPlayer) {
      return;
    }

    const hasHumanOpponent = room.players.some((player) => player.id !== currentPlayer.id && !player.isBot);

    if (room.status === "finished" && hasHumanOpponent) {
      socket.emit("player:ready", {
        roomCode: room.roomCode,
        ready: !currentPlayer.ready
      });
      setRematchError("");
      return;
    }

    if (room.status !== "finished") {
      return;
    }

    prepareTypingInput();
    setRematchPending(true);
    setRematchError("");
    void primeSoundPlayback();
    socket.emit("match:rematch", { roomCode: room.roomCode }, (response) => {
      if (socketRef.current !== socket) {
        return;
      }
      if (!response.ok) {
        setRematchError(response.error);
        setRematchPending(false);
        return;
      }

      setRematchPending(false);
      setResult(null);
      clearPracticeState();
      resetTyping();
    });
  };

  const repeatPractice = useCallback(() => {
    if (!practiceSession || practiceSession.mode !== "practice") {
      return;
    }
    setPracticeSession((current) => current ? { ...current, startedAt: Date.now() } : current);
    setPracticeResult(null);
    setPracticeProgress(createEmptyProgress());
    resetTyping();
    prepareTypingInput();
  }, [practiceSession, prepareTypingInput, resetTyping]);

  const returnToPracticeMenu = useCallback(() => {
    disconnectPracticeSocket();
    clearPracticeState();
    resetTyping();
    setSoloSetupView("menu");
    setHomeMode("solo");
    setExitRequest(null);
  }, [clearPracticeState, disconnectPracticeSocket, resetTyping]);

  const openExitRequest = useCallback((request: ExitRequest) => {
    const activeElement = document.activeElement;
    exitTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setExitRequest(request);
  }, []);

  const cancelExitRequest = useCallback(() => {
    const trigger = exitTriggerRef.current;
    exitTriggerRef.current = null;
    setExitRequest(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (acceptingTextInput) {
          prepareTypingInput();
          return;
        }

        trigger?.focus();
      });
    });
  }, [acceptingTextInput, prepareTypingInput]);

  const requestRoomExit = useCallback(() => {
    if (!room) {
      return;
    }

    if (room.status === "finished") {
      leaveRoom();
      return;
    }

    openExitRequest("room");
  }, [leaveRoom, openExitRequest, room]);

  const requestPracticeExit = useCallback(() => {
    if (!practiceSession && !practiceResult) {
      return;
    }

    if (practiceResult) {
      returnToPracticeMenu();
      return;
    }

    openExitRequest("practice");
  }, [openExitRequest, practiceResult, practiceSession, returnToPracticeMenu]);

  const confirmExit = useCallback(() => {
    if (exitRequest === "room") {
      leaveRoom();
      return;
    }

    if (exitRequest === "practice") {
      returnToPracticeMenu();
    }
  }, [exitRequest, leaveRoom, returnToPracticeMenu]);

  const retryPractice = activePracticeMode === "daily" ? startDailyChallenge : repeatPractice;
  const dailyRetryDisabledReason =
    activePracticeMode === "daily" &&
    (visibleDailyChallengeRecord?.attempts ?? 0) >= DAILY_CHALLENGE_MAX_ATTEMPTS
      ? `今日の挑戦上限（${DAILY_CHALLENGE_MAX_ATTEMPTS}回）に達しました。次のデイリーチャレンジは${DAILY_CHALLENGE_RESET_TIME_FORMATTER.format(dailyChallengeInfo.nextChallengeAt)}から挑戦できます。`
      : "";

  const copyRoomCode = async () => {
    if (!room) {
      return;
    }

    setCopyFeedback({ kind: "idle", message: "" });
    try {
      await copyText(room.roomCode);
      setCopyFeedback({ kind: "success", message: "ルームコードをコピーしました。" });
    } catch {
      setCopyFeedback({
        kind: "error",
        message: "ルームコードをコピーできませんでした。コードを選択してコピーしてください。",
      });
    }
  };
  const changeEquipment = useCallback((equipment: EquipmentSelection) => {
    setCosmeticProgress((current) => {
      const withHead = equipCosmetic(current, {
        slot: "head",
        id: equipment.headAccessoryId,
      });
      return equipCosmetic(withHead, {
        slot: "held",
        id: equipment.heldItemId,
      });
    });
  }, []);
  const purchaseSelectedCosmetic = useCallback(
    (selection: Parameters<typeof purchaseCosmetic>[1]) => {
      const purchase = purchaseCosmetic(cosmeticProgress, selection);
      if (purchase.ok) {
        setCosmeticProgress(purchase.progress);
        return "purchased" as const;
      }
      return purchase.reason === "insufficient-coins"
        ? "insufficient-coins" as const
        : "already-owned" as const;
    },
    [cosmeticProgress],
  );
  const isRecoveringStoredRoom = storedRoomRecovery.status !== "idle";
  const showHomeModeMenu = !room && !practiceSession && !practiceResult && homeMode === null && !isRecoveringStoredRoom;
  const showModeSetup = !room && !practiceSession && !practiceResult && homeMode !== null;
  const hasNickname = nickname.trim().length > 0;
  const completeTutorial = () => {
    setTutorialStep(null);
    setSettings((current) => ({ ...current, tutorialSeen: true }));
  };
  const advanceTutorial = () => {
    setTutorialStep((current) => {
      if (current === null || current >= 2) {
        setSettings((settings) => ({ ...settings, tutorialSeen: true }));
        return null;
      }
      return current + 1;
    });
  };
  const openSoloSetupView = (view: Exclude<SoloSetupView, "menu">) => {
    if (view !== "mistakes") {
      const validationError = validateNickname(nicknameRef.current);
      if (validationError) {
        setError(validationError);
        window.requestAnimationFrame(() => nicknameInputRef.current?.focus());
        return;
      }
    }

    setError("");
    setSoloSetupView(view);
  };
  const visualState = showHomeModeMenu
    ? "isHome"
    : showModeSetup && homeMode === "solo"
      ? `isSoloSetup isSoloSetup-${soloSetupView}`
      : showModeSetup && homeMode === "battle"
        ? "isBattleSetup"
        : room?.status === "waiting"
          ? "isLobby"
          : room
            ? `isBattle isBattle-${room.matchRule}`
            : practiceSession || practiceResult
              ? `isPractice isPractice-${activePracticeMode}`
              : "isSetup";

  return (
    <main
      className={`appShell ${visualState}${activeResult ? " hasResult" : ""}${visualViewportHeight === null ? "" : " hasConstrainedViewport"}`}
      data-settings-hydrated={settingsHydrated}
      style={visualViewportHeight === null ? undefined : { "--visual-viewport-height": `${visualViewportHeight}px` } as CSSProperties}
    >
      <GameHeader
        connected={connected}
        realtimeConfigured={realtimeConfigured}
        equipment={cosmeticProgress}
        onOpenSettings={() => setSettingsOpen(true)}
        exitAction={room ? { label: room.status === "finished" ? "ルームを退出" : "対戦を退出", onClick: requestRoomExit } : practiceSession || practiceResult ? { label: practiceResult ? "ひとり用メニューへ" : "練習をやめる", onClick: requestPracticeExit } : showModeSetup && homeMode === "solo" && soloSetupView !== "menu" ? { label: "ひとり用メニューへ", onClick: () => setSoloSetupView("menu") } : showModeSetup ? { label: "モード選択へ", onClick: () => setHomeMode(null) } : undefined}
        status={room && room.status !== "waiting" ? (result ? "result" : room.status) : practiceSession || practiceResult ? (practiceResult ? "result" : "playing") : undefined}
      />

      {storedRoomRecovery.status !== "idle" ? (
        <div className="infoText realtimeRecoveryNotice" role="status">
          <p>{storedRoomRecovery.message}</p>
          {storedRoomRecovery.status === "failed" ? (
            <button className="secondaryButton" type="button" onClick={retryStoredRoomJoin}>
              再接続を再試行
            </button>
          ) : null}
        </div>
      ) : null}

      {showHomeModeMenu ? (
        <HomeModeMenu
          onBattle={() => setHomeMode("battle")}
          onSolo={() => { setSoloSetupView("menu"); setHomeMode("solo"); }}
          equipment={cosmeticProgress}
          styleCoins={cosmeticProgress.styleCoins}
          onOpenShop={() => setCustomizationView("shop")}
          onOpenEquipment={() => setCustomizationView("equipment")}
        />
      ) : (
      <section className={showModeSetup ? "workspace modeWorkspace" : "workspace"}>
        <aside className="sidePanel" aria-label="ルーム操作">
          {!realtimeConfigured ? (
            <p className="infoText">
              Realtime の接続先が未設定のため、今は Vercel への web deploy はできますが対戦は使えません。
            </p>
          ) : null}

          {showModeSetup && !hasNickname && (homeMode === "battle" || soloSetupView === "menu") ? (
          <div className="fieldGroup nicknameSetupField">
            <label htmlFor="nickname">ニックネーム</label>
            <input
              id="nickname"
              ref={nicknameInputRef}
              value={nickname}
              maxLength={18}
              onChange={(event) => setNickname(event.target.value)}
              disabled={!settingsHydrated || Boolean(room)}
              suppressHydrationWarning
            />
            <small>開始前にニックネームを入力してください。</small>
          </div>
          ) : null}

          {!room && homeMode === "solo" && soloSetupView === "menu" ? (
            <SoloModeMenu
              onPractice={() => openSoloSetupView("practice")}
              onDaily={() => openSoloSetupView("daily")}
              onMistakes={() => openSoloSetupView("mistakes")}
            />
          ) : null}

          {!room && homeMode === "battle" ? (
            <div className="roomActions">
              <button
                className="primaryButton"
                type="button"
                onClick={startQuickMatch}
                disabled={!realtimeConfigured || ["searching", "waitingHost", "joiningRoom"].includes(quickMatchPhase)}
                aria-busy={["searching", "waitingHost", "joiningRoom"].includes(quickMatchPhase)}
              >
                <Users size={18} />
                {quickMatchPhase === "searching"
                  ? "対戦相手を検索中…"
                  : quickMatchPhase === "waitingHost"
                    ? "ホスト接続待ち…"
                    : quickMatchPhase === "joiningRoom"
                      ? "ルームへ参加中…"
                      : "Quick Match"}
              </button>
              {["searching", "waitingHost", "joiningRoom"].includes(quickMatchPhase) ? (
                <div role="status" aria-live="polite" className="infoText">
                  <p>検索経過: {Math.floor(quickMatchElapsedMs / 1000)}秒</p>
                  <button type="button" onClick={cancelQuickMatch}>検索をキャンセル</button>
                </div>
              ) : null}
              {quickMatchPhase === "timeout" ? (
                <div role="status" aria-live="polite" className="infoText">
                  <p>対戦相手が見つかりませんでした。</p>
                  <button
                    type="button"
                    onClick={() => {
                      cancelQuickMatch();
                      createRoom();
                    }}
                  >
                    COM対戦へ
                  </button>
                  <button type="button" onClick={cancelQuickMatch}>ホームに戻る</button>
                </div>
              ) : null}
              <button
                className="primaryButton"
                type="button"
                onClick={createRoom}
                disabled={!realtimeConfigured || createPending}
                aria-busy={createPending}
              >
                <Swords size={18} />
                {createPending ? "作成中…" : "ルームを作成"}
              </button>
              <div className="joinRow">
                <input
                  aria-label="ルームコード"
                  placeholder="ルームコード"
                  value={joinCode}
                  maxLength={8}
                  onChange={(event) => {
                    setJoinCode(event.target.value.toUpperCase());
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing &&
                      realtimeConfigured &&
                      joinCode.trim() &&
                      !joinPending
                    ) {
                      joinRoom();
                    }
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    setJoinCode(event.clipboardData.getData("text").trim().toUpperCase().slice(0, 8));
                    setError("");
                  }}
                  suppressHydrationWarning
                />
                <button
                  className="primaryButton joinButton"
                  type="button"
                  onClick={joinRoom}
                  title="ルームに参加"
                  disabled={!realtimeConfigured || !joinCode.trim() || joinPending}
                  aria-busy={joinPending}
                >
                  <Users size={18} />
                  {joinPending ? "参加中…" : "参加"}
                </button>
              </div>
            </div>
          ) : room ? (
            <div className="roomMeta">
              <div>
                <span>ルーム</span>
                <strong>{room.roomCode}</strong>
              </div>
              <button className="iconButton" type="button" onClick={copyRoomCode} title="ルームコードをコピー">
                <Clipboard size={18} />
              </button>
              {room.status !== "waiting" && copyFeedback.message ? (
                <p
                  className={copyFeedback.kind === "error" ? "errorText" : "infoText"}
                  role={copyFeedback.kind === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {copyFeedback.message}
                </p>
              ) : null}
            </div>
          ) : null}

          {!room && homeMode === "solo" && soloSetupView === "daily" ? (
            <SurfaceCard className="dailyChallengePanel">
              <SectionHeading eyebrow="SOLO" title="デイリーチャレンジ" />
              <div className="dailyChallengeHeader">
                <span>残りの挑戦回数</span>
                <small>{Math.max(DAILY_CHALLENGE_MAX_ATTEMPTS - (visibleDailyChallengeRecord?.attempts ?? 0), 0)} / {DAILY_CHALLENGE_MAX_ATTEMPTS}</small>
              </div>
              <p className="dailyChallengePrompt">{dailyChallengePrompt.text}</p>
              <div className="dailyChallengeStats">
                <div>
                  <span>今日の最高 WPM</span>
                  <strong>{visibleDailyChallengeRecord && visibleDailyChallengeRecord.bestWpm > 0 ? visibleDailyChallengeRecord.bestWpm : "—"}</strong>
                </div>
                <div>
                  <span>ベスト正確率</span>
                  <strong>{visibleDailyChallengeRecord && visibleDailyChallengeRecord.bestWpm > 0 ? `${visibleDailyChallengeRecord.bestAccuracy}%` : "—"}</strong>
                </div>
                <div>
                  <span>ベスト時間</span>
                  <strong>{visibleDailyChallengeRecord && visibleDailyChallengeRecord.bestFinishTimeMs > 0 ? `${Math.round(visibleDailyChallengeRecord.bestFinishTimeMs / 1000)}s` : "—"}</strong>
                </div>
                <div>
                  <span>今日のポイント</span>
                  <strong>{visibleDailyChallengeRecord?.points ?? 0}/3</strong>
                </div>
              </div>
              <PracticeStage progressPercent={35} mode="daily" equipment={cosmeticProgress} />
              <button
                className="secondaryButton"
                type="button"
                onClick={startDailyChallenge}
                disabled={!realtimeConfigured || Boolean(practiceSession && !practiceResult) || (visibleDailyChallengeRecord?.attempts ?? 0) >= DAILY_CHALLENGE_MAX_ATTEMPTS}
              >
                <Swords size={18} />
                今日の挑戦を開始
              </button>
            </SurfaceCard>
          ) : null}

          {!room && homeMode === "solo" && soloSetupView === "mistakes" ? (
          <div className="mistakeTrendPanel">
            <div className="mistakeTrendHeader">
              <div>
                <span>ミス傾向</span>
                <small>{mistakeTrendTotal} 件</small>
              </div>
              <small>{mistakeTrendSummary.length > 0 ? "上位 5 件" : "未記録"}</small>
            </div>
            {mistakeTrendSummary.length === 0 ? (
              <p className="mistakeTrendEmpty">まだミスの記録がありません。</p>
            ) : (
              <div className="mistakeTrendList">
                {mistakeTrendSummary.map((item) => {
                  const maxCount = mistakeTrendSummary[0]?.count ?? 1;
                  const barWidth = Math.max((item.count / (maxCount + 1)) * 100, item.count > 0 ? 12 : 0);
                  const dominantWrongInputLabel =
                    item.dominantWrongInput && item.dominantWrongInputCount > 0
                      ? `誤入力 ${formatMistakeTarget(item.dominantWrongInput)} ×${item.dominantWrongInputCount}`
                      : "誤入力なし";

                  return (
                    <div className="mistakeTrendRow" key={item.expectedChar}>
                      <div className="mistakeTrendRowTop">
                        <div className="mistakeTrendLabel">
                          <strong>{formatMistakeTarget(item.expectedChar)}</strong>
                          <small>{dominantWrongInputLabel}</small>
                        </div>
                        <span className="mistakeTrendCount">{item.count}</span>
                      </div>
                      <div className="mistakeTrendBarTrack" aria-hidden="true">
                        <div className="mistakeTrendBarFill" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {!room && homeMode === "solo" && soloSetupView === "practice" ? (
            <div className="difficultySelector">
              <span>練習モード</span>
              <div className="difficultyButtons">
                {(["short", "standard", "long"] as const).map((category) => (
                  <button
                    key={category}
                    className={practiceCategory === category ? "active" : ""}
                    type="button"
                    onClick={() => setPracticeCategory(category)}
                    disabled={!realtimeConfigured || Boolean(practiceSession && !practiceResult)}
                  >
                    {PROMPT_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
              <button
                className="secondaryButton"
                type="button"
                onClick={startPractice}
                disabled={!realtimeConfigured || Boolean(practiceSession && !practiceResult)}
              >
                <Swords size={18} />
                {practiceSession && !practiceResult
                  ? "練習中"
                  : practiceResult
                    ? "もう一度練習"
                    : "練習を開始"}
              </button>
            </div>
          ) : null}

          <div className="panelLinks">
            <Link className="secondaryButton" href="/feedback">
              不具合を報告
            </Link>
          </div>

          {error ? (
            <p className="errorText" role="alert" aria-atomic="true">
              {error}
            </p>
          ) : null}

          {room && room.status !== "waiting" ? (
            <div className="playerList">
              {room.players.map((player) => (
                <div className="playerRow" key={player.id}>
                  <PlayerIdentity
                    nickname={player.nickname}
                    kind={player.isBot ? "com" : player.id === playerId ? "you" : player.id === room.hostPlayerId ? "one" : "two"}
                    slot={player.id === room.hostPlayerId ? "1P" : "2P"}
                    meta={`${getPlayerRoleLabel(player)} / ${getPlayerDeviceLabel(player)}`}
                    compact
                  />
                  <small>{getPlayerConnectionLabel(player)}</small>
                </div>
              ))}
            </div>
          ) : null}

          {room && room.status !== "waiting" ? (
            <p className="infoText">
              端末の組み合わせ: <strong>{getMatchupLabel(room.players)}</strong>
            </p>
          ) : null}

          {room && room.status !== "waiting" ? (
            <div className="difficultySelector">
              <span>対戦ルール</span>
              <div className="matchRuleButtons">
                {(["race", "timeAttack", "hpBattle"] as const).map((rule) => (
                  <button
                    key={rule}
                    className={room.matchRule === rule ? "matchRuleButton active" : "matchRuleButton"}
                    type="button"
                    onClick={() => setMatchRule(rule)}
                    disabled={!currentPlayer?.isHost || (room.status !== "waiting" && room.status !== "finished")}
                  >
                    <span className="matchRuleLabel">{MATCH_RULE_DETAILS[rule].label}</span>
                    <span className="matchRuleDescription">{MATCH_RULE_DETAILS[rule].description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

        </aside>

        <section
          ref={matchSurfaceRef}
          className="matchSurface"
          aria-label="タイピング対戦"
          onClick={(event) => {
            if (!isEditableTarget(event.target)) {
              typingInputRef.current?.focus({ preventScroll: true });
            }
          }}
        >
          {room || practiceSession || practiceResult ? (
            <>
              {room?.status === "countdown" ? (
                <div className="countdown">{Math.max(1, Math.ceil(countdownMs / 1000))}</div>
              ) : null}

              {room?.status === "waiting" ? (
                <LobbyPrep
                  room={room}
                  localPlayerId={playerId}
                  equipment={cosmeticProgress}
                  ownedHeadAccessoryIds={cosmeticProgress.ownedHeadAccessoryIds}
                  ownedHeldItemIds={cosmeticProgress.ownedHeldItemIds}
                  onEquipmentChange={changeEquipment}
                  onCopyRoomCode={copyRoomCode}
                  copyFeedback={copyFeedback}
                  onToggleReady={setReady}
                  onMatchRuleChange={setMatchRule}
                  onPromptCategoryChange={setPromptCategory}
                  onBotDifficultyChange={setBotDifficulty}
                  onReaction={sendReaction}
                  reactionFeedback={reactionFeedback}
                  remoteReaction={settings.reactionsEnabled ? remoteReaction : null}
                  remoteReactionsEnabled={settings.reactionsEnabled}
                />
              ) : activeResult ? (
                <ResultPanel
                  result={activeResult}
                  localPlayerId={playerId}
                  isRoomResult={Boolean(room)}
                  onRetry={room ? rematch : retryPractice}
                  practiceMode={activePracticeMode}
                  canRetry={!room || Boolean(currentPlayer?.connected)}
                  retryDisabledReason={!room ? dailyRetryDisabledReason : ""}
                  retryPending={rematchPending}
                  retryError={rematchError}
                  rematchReady={Boolean(currentPlayer?.ready)}
                  coinReward={latestCoinReward}
                  styleCoinBalance={cosmeticProgress.styleCoins}
                  equipment={cosmeticProgress}
                  livePlayers={room?.players}
                  ownedHeadAccessoryIds={cosmeticProgress.ownedHeadAccessoryIds}
                  ownedHeldItemIds={cosmeticProgress.ownedHeldItemIds}
                  onEquipmentChange={changeEquipment}
                  onPracticeNext={!room && activePracticeMode === "practice" ? startPractice : undefined}
                  onPracticeMenu={!room ? returnToPracticeMenu : undefined}
                  {...(room ? {
                    onOpenSettings: () => setMatchSettingsOpen(true),
                    onReaction: sendReaction,
                    reactionFeedback,
                    remoteReaction: settings.reactionsEnabled ? remoteReaction : null,
                    remoteReactionsEnabled: settings.reactionsEnabled
                  } : {})}
                  {...(room ? { matchRule: activeResult.matchRule ?? room.matchRule } : {})}
                />
              ) : (
                <>
                  {room ? (
                    <BattleStage
                      room={displayRoom ?? room}
                      result={result}
                      localPlayerId={playerId}
                      timeAttackExpired={isTimeAttackExpired}
                      timeAttackRemainingMs={matchTimerMs}
                      matchRemainingMs={matchTimerMs}
                    />
                  ) : practiceSession ? (
                    <PracticeStage
                      progressPercent={activeProgressPercent}
                      mode={activePracticeMode}
                      equipment={cosmeticProgress}
                    />
                  ) : null}

              {activePromptText ? (
                <TypingPrompt
                  displayText={activePromptText}
                  inputText={activeTypingText}
                  progressIndex={activeGuideProgressIndex}
                  inputGuideEnabled={settings.inputGuideEnabled}
                  pendingInput={activeProgress.pendingInput}
                  romajiPlan={activeRomajiTypingPlan}
                />
              ) : (
                <div className="emptyState">
                  <Swords size={42} />
                  <p>{room ? (room.players.length < room.maxPlayers ? "対戦相手を待っています" : "開始できます") : "練習を開始してください"}</p>
                </div>
              )}

              {!result ? (
                <TypingInput
                  inputRef={typingInputRef}
                  deviceKind={activeInputDeviceKind}
                  expectedText={activeTypingText}
                  progressIndex={activeGuideProgressIndex}
                  acceptingInput={acceptingTextInput}
                  loop={isLoopingMatchPlaying && !usesTimeAttackPromptSequence}
                  inputKey={typingInputKey}
                  onTextInput={handleTypedText}
                />
              ) : null}
              {room?.status === "playing" ? (
                <p className="infoText" role="status" aria-live="polite">
                  {getProgressSyncLabel(progressSyncState)}
                </p>
              ) : null}

              <ProgressBlock progressPercent={activeProgressPercent} />

              {room ? (
                <div className="rivalGrid">
                  {(displayRoom?.players ?? room.players).map((player) => (
                    <RivalBar
                      key={player.id}
                      player={player}
                      promptLength={activePrompt ? Array.from(activePrompt.typing.hiragana).length : activeTypingText.length}
                      isSelf={player.id === playerId}
                    />
                  ))}
                </div>
              ) : null}

              <section className={isRoomPlaying ? "statsGrid battleStatsMinimal" : "statsGrid"} aria-label="補助記録">
                {!isRoomPlaying ? <Stat label="WPM" value={isPracticePlaying ? activeWpm : activeResultPlayer?.wpm ?? 0} /> : null}
                {!isRoomPlaying ? (
                  <Stat
                    label="ACC"
                  value={`${
                    isRoomPlaying || isPracticePlaying
                      ? activeAccuracy
                      : activeResultPlayer?.accuracy ?? 100
                  }%`}
                  />
                ) : null}
                <Stat
                  label="MISS"
                  value={
                    isRoomPlaying
                      ? currentPlayer?.mistakes ?? activeProgress.mistakes
                      : isPracticePlaying
                        ? activeProgress.mistakes
                        : activeResultPlayer?.mistakes ?? 0
                  }
                />
                {isRoomPlaying ? <Stat label="ガード" value={currentPlayer?.mistakeGuards ?? 0} /> : null}
                {isTimeAttackPlaying ? <Stat label="残り" value={`${activeTimeAttackRemainingSeconds}s`} /> : null}
                {isTimeAttackPlaying ? <Stat label="完了" value={`${completedTimeAttackPrompts}文`} /> : null}
                {isTimeAttackPlaying ? <Stat label="入力" value={`${activeProgress.correctCharacters}字`} /> : null}
                {((currentPlayer?.maxHp ?? activeResultPlayer?.maxHp) !== undefined) ? (
                  <Stat
                    label="HP"
                    value={`${
                      isRoomPlaying || isPracticePlaying ? currentPlayer?.hp ?? 0 : activeResultPlayer?.hp ?? 0
                    }/${currentPlayer?.maxHp ?? activeResultPlayer?.maxHp ?? 0}`}
                  />
                ) : null}
              </section>

                </>
              )}
            </>
          ) : (
            <div className="emptyState large">
              <Swords size={56} />
              <p>ルームを作成、または参加してください</p>
            </div>
          )}
        </section>
      </section>
      )}

      {settingsOpen ? (
      <PlayerSettingsModal
          settings={settings}
          setSettings={setSettings}
          setNickname={setNickname}
          onClose={() => setSettingsOpen(false)}
          onOpenTutorial={() => {
            setSettingsOpen(false);
            setTutorialStep(0);
          }}
      />
      ) : null}
      {customizationView ? (
        <CosmeticCustomizationModal
          initialView={customizationView}
          progress={cosmeticProgress}
          onPurchase={purchaseSelectedCosmetic}
          onEquip={changeEquipment}
          onClose={() => setCustomizationView(null)}
        />
      ) : null}
      {tutorialStep !== null ? (
        <TutorialOverlay step={tutorialStep} onNext={advanceTutorial} onClose={completeTutorial} />
      ) : null}
      {exitRequest === "room" ? (
        <ExitConfirmationModal
          title="ルームを退出しますか？"
          description={room?.status === "playing" || room?.status === "countdown" ? "試合を退出すると、現在の試合は棄権扱いになります。" : "現在のルームから退出し、ホームへ戻ります。"}
          confirmLabel="退出する"
          onCancel={cancelExitRequest}
          onConfirm={confirmExit}
        />
      ) : exitRequest === "practice" ? (
        <ExitConfirmationModal
          title="練習をやめますか？"
          description="現在の入力途中の記録は保存されず、ひとり用メニューへ戻ります。"
          confirmLabel="練習をやめる"
          onCancel={cancelExitRequest}
          onConfirm={confirmExit}
        />
      ) : null}
      {matchSettingsOpen && room ? (
        <MatchSettingsModal
          room={room}
          onClose={() => setMatchSettingsOpen(false)}
          onMatchRuleChange={setMatchRule}
          onPromptCategoryChange={setPromptCategory}
          onBotDifficultyChange={setBotDifficulty}
          canEdit={Boolean(currentPlayer?.isHost)}
          onResetOfficial={() => {
            setMatchRule("race");
            setPromptCategory("standard");
            setBotDifficulty("normal");
          }}
        />
      ) : null}
    </main>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select, button, a, [role='button'], [contenteditable='true']");
}

function getMatchupLabel(players: RoomState["players"]): string {
  if (players.length === 0) {
    return "";
  }

  const visiblePlayers = players.filter((player) => !player.forfeited).slice(0, 2);

  if (visiblePlayers.length === 0) {
    return "";
  }

  const labels = visiblePlayers.map((player) => {
    if (player.isBot) {
      return DEVICE_KIND_LABELS.desktop;
    }

    return player.deviceKind ? DEVICE_KIND_LABELS[player.deviceKind] : "未設定";
  });

  if (labels.length === 1) {
    return `${labels[0]}で待機中`;
  }

  return `${labels[0] ?? "未設定"}対${labels[1] ?? "未設定"}`;
}
