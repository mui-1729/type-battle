"use client";

import Link from "next/link";
import { Clipboard, Play, Swords, Unplug, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRealtimeSocket,
  getDefaultRealtimeUrl,
  resolveRealtimeTransport,
  type RealtimeSocket
} from "./_lib/realtime-client";
import {
  calculateAccuracy,
  calculateProgress,
  calculateWpm,
  getDailyChallengeInfo,
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
import { PlayerSettingsModal } from "./_components/player-settings-modal";
import { ProgressBlock } from "./_components/progress-block";
import { ResultPanel } from "./_components/result-panel";
import { RivalBar } from "./_components/rival-bar";
import { Stat } from "./_components/stat";
import { TypingInput } from "./_components/typing-input";
import { StatusPill } from "./_components/status-pill";
import { TypingPrompt } from "./_components/typing-prompt";
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
import { detectDeviceKind } from "./_lib/device-kind";
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
  loadDailyChallengeRecord,
  persistDailyChallengeRecord,
  updateDailyChallengeRecord,
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

const REALTIME_TRANSPORT = resolveRealtimeTransport({
  requestedTransport: process.env.NEXT_PUBLIC_REALTIME_TRANSPORT,
  nodeEnv: process.env.NODE_ENV
});
const SOCKET_IO_REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim() ?? "";
const CLOUDFLARE_REALTIME_URL = process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL?.trim() ?? "";
const REALTIME_UNAVAILABLE_MESSAGE = "Realtime transport is not configured.";
const ROOM_CODE_KEY = "type-battle:room-code";

export default function HomePage() {
  const socketRef = useRef<ClientSocket | null>(null);
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
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [practiceResult, setPracticeResult] = useState<MatchResult | null>(null);
  const [practiceCategory, setPracticeCategory] = useState<PromptCategory>("standard");
  const [dailyChallengeRecord, setDailyChallengeRecord] = useState<DailyChallengeRecord | null>(null);
  const [mistakeTrendRecord, setMistakeTrendRecord] = useState<MistakeTrendRecord | null>(null);
  const [error, setError] = useState("");
  const [countdownMs, setCountdownMs] = useState(0);
  const [matchTimerMs, setMatchTimerMs] = useState(0);
  const [resumeAttempted, setResumeAttempted] = useState(false);
  const [localProgress, setLocalProgress] = useState<ProgressState>(createEmptyProgress());
  const [practiceProgress, setPracticeProgress] = useState<ProgressState>(createEmptyProgress());
  const [localRealtimeUrl, setLocalRealtimeUrl] = useState("");
  const guestSessionRef = useRef<GuestSession | null>(null);
  const settingsHydratedRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  const localProgressRef = useRef<ProgressState>(createEmptyProgress());
  const practiceProgressRef = useRef<ProgressState>(createEmptyProgress());
  const realtimeUrl = (REALTIME_TRANSPORT === "cloudflare" ? CLOUDFLARE_REALTIME_URL : SOCKET_IO_REALTIME_URL) || localRealtimeUrl;
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
  const dailyChallengeDate = useMemo(() => new Date(), []);
  const activePracticePlayer = practiceResult?.players[0] ?? null;
  const activeResult = result ?? practiceResult;
  const activePrompt = room?.prompt ?? practiceSession?.prompt ?? activeResult?.prompt ?? null;
  const activePromptText = activePrompt?.text ?? "";
  const activeInputDeviceKind = room ? currentPlayer?.deviceKind ?? "desktop" : practiceSession?.deviceKind ?? "desktop";
  const dailyChallengeInfo = useMemo(() => getDailyChallengeInfo(dailyChallengeDate), [dailyChallengeDate]);
  const dailyChallengePrompt = useMemo(() => pickDailyChallengePrompt(dailyChallengeDate), [dailyChallengeDate]);
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
  const activeProgressPercent = calculateProgress(activeProgress.progressIndex, activeTypingText.length);
  const activeElapsedMs =
    isRoomPlaying && room?.serverStartAt
      ? Date.now() - room.serverStartAt
      : isPracticePlaying && practiceSession
        ? Date.now() - practiceSession.startedAt
        : 0;
  const activeWpm = calculateWpm(activeProgress.correctCharacters, activeElapsedMs);
  const activeAccuracy = calculateAccuracy(activeProgress.correctCharacters, activeProgress.totalTypedCharacters);
  const activeResultPlayer =
    room?.players.find((player) => player.id === playerId) ?? activePracticePlayer ?? null;
  const isTimeAttackPlaying = Boolean(isRoomPlaying && room?.matchRule === "timeAttack");
  const activeTimeAttackRemainingSeconds = Math.max(matchTimerMs / 1000, 0).toFixed(1);
  const canStart =
    room?.status === "waiting" &&
    currentPlayer?.isHost &&
    room.players.length >= 1 &&
    room.players.every((player) => player.connected || player.isBot);
  const acceptingTextInput = (isRoomPlaying && !result) || isPracticePlaying;

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
    setResult(null);
  }, []);

  const updateGuestSession = useCallback(() => {
    setGuestSession((current) => {
      if (!current) {
        return current;
      }

      return touchGuestSession(current);
    });
  }, []);

  const resumeSavedRoom = useCallback(() => {
    if (resumeAttemptedRef.current || !settingsHydratedRef.current) {
      return;
    }

    const currentGuestSession = guestSessionRef.current;
    if (!currentGuestSession) {
      return;
    }

    const storedRoomCode = window.localStorage.getItem(ROOM_CODE_KEY);

    if (!storedRoomCode) {
      setResumeAttempted(true);
      resumeAttemptedRef.current = true;
      return;
    }

    const socket = socketRef.current;

    if (!socket) {
      return;
    }

    setResumeAttempted(true);
    resumeAttemptedRef.current = true;
    socket.emit(
      "room:join",
      {
        roomCode: storedRoomCode,
        nickname: normalizeNickname(nicknameRef.current),
        guestId: currentGuestSession.guestId,
        sessionId: currentGuestSession.sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        if (!response.ok) {
          window.localStorage.removeItem(ROOM_CODE_KEY);
          return;
        }

        setError("");
        setPlayerId(response.data.playerId);
        setRoom(response.data.room);
        setResult(response.data.room.result ?? null);
        updateGuestSession();
        clearPracticeState();
      }
    );
  }, [clearPracticeState, updateGuestSession]);

  const startPractice = useCallback(() => {
    const socket = socketRef.current;
    const currentNickname = nicknameInputRef.current?.value ?? nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!realtimeConfigured || !socket || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

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
  }, [guestId, practiceCategory, realtimeConfigured, resetTyping]);

  const startDailyChallenge = useCallback(() => {
    const socket = socketRef.current;
    const currentNickname = nicknameInputRef.current?.value ?? nicknameRef.current;
    const validationError = validateNickname(currentNickname);
    const deviceKind = detectDeviceKind();

    if (!realtimeConfigured || !socket || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

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
  }, [guestId, realtimeConfigured, resetTyping]);

  const finishPractice = useCallback(
    (finalProgress: ProgressState) => {
      if (!practiceSession) {
        return;
      }

      const finishTimeMs = Date.now() - practiceSession.startedAt;
      const player: PlayerResult = {
        id: practiceSession.practiceId,
        nickname: normalizeNickname(nicknameRef.current),
        connected: true,
        ready: true,
        isHost: true,
        isBot: false,
        progressIndex: finalProgress.progressIndex,
        correctCharacters: finalProgress.correctCharacters,
        totalTypedCharacters: finalProgress.totalTypedCharacters,
        mistakes: finalProgress.mistakes,
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
        const nextRecord = updateDailyChallengeRecord(dailyChallengeRecord, {
          challengeKey: practiceSession.challengeKey,
          promptId: practiceSession.prompt.id,
          wpm: player.wpm,
          accuracy: player.accuracy,
          finishTimeMs,
          completedAt: player.finishedAt ?? Date.now()
        });

        persistDailyChallengeRecord(window.localStorage, nextRecord);
        setDailyChallengeRecord(nextRecord);
      }
    },
    [dailyChallengeRecord, practiceSession]
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
    settingsHydratedRef.current = true;
    setSettingsHydrated(true);

    if (!realtimeConfigured) {
      setConnected(false);
      return;
    }

    const socket: ClientSocket = createRealtimeSocket({ transport: REALTIME_TRANSPORT, url: realtimeUrl });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      resumeSavedRoom();
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setResumeAttempted(false);
      resumeAttemptedRef.current = false;
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
    socket.on("match:error", ({ message }) => setError(message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [realtimeConfigured, realtimeUrl, resetTyping, resumeSavedRoom]);

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
    guestSessionRef.current = guestSession;
  }, [guestSession]);

  useEffect(() => {
    settingsHydratedRef.current = settingsHydrated;
  }, [settingsHydrated]);

  useEffect(() => {
    resumeAttemptedRef.current = resumeAttempted;
  }, [resumeAttempted]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    setDailyChallengeRecord(loadDailyChallengeRecord(window.localStorage, dailyChallengeInfo.challengeKey));
  }, [dailyChallengeInfo.challengeKey, settingsHydrated]);

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
    if (!connected) {
      return;
    }

    resumeSavedRoom();
  }, [connected, resumeSavedRoom]);

  useEffect(() => {
    if (!currentPlayer) {
      return;
    }

    setLocalProgress((previous) => {
      if (currentPlayer.progressIndex <= previous.progressIndex) {
        return previous;
      }

      return {
        progressIndex: currentPlayer.progressIndex,
        correctCharacters: currentPlayer.correctCharacters,
        totalTypedCharacters: currentPlayer.totalTypedCharacters,
        mistakes: currentPlayer.mistakes,
        currentStreak: currentPlayer.currentStreak,
        maxStreak: currentPlayer.maxStreak,
        pendingInput: previous.pendingInput
      };
    });
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

    typingInputRef.current?.focus();
  }, [acceptingTextInput, activeTypingText]);

  const emitProgress = useCallback(
    (nextProgress: TypingProgress, finish: boolean) => {
      const socket = socketRef.current;

      if (!socket || !room) {
        return;
      }

      if (finish) {
        socket.emit("typing:finish", nextProgress);
        return;
      }

      socket.emit("typing:progress", nextProgress);
    },
    [room]
  );

  const updateTypingProgress = useCallback(
    (previous: ProgressState, typedText: string) => {
      if (activeInputDeviceKind === "mobile") {
        return advanceProgressWithMistakes(previous, activeTypingText, typedText);
      }

      if (activeRomajiTypingPlan) {
        return advanceRomajiProgressWithMistakes(previous, activeRomajiTypingPlan, typedText);
      }

      return advanceProgressWithMistakes(previous, activeTypingText, typedText);
    },
    [activeInputDeviceKind, activeRomajiTypingPlan, activeTypingText]
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
        const payload: TypingProgress = {
          roomCode: room.roomCode,
          progressIndex: next.progress.progressIndex,
          correctCharacters: next.progress.correctCharacters,
          totalTypedCharacters: next.progress.totalTypedCharacters,
          mistakes: next.progress.mistakes
        };

        setLocalProgress(next.progress);
        localProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);
        void playTypingSound({ enabled: settingsRef.current.soundEnabled }, correct);
        emitProgress(payload, next.progress.progressIndex >= activeTypingText.length);
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

      if (
        activeInputDeviceKind === "mobile" &&
        (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
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

        const payload: TypingProgress = {
          roomCode: room.roomCode,
          progressIndex: next.progress.progressIndex,
          correctCharacters: next.progress.correctCharacters,
          totalTypedCharacters: next.progress.totalTypedCharacters,
          mistakes: next.progress.mistakes
        };

        setLocalProgress(next.progress);
        localProgressRef.current = next.progress;
        recordMistakeSamples(next.mistakeSamples);
        void playTypingSound({ enabled: soundOptions.soundEnabled }, correct);
        emitProgress(payload, next.progress.progressIndex >= activeTypingText.length);
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
    emitProgress,
    finishPractice,
    practiceResult,
    practiceSession,
    recordMistakeSamples,
    updateTypingProgress,
    room
  ]);

  const createRoom = () => {
    const socket = socketRef.current;
    const currentNickname = nicknameRef.current;
    const validationError = validateNickname(currentNickname);

    if (!realtimeConfigured || !socket || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    void primeSoundPlayback();
    socket.emit(
      "room:create",
      {
        nickname: normalizeNickname(currentNickname),
        guestId,
        sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        if (!response.ok) {
          setError(response.error);
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
    const socket = socketRef.current;
    const currentNickname = nicknameRef.current;
    const validationError = validateNickname(currentNickname);

    if (!realtimeConfigured || !socket || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    void primeSoundPlayback();
    socket.emit(
      "room:join",
      {
        roomCode: joinCode.trim().toUpperCase(),
        nickname: normalizeNickname(currentNickname),
        guestId,
        sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        if (!response.ok) {
          setError(response.error);
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
    if (socketRef.current && room) {
      socketRef.current.emit("room:leave", { roomCode: room.roomCode });
    }

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

    socketRef.current.emit("player:ready", {
      roomCode: room.roomCode,
      ready: !currentPlayer.ready
    });
  };

  const startMatch = () => {
    if (!realtimeConfigured || !socketRef.current || !room) {
      return;
    }

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

    void primeSoundPlayback();
    socketRef.current.emit("match:rematch", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setError(response.error);
        return;
      }

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

  return (
    <main className="appShell">
      <GameHeader
        connected={connected}
        realtimeConfigured={realtimeConfigured}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <section className="workspace">
        <aside className="sidePanel" aria-label="ルーム操作">
          {!realtimeConfigured ? (
            <p className="infoText">
              Realtime の接続先が未設定のため、今は Vercel への web deploy はできますが対戦は使えません。
            </p>
          ) : null}

          <div className="fieldGroup">
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
          </div>

          {!room ? (
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
          ) : (
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
          )}

          {!room ? (
            <div className="dailyChallengePanel">
              <div className="dailyChallengeHeader">
                <span>デイリーチャレンジ</span>
                <small>{dailyChallengeInfo.challengeKey}</small>
              </div>
              <p className="dailyChallengePrompt">{dailyChallengePrompt.text}</p>
              <div className="dailyChallengeStats">
                <div>
                  <span>今日の最高 WPM</span>
                  <strong>{dailyChallengeRecord ? dailyChallengeRecord.bestWpm : "—"}</strong>
                </div>
                <div>
                  <span>挑戦回数</span>
                  <strong>{dailyChallengeRecord?.attempts ?? 0}</strong>
                </div>
                <div>
                  <span>ベスト正確率</span>
                  <strong>{dailyChallengeRecord ? `${dailyChallengeRecord.bestAccuracy}%` : "—"}</strong>
                </div>
                <div>
                  <span>ベスト時間</span>
                  <strong>{dailyChallengeRecord ? `${Math.round(dailyChallengeRecord.bestFinishTimeMs / 1000)}s` : "—"}</strong>
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
            </div>
          ) : null}

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

          {!room ? (
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
                  <div>
                    <strong>{player.nickname}</strong>
                    <span>
                      {getPlayerRoleLabel(player)} / {getPlayerDeviceLabel(player)}
                    </span>
                  </div>
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
              <button className="secondaryButton" type="button" onClick={setReady}>
                {currentPlayer?.ready ? "準備完了" : "準備する"}
              </button>
              <button
                className="primaryButton"
                type="button"
                onClick={startMatch}
                disabled={!realtimeConfigured || !canStart}
              >
                <Play size={18} />
                {room.players.length < room.maxPlayers ? "COM と開始" : "開始"}
              </button>
            </div>
          ) : null}
        </aside>

        <section className="matchSurface" aria-label="タイピング対戦">
          {room || practiceSession || practiceResult ? (
            <>
              <div className="matchHeader">
                <StatusPill
                  status={
                    room ? (result ? "result" : room.status) : practiceResult ? "result" : "playing"
                  }
                />
                <div className="statsGrid">
                  <Stat
                    label="WPM"
                    value={
                      isRoomPlaying || isPracticePlaying ? activeWpm : activeResultPlayer?.wpm ?? 0
                    }
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
                </div>
              </div>

              {room?.status === "countdown" ? (
                <div className="countdown">{Math.max(1, Math.ceil(countdownMs / 1000))}</div>
              ) : null}

              {activePromptText ? (
                <TypingPrompt
                  displayText={activePromptText}
                  inputText={activeTypingText}
                  progressIndex={activeProgress.progressIndex}
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
                disabled={!acceptingTextInput}
                deviceKind={activeInputDeviceKind}
                onTextInput={handleTypedText}
              />

              <ProgressBlock progressPercent={activeProgressPercent} />

              {room ? (
                <div className="rivalGrid">
                  {room.players.map((player) => (
                    <RivalBar
                      key={player.id}
                      player={player}
                      promptLength={activeTypingText.length}
                      isSelf={player.id === playerId}
                    />
                  ))}
                </div>
              ) : null}

              {activeResult ? (
                <ResultPanel
                  result={activeResult}
                  isRoomResult={Boolean(room)}
                  onRetry={room ? rematch : retryPractice}
                  practiceMode={activePracticeMode}
                  {...(room?.matchRule ? { matchRule: room.matchRule } : {})}
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
