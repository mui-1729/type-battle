"use client";

import Link from "next/link";
import { Clipboard, Play, Swords, Unplug, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRealtimeSocket,
  getDefaultRealtimeUrl,
  type RealtimeTransport,
  type RealtimeSocket
} from "./_lib/realtime-client";
import {
  calculateAccuracy,
  calculateProgress,
  calculateWpm,
  getDailyChallengeInfo,
  createRoomCode,
  normalizeNickname,
  pickDailyChallengePrompt,
  validateNickname
} from "@type-battle/shared";
import type {
  DeviceKind,
  MatchRule,
  MatchResult,
  PlayerResult,
  Prompt,
  PromptCategory,
  RoomState,
  TypingProgress
} from "@type-battle/shared";
import { GameHeader } from "./_components/game-header";
import { HomeModeMenu } from "./_components/home-mode-menu";
import { BattleStage } from "./_components/battle-stage";
import { PlayerSettingsModal } from "./_components/player-settings-modal";
import { ProgressBlock } from "./_components/progress-block";
import { ResultPanel } from "./_components/result-panel";
import { RivalBar } from "./_components/rival-bar";
import { Stat } from "./_components/stat";
import { TypingInput } from "./_components/typing-input";
import { StatusPill } from "./_components/status-pill";
import { TypingPrompt } from "./_components/typing-prompt";
import { PlayerIdentity } from "./_components/player-identity";
import { Button, SectionHeading, SurfaceCard } from "./_components/ui";
import {
  createEmptyProgress,
  advanceProgressWithMistakes,
  type MistakeSample,
  type ProgressState
} from "./_lib/typing-progress";
import {
  advanceRomajiProgressWithMistakes,
  buildRomajiTypingPlan
} from "./_lib/romaji-typing";
import {
  advanceLoopingRomajiProgressWithMistakes,
  getCanonicalProgressIndex,
  getRomajiProgressIndexForCanonicalProgress
} from "./_lib/looping-typing";
import { detectDeviceKind } from "./_lib/device-kind";
import { reconcileRoomProgress } from "./_lib/reconcile-room-progress";
import { getProgressSyncLabel, getProgressSyncState } from "./_lib/progress-sync";
import {
  getStoredRoomJoinFailureAction,
  getStoredRoomRejoinDelayMs
} from "./_lib/room-reconnect";
import {
  BOT_DIFFICULTY_LABELS,
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
  getVisibleDailyChallengeRecord,
  loadDailyChallengeRecord,
  recordDailyChallengeAttempt,
  type DailyChallengeRecord
} from "../lib/daily-challenge";
import {
  formatMistakeTarget,
  loadMistakeTrendRecord,
  persistMistakeTrendRecord,
  summarizeMistakeTrendRecord,
  updateMistakeTrendRecord,
  type MistakeTrendRecord
} from "../lib/mistake-trends";

type ClientSocket = RealtimeSocket;

type PracticeSession = {
  practiceId: string;
  prompt: Prompt;
  startedAt: number;
  category: PromptCategory;
  deviceKind: DeviceKind;
  mode: "practice" | "daily";
  challengeKey?: string;
};

type StoredRoomRecoveryState = {
  status: "idle" | "reconnecting" | "failed";
  message: string;
};

type HomeMode = "battle" | "solo";

const REALTIME_TRANSPORT: RealtimeTransport = "cloudflare";
const CLOUDFLARE_REALTIME_URL = process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL?.trim() ?? "";
const REALTIME_UNAVAILABLE_MESSAGE = "Realtime transport is not configured.";
const ROOM_CODE_KEY = "type-battle:room-code";

export default function HomePage() {
  const socketRef = useRef<ClientSocket | null>(null);
  const [socketMode, setSocketMode] = useState<"practice" | "room" | null>(null);
  const settingsRef = useRef(DEFAULT_PLAYER_SETTINGS);
  const nicknameRef = useRef(DEFAULT_PLAYER_SETTINGS.nickname);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const countdownSecondRef = useRef<number | null>(null);
  const typingInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_PLAYER_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [homeMode, setHomeMode] = useState<HomeMode | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [practiceResult, setPracticeResult] = useState<MatchResult | null>(null);
  const [practiceCategory, setPracticeCategory] = useState<PromptCategory>("standard");
  const [dailyChallengeRecord, setDailyChallengeRecord] = useState<DailyChallengeRecord | null>(null);
  const [mistakeTrendRecord, setMistakeTrendRecord] = useState<MistakeTrendRecord | null>(null);
  const [error, setError] = useState("");
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
  const [practiceProgress, setPracticeProgress] = useState<ProgressState>(createEmptyProgress());
  const [localRealtimeUrl, setLocalRealtimeUrl] = useState("");
  const localProgressRef = useRef<ProgressState>(createEmptyProgress());
  const practiceProgressRef = useRef<ProgressState>(createEmptyProgress());
  const inputSequenceRef = useRef(0);
  const roomRef = useRef<RoomState | null>(null);
  const guestSessionRef = useRef<GuestSession | null>(null);
  const socketModeRef = useRef<"practice" | "room" | null>(null);
  const storedRoomCodeRef = useRef<string | null>(null);
  const storedRoomJoinInFlightRef = useRef(false);
  const storedRoomJoinAttemptsRef = useRef(0);
  const storedRoomRetryTimerRef = useRef<number | null>(null);
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
  const activePracticePlayer = practiceResult?.players[0] ?? null;
  const activeResult = result ?? practiceResult;
  const activePrompt = room?.prompt ?? practiceSession?.prompt ?? activeResult?.prompt ?? null;
  const activePromptText = activePrompt?.text ?? "";
  const activeInputDeviceKind = room ? currentPlayer?.deviceKind ?? "desktop" : practiceSession?.deviceKind ?? "desktop";
  const dailyChallengeInfo = useMemo(() => getDailyChallengeInfo(dailyChallengeNow), [dailyChallengeNow]);
  const dailyChallengePrompt = useMemo(() => pickDailyChallengePrompt(dailyChallengeNow), [dailyChallengeNow]);
  const visibleDailyChallengeRecord = getVisibleDailyChallengeRecord(
    dailyChallengeRecord,
    dailyChallengeInfo.challengeKey
  );
  const activePracticeMode = practiceSession?.mode ?? "practice";
  const mistakeTrendSummary = useMemo(() => summarizeMistakeTrendRecord(mistakeTrendRecord), [mistakeTrendRecord]);
  const mistakeTrendTotal = useMemo(
    () => (mistakeTrendRecord?.items ?? []).reduce((total, item) => total + item.count, 0),
    [mistakeTrendRecord]
  );
  const activeRomajiTypingPlan =
    activePrompt && activeInputDeviceKind !== "mobile" ? buildRomajiTypingPlan(activePrompt.typing.hiragana) : null;
  const activeTypingText = activePrompt
    ? activeInputDeviceKind === "mobile"
      ? activePrompt.typing.hiragana
      : activeRomajiTypingPlan?.guide ?? activePrompt.typing.romaji
    : "";
  const isRoomPlaying = room?.status === "playing";
  const isPracticePlaying = Boolean(practiceSession && !practiceResult && !room);
  const activeProgress = room ? localProgress : practiceProgress;
  const isTimeAttackPlaying = Boolean(isRoomPlaying && room?.matchRule === "timeAttack");
  const activeGuideProgressIndex =
    isTimeAttackPlaying && activeTypingText.length > 0
      ? activeProgress.progressIndex % activeTypingText.length
      : activeProgress.progressIndex;
  const activeCanonicalProgressIndex =
    activeInputDeviceKind === "desktop" && activeRomajiTypingPlan
      ? getCanonicalProgressIndex(activeRomajiTypingPlan, activeProgress.progressIndex)
      : activeProgress.progressIndex;
  const activeProgressPercent = calculateProgress(activeGuideProgressIndex, activeTypingText.length);
  const activeElapsedMs =
    isRoomPlaying && room?.serverStartAt
      ? Date.now() - room.serverStartAt
      : isPracticePlaying && practiceSession
        ? Date.now() - practiceSession.startedAt
        : 0;
  const activeWpm = calculateWpm(activeCanonicalProgressIndex, activeElapsedMs);
  const activeAccuracy = calculateAccuracy(activeProgress.correctCharacters, activeProgress.totalTypedCharacters);
  const activeResultPlayer =
    room?.players.find((player) => player.id === playerId) ?? activePracticePlayer ?? null;
  const isTimeAttackExpired = Boolean(
    isTimeAttackPlaying && room?.matchEndsAt && matchTimerMs <= 0 && Date.now() >= room.matchEndsAt
  );
  const activeTimeAttackRemainingSeconds = Math.max(matchTimerMs / 1000, 0).toFixed(1);
  const canStart =
    room?.status === "waiting" &&
    currentPlayer?.isHost &&
    room.players.length >= 1 &&
    room.players.every((player) => player.connected || player.isBot) &&
    (room.players.filter((player) => !player.isBot).length <= 1 ||
      room.players.filter((player) => !player.isBot).every((player) => player.ready));
  const acceptingTextInput =
    (isRoomPlaying && connected && !result && !isTimeAttackExpired) || isPracticePlaying;
  const progressSyncState = room
    ? getProgressSyncState({
        connected,
        localTypedCharacters: activeProgress.totalTypedCharacters,
        serverTypedCharacters: currentPlayer?.totalTypedCharacters ?? 0,
        lastSentAt: lastProgressSentAt,
        now: syncClock
      })
    : "synced";
  const displayRoom = useMemo(() => {
    if (!room || !currentPlayer) {
      return room;
    }

    return {
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
    };
  }, [activeCanonicalProgressIndex, activeProgress, currentPlayer, room]);
  const typingInputKey =
    String(room?.prompt?.id ?? practiceSession?.practiceId ?? "idle") + ":" + String(activePrompt?.id ?? "none");

  const setPromptCategory = useCallback(
    (category: "short" | "standard" | "long") => {
      if (!room || !socketRef.current || !currentPlayer?.isHost) {
        return;
      }

      socketRef.current.emit("room:setPromptCategory", { roomCode: room.roomCode, category }, (response) => {
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const setBotDifficulty = useCallback(
    (difficulty: "easy" | "normal" | "hard") => {
      if (!room || !socketRef.current || !currentPlayer?.isHost) {
        return;
      }

      socketRef.current.emit("room:setBotDifficulty", { roomCode: room.roomCode, difficulty }, (response) => {
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const setMatchRule = useCallback(
    (rule: MatchRule) => {
      if (!room || !socketRef.current || !currentPlayer?.isHost) {
        return;
      }

      socketRef.current.emit("room:setMatchRule", { roomCode: room.roomCode, rule }, (response) => {
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
    inputSequenceRef.current = 0;
    setResult(null);
    setLastProgressSentAt(null);
  }, []);

  const prepareTypingInput = useCallback(() => {
    typingInputRef.current?.focus({ preventScroll: true });
  }, []);

  const updateGuestSession = useCallback(() => {
    setGuestSession((current) => {
      if (!current) {
        return current;
      }

      return touchGuestSession(current);
    });
  }, []);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    guestSessionRef.current = guestSession;
  }, [guestSession]);

  useEffect(() => {
    socketModeRef.current = socketMode;
  }, [socketMode]);

  const attachSocketHandlers = useCallback((socket: ClientSocket) => {
    socket.on("connect", () => {
      setConnected(true);
      const currentRoom = roomRef.current;
      const currentSession = guestSessionRef.current;

      if (socketModeRef.current !== "room") {
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
          if (!response.ok) {
            setError(response.error);
            return;
          }

          resetTyping();
          setPlayerId(response.data.playerId);
          setRoom(response.data.room);
          setResult(response.data.room.result ?? null);
        }
      );
    });
    socket.on("disconnect", () => {
      setConnected(false);
      if (socketModeRef.current === "room") {
        setStoredRoomRecovery({
          status: "reconnecting",
          message: "接続が切れました。ルームへの再接続を待っています。"
        });
      }
    });
    socket.on("room:state", (nextRoom) => {
      setRoom(nextRoom);
      setResult(nextRoom.result ?? null);
    });
    socket.on("player:progress", (nextRoom) => {
      setRoom(nextRoom);
      setResult(nextRoom.result ?? null);
    });
    socket.on("match:countdown", ({ room: nextRoom, serverStartAt }) => {
      resetTyping();
      setRoom(nextRoom);
      setResult(nextRoom.result ?? null);
      setCountdownMs(Math.max(serverStartAt - Date.now(), 0));
    });
    socket.on("match:started", (nextRoom) => {
      resetTyping();
      setCountdownMs(0);
      setRoom(nextRoom);
      setResult(nextRoom.result ?? null);
    });
    socket.on("match:result", (nextResult) => {
      setResult(nextResult);
      setCountdownMs(0);
      setRoom((current) =>
        current && current.roomCode === nextResult.roomCode
          ? {
              ...current,
              status: "finished",
              result: nextResult
            }
          : current
      );
    });
    socket.on("match:error", ({ message }) => {
      setError(message);
      setRematchError(message);
      setRematchPending(false);
    });
  }, [resetTyping]);

  const connectSocket = useCallback(
    (url: string, kind: "practice" | "room") => {
    socketRef.current?.disconnect();
    const socket = createRealtimeSocket({ transport: REALTIME_TRANSPORT, url });
    socketRef.current = socket;
    socketModeRef.current = kind;
    setSocketMode(kind);
    attachSocketHandlers(socket);
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
      connectPracticeSocket();
    },
    [clearStoredRoomRetryTimer, connectPracticeSocket]
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
          storedRoomJoinInFlightRef.current = false;

          if (response.ok) {
            storedRoomJoinAttemptsRef.current = 0;
            setStoredRoomRecovery({ status: "idle", message: "" });
            setError("");
            setPlayerId(response.data.playerId);
            setRoom(response.data.room);
            setResult(response.data.room.result ?? null);
            updateGuestSession();
            clearPracticeState();
            resetTyping();
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

    if (socket && socketModeRef.current === "room") {
      attemptStoredRoomJoinRef.current(socket);
      return;
    }

    connectRoomSocket(storedRoomCode);
  }, [connectRoomSocket]);

  const startPractice = useCallback(() => {
    const socket = socketRef.current;
    const currentNickname = nicknameInputRef.current?.value ?? nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!realtimeConfigured || !socket || socketMode !== "practice" || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    prepareTypingInput();
    setHomeMode(null);
    void primeSoundPlayback();
    socket.emit(
      "practice:start",
      { nickname: normalizeNickname(currentNickname), category: practiceCategory },
      (response) => {
        if (!response.ok) {
          setError(response.error);
          return;
        }

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
  }, [guestId, practiceCategory, prepareTypingInput, realtimeConfigured, resetTyping, socketMode]);

  const startDailyChallenge = useCallback(() => {
    const socket = socketRef.current;
    const currentNickname = nicknameInputRef.current?.value ?? nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!realtimeConfigured || !socket || socketMode !== "practice" || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    prepareTypingInput();
    setHomeMode(null);
    void primeSoundPlayback();
    socket.emit("practice:dailyStart", { nickname: normalizeNickname(currentNickname) }, (response) => {
      if (!response.ok) {
        setError(response.error);
        return;
      }

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
      resetTyping();
    });
  }, [guestId, prepareTypingInput, realtimeConfigured, resetTyping, socketMode]);

  const finishPractice = useCallback(
    (finalProgress: ProgressState) => {
      if (!practiceSession) {
        return;
      }

      const finishTimeMs = Date.now() - practiceSession.startedAt;
      const canonicalProgressIndex =
        practiceSession.deviceKind === "mobile"
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
        maxStreak: finalProgress.maxStreak,
        currentStreak: finalProgress.currentStreak,
        wpm: calculateWpm(canonicalProgressIndex, finishTimeMs),
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
            finishTimeMs,
            completedAt: player.finishedAt ?? Date.now()
          },
          dailyChallengeInfo.challengeKey
        );
        setDailyChallengeRecord(visibleRecord);
      }
    },
    [dailyChallengeInfo.challengeKey, practiceSession]
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

    if (!realtimeConfigured) {
      setConnected(false);
      return;
    }

    const storedRoomCode = window.localStorage.getItem(ROOM_CODE_KEY);
    const guestIdFromSession = session?.guestId ?? "";
    const sessionIdFromSession = session?.sessionId ?? "";

    if (!storedRoomCode || !guestIdFromSession || !sessionIdFromSession) {
      storedRoomCodeRef.current = null;
      connectPracticeSocket();
    } else {
      storedRoomCodeRef.current = storedRoomCode;
      setStoredRoomRecovery({ status: "reconnecting", message: "保存済みルームへ再接続しています…" });
      connectRoomSocket(storedRoomCode);
    }

    return () => {
      clearStoredRoomRetryTimer();
      socketRef.current?.disconnect();
      socketRef.current = null;
      socketModeRef.current = null;
      setSocketMode(null);
    };
  }, [clearStoredRoomRetryTimer, connectPracticeSocket, connectRoomSocket, realtimeConfigured]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    persistPlayerSettings(window.localStorage, settings);
    applyPlayerSettingsToDocument(document, settings);
    settingsRef.current = settings;
  }, [settings, settingsHydrated]);

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

    setLocalProgress((previous) => reconcileRoomProgress(previous, currentPlayer));
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

    if (!room || room.status !== "playing" || room.matchRule !== "timeAttack" || !matchEndsAt) {
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
    if (!acceptingTextInput) {
      return;
    }

    const input = typingInputRef.current;
    if (!input) {
      return;
    }

    const usesStackedLayout = window.matchMedia("(max-width: 1080px)").matches;
    input.focus({ preventScroll: true });

    if (usesStackedLayout) {
      const matchSurface = input.closest(".matchSurface");
      const focusRegion = matchSurface?.querySelector(".battleStage, .promptBox");
      focusRegion?.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    }
  }, [acceptingTextInput, activeTypingText]);

  const emitProgress = useCallback(
    (input: string, finish: boolean) => {
      const socket = socketRef.current;

      if (!socket || !room) {
        return;
      }

      const payload: TypingProgress = {
        roomCode: room.roomCode,
        input,
        sequence: inputSequenceRef.current + 1
      };
      inputSequenceRef.current = payload.sequence;
      setLastProgressSentAt(Date.now());
      setSyncClock(Date.now());

      if (finish) {
        socket.emit("typing:finish", payload);
        return;
      }

      socket.emit("typing:progress", payload);
    },
    [room]
  );

  const updateTypingProgress = useCallback(
    (previous: ProgressState, typedText: string) => {
      const canonicalText = activePrompt?.typing.hiragana ?? activeTypingText;

      if (activeInputDeviceKind === "mobile") {
        return advanceProgressWithMistakes(previous, canonicalText, typedText, isTimeAttackPlaying);
      }

      if (activeRomajiTypingPlan && containsKanaInput(typedText)) {
        const canonicalPrevious = {
          ...previous,
          progressIndex: getCanonicalProgressIndex(activeRomajiTypingPlan, previous.progressIndex)
        };
        const next = advanceProgressWithMistakes(
          canonicalPrevious,
          canonicalText,
          typedText,
          isTimeAttackPlaying
        );

        return {
          ...next,
          progress: {
            ...next.progress,
            progressIndex: getRomajiProgressIndexForCanonicalProgress(
              activeRomajiTypingPlan,
              next.progress.progressIndex
            )
          }
        };
      }

      if (activeRomajiTypingPlan) {
        return isTimeAttackPlaying
          ? advanceLoopingRomajiProgressWithMistakes(previous, activeRomajiTypingPlan, typedText)
          : advanceRomajiProgressWithMistakes(previous, activeRomajiTypingPlan, typedText);
      }

      return advanceProgressWithMistakes(previous, activeTypingText, typedText, isTimeAttackPlaying);
    },
    [activeInputDeviceKind, activePrompt, activeRomajiTypingPlan, activeTypingText, isTimeAttackPlaying]
  );

  const handleTypedText = useCallback(
    (typedText: string) => {
      if (!typedText) {
        return;
      }

      if (room?.status === "playing" && room?.prompt) {
        const previous = localProgressRef.current;
        const next = updateTypingProgress(previous, typedText);
        const correct = next.progress.correctCharacters > previous.correctCharacters;

        setLocalProgress(next.progress);
        localProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);
        void playTypingSound({ enabled: settingsRef.current.soundEnabled }, correct);
        emitProgress(
          typedText,
          !isTimeAttackPlaying && next.progress.progressIndex >= activeTypingText.length
        );
        return;
      }

      if (practiceSession && !practiceResult && !room) {
        const previous = practiceProgressRef.current;
        const next = updateTypingProgress(previous, typedText);
        const correct = next.progress.correctCharacters > previous.correctCharacters;

        setPracticeProgress(next.progress);
        practiceProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);

        if (next.progress.progressIndex >= activeTypingText.length) {
          finishPractice(next.progress);
        }

        void playTypingSound({ enabled: settingsRef.current.soundEnabled }, correct);
      }
    },
    [
      activeTypingText,
      emitProgress,
      isTimeAttackPlaying,
      finishPractice,
      practiceResult,
      practiceSession,
      recordMistakeSamples,
      updateTypingProgress,
      room
    ]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const practiceActive = Boolean(practiceSession && !practiceResult && !room);

      if (room?.status !== "playing" && !practiceActive) {
        return;
      }

      if (!acceptingTextInput) {
        return;
      }

      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      event.preventDefault();
      const typedKey = event.key.toLowerCase();

      if (room?.status === "playing" && room?.prompt) {
        const previous = localProgressRef.current;
        const next = updateTypingProgress(previous, typedKey);
        const correct = next.progress.correctCharacters > previous.correctCharacters;
        const soundOptions = settingsRef.current;

        setLocalProgress(next.progress);
        localProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);
        void playTypingSound({ enabled: soundOptions.soundEnabled }, correct);
        emitProgress(
          typedKey,
          !isTimeAttackPlaying && next.progress.progressIndex >= activeTypingText.length
        );
        return;
      }

      if (practiceActive && practiceSession) {
        const previous = practiceProgressRef.current;
        const next = updateTypingProgress(previous, typedKey);
        const correct = next.progress.correctCharacters > previous.correctCharacters;
        const soundOptions = settingsRef.current;

        setPracticeProgress(next.progress);
        practiceProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);

        if (next.progress.progressIndex >= activeTypingText.length) {
          finishPractice(next.progress);
        }

        void playTypingSound({ enabled: soundOptions.soundEnabled }, correct);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeInputDeviceKind,
    activeTypingText,
    acceptingTextInput,
    emitProgress,
    finishPractice,
    isTimeAttackPlaying,
    practiceResult,
    practiceSession,
    recordMistakeSamples,
    updateTypingProgress,
    room
  ]);

  const createRoom = () => {
    const currentNickname = nicknameRef.current;
    const roomCode = createRoomCode();
    const validationError = validateNickname(currentNickname);

    if (!realtimeConfigured || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    void primeSoundPlayback();
    const socket = connectRoomSocket(roomCode);
    setHomeMode(null);
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
        if (!response.ok) {
          setError(response.error);
          connectPracticeSocket();
          return;
        }

        setError("");
        setPlayerId(response.data.playerId);
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
        if (!response.ok) {
          setError(response.error);
          connectPracticeSocket();
          return;
        }

        setError("");
        setPlayerId(response.data.playerId);
        setRoom(response.data.room);
        window.localStorage.setItem(ROOM_CODE_KEY, response.data.room.roomCode);
        updateGuestSession();
        clearPracticeState();
        resetTyping();
      }
    );
  };

  const leaveRoom = () => {
    const socket = socketRef.current;

    if (socket && room) {
      socket.emit("room:leave", { roomCode: room.roomCode });
    }
    setHomeMode(null);

    connectPracticeSocket();
    setRoom(null);
    setResult(null);
    setPlayerId("");
    window.localStorage.removeItem(ROOM_CODE_KEY);
    clearPracticeState();
    resetTyping();
  };

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

  const startMatch = () => {
    if (!realtimeConfigured || !socketRef.current || !room) {
      return;
    }

    prepareTypingInput();
    void primeSoundPlayback();
    socketRef.current.emit("match:start", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setError(response.error);
      }
    });
  };

  const rematch = () => {
    if (!realtimeConfigured || !socketRef.current || !room) {
      return;
    }

    prepareTypingInput();
    setRematchPending(true);
    setRematchError("");
    void primeSoundPlayback();
    socketRef.current.emit("match:rematch", { roomCode: room.roomCode }, (response) => {
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

  const retryPractice = activePracticeMode === "daily" ? startDailyChallenge : startPractice;

  const copyRoomCode = async () => {
    if (!room) {
      return;
    }

    await navigator.clipboard.writeText(room.roomCode);
  };
  const isRecoveringStoredRoom = storedRoomRecovery.status !== "idle";
  const showHomeModeMenu = !room && !practiceSession && !practiceResult && homeMode === null && !isRecoveringStoredRoom;
  const showModeSetup = !room && !practiceSession && !practiceResult && homeMode !== null;
  const hasNickname = nickname.trim().length > 0;

  return (
    <main className="appShell">
      <GameHeader
        connected={connected}
        realtimeConfigured={realtimeConfigured}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {showHomeModeMenu ? (
        <HomeModeMenu
          onBattle={() => setHomeMode("battle")}
          onSolo={() => setHomeMode("solo")}
        />
      ) : (
      <section className={showModeSetup ? "workspace modeWorkspace" : "workspace"}>
        <aside className="sidePanel" aria-label="ルーム操作">
          {showModeSetup ? (
            <button className="modeBackButton" type="button" onClick={() => setHomeMode(null)}>
              ← モードを選び直す
            </button>
          ) : null}
          {!realtimeConfigured ? (
            <p className="infoText">
              Realtime の接続先が未設定のため、今は Vercel への web deploy はできますが対戦は使えません。
            </p>
          ) : null}

          {storedRoomRecovery.status !== "idle" ? (
            <div className="infoText" role="status">
              <p>{storedRoomRecovery.message}</p>
              {storedRoomRecovery.status === "failed" ? (
                <button className="secondaryButton" type="button" onClick={retryStoredRoomJoin}>
                  再接続を再試行
                </button>
              ) : null}
            </div>
          ) : null}

          {showModeSetup && !hasNickname ? (
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

          {!room && homeMode === "battle" ? (
            <div className="roomActions">
              <button className="primaryButton" type="button" onClick={createRoom} disabled={!realtimeConfigured}>
                <Swords size={18} />
                ルームを作成
              </button>
              <div className="joinRow">
                <input
                  aria-label="ルームコード"
                  placeholder="ルームコード"
                  value={joinCode}
                  maxLength={8}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  suppressHydrationWarning
                />
                <button
                  className="iconButton"
                  type="button"
                  onClick={joinRoom}
                  title="ルームに参加"
                  disabled={!realtimeConfigured}
                >
                  <Users size={18} />
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
              <button className="iconButton" type="button" onClick={leaveRoom} title="ルームを退出">
                <Unplug size={18} />
              </button>
            </div>
          ) : null}

          {!room && homeMode === "solo" ? (
            <SurfaceCard className="dailyChallengePanel">
              <SectionHeading eyebrow="SOLO" title="Daily challenge" />
              <div className="dailyChallengeHeader">
                <span>デイリーチャレンジ</span>
                <small>{dailyChallengeInfo.challengeKey}</small>
              </div>
              <p className="dailyChallengePrompt">{dailyChallengePrompt.text}</p>
              <div className="dailyChallengeStats">
                <div>
                  <span>今日の最高 WPM</span>
                  <strong>{visibleDailyChallengeRecord ? visibleDailyChallengeRecord.bestWpm : "—"}</strong>
                </div>
                <div>
                  <span>挑戦回数</span>
                  <strong>{visibleDailyChallengeRecord?.attempts ?? 0}</strong>
                </div>
                <div>
                  <span>ベスト正確率</span>
                  <strong>{visibleDailyChallengeRecord ? `${visibleDailyChallengeRecord.bestAccuracy}%` : "—"}</strong>
                </div>
                <div>
                  <span>ベスト時間</span>
                  <strong>{visibleDailyChallengeRecord ? `${Math.round(visibleDailyChallengeRecord.bestFinishTimeMs / 1000)}s` : "—"}</strong>
                </div>
              </div>
              <button
                className="secondaryButton"
                type="button"
                onClick={startDailyChallenge}
                disabled={!realtimeConfigured || Boolean(practiceSession && !practiceResult)}
              >
                <Swords size={18} />
                今日の挑戦を開始
              </button>
            </SurfaceCard>
          ) : null}

          {!room && homeMode === "solo" ? (
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

          {!room && homeMode === "solo" ? (
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

          {error ? <p className="errorText">{error}</p> : null}

          {room ? (
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

          {room ? (
            <p className="infoText">
              端末の組み合わせ: <strong>{getMatchupLabel(room.players)}</strong>
            </p>
          ) : null}

          {room ? (
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

          {room?.status === "waiting" && room.players.length < room.maxPlayers ? (
            <div className="difficultySelector">
              <span>課題カテゴリ</span>
              <div className="difficultyButtons">
                {(["short", "standard", "long"] as const).map((c) => (
                  <button
                    key={c}
                    className={room.promptCategory === c ? "active" : ""}
                    type="button"
                    onClick={() => setPromptCategory(c)}
                    disabled={!currentPlayer?.isHost}
                  >
                    {PROMPT_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {room?.status === "waiting" && room.players.length < room.maxPlayers ? (
            <div className="difficultySelector">
              <span>COM の強さ</span>
              <div className="difficultyButtons">
                {(["easy", "normal", "hard"] as const).map((difficulty) => (
                  <button
                    key={difficulty}
                    className={room.botDifficulty === difficulty ? "active" : ""}
                    type="button"
                    onClick={() => setBotDifficulty(difficulty)}
                    disabled={!currentPlayer?.isHost}
                  >
                    {BOT_DIFFICULTY_LABELS[difficulty]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {room?.status === "waiting" ? (
            <div className="lobbyActions">
              <Button type="button" onClick={setReady} aria-pressed={Boolean(currentPlayer?.ready)}>
                {currentPlayer?.ready ? "準備完了" : "準備する"}
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={startMatch}
                disabled={!realtimeConfigured || !canStart}
              >
                <Play size={18} />
                {room.players.length < room.maxPlayers ? "COM と開始" : "開始"}
              </Button>
            </div>
          ) : null}
        </aside>

        <section
          className="matchSurface"
          aria-label="タイピング対戦"
          onPointerDown={(event) => {
            if (!isEditableTarget(event.target)) {
              prepareTypingInput();
            }
          }}
        >
          {room || practiceSession || practiceResult ? (
            <>
              <div className="matchHeader">
                <StatusPill
                  status={
                    room ? (result ? "result" : room.status) : practiceResult ? "result" : "playing"
                  }
                />
              </div>

              {room?.status === "countdown" ? (
                <div className="countdown">{Math.max(1, Math.ceil(countdownMs / 1000))}</div>
              ) : null}

              {room ? (
                <BattleStage
                  room={displayRoom ?? room}
                  result={result}
                  localPlayerId={playerId}
                  timeAttackExpired={isTimeAttackExpired}
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

              <TypingInput
                inputRef={typingInputRef}
                deviceKind={activeInputDeviceKind}
                expectedText={activeTypingText}
                progressIndex={activeGuideProgressIndex}
                acceptingInput={acceptingTextInput}
                loop={isTimeAttackPlaying}
                inputKey={typingInputKey}
                onTextInput={handleTypedText}
              />
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

              <section className="statsGrid" aria-label="補助記録">
                <Stat
                  label="WPM"
                  value={isRoomPlaying || isPracticePlaying ? activeWpm : activeResultPlayer?.wpm ?? 0}
                />
                <Stat
                  label="ACC"
                  value={`${
                    isRoomPlaying || isPracticePlaying
                      ? activeAccuracy
                      : activeResultPlayer?.accuracy ?? 100
                  }%`}
                />
                <Stat
                  label="MISS"
                  value={
                    isRoomPlaying || isPracticePlaying
                      ? activeProgress.mistakes
                      : activeResultPlayer?.mistakes ?? 0
                  }
                />
                {isTimeAttackPlaying ? <Stat label="残り" value={`${activeTimeAttackRemainingSeconds}s`} /> : null}
                {((currentPlayer?.maxHp ?? activeResultPlayer?.maxHp) !== undefined) ? (
                  <Stat
                    label="HP"
                    value={`${
                      isRoomPlaying || isPracticePlaying ? currentPlayer?.hp ?? 0 : activeResultPlayer?.hp ?? 0
                    }/${currentPlayer?.maxHp ?? activeResultPlayer?.maxHp ?? 0}`}
                  />
                ) : null}
              </section>

              {activeResult ? (
                <ResultPanel
                  result={activeResult}
                  localPlayerId={playerId}
                  isRoomResult={Boolean(room)}
                  onRetry={room ? rematch : retryPractice}
                  practiceMode={activePracticeMode}
                  canRetry={!room || Boolean(currentPlayer?.isHost)}
                  retryPending={rematchPending}
                  retryError={rematchError}
                  {...(room ? { matchRule: activeResult.matchRule ?? room.matchRule } : {})}
                />
              ) : null}
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
        />
      ) : null}
    </main>
  );
}

function containsKanaInput(value: string): boolean {
  return /[\u3040-\u30ff\uff66-\uff9f]/u.test(value);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']");
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
