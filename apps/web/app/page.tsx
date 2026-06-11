"use client";

import Link from "next/link";
import { Clipboard, Play, Swords, Unplug, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import {
  calculateAccuracy,
  calculateProgress,
  calculateWpm,
  normalizeNickname,
  validateNickname
} from "@type-battle/shared";
import type {
  ClientToServerEvents,
  MatchResult,
  PlayerResult,
  Prompt,
  PromptCategory,
  RoomState,
  ServerToClientEvents,
  TypingProgress
} from "@type-battle/shared";
import { GameHeader } from "./_components/game-header";
import { PlayerSettingsModal } from "./_components/player-settings-modal";
import { ProgressBlock } from "./_components/progress-block";
import { ResultPanel } from "./_components/result-panel";
import { RivalBar } from "./_components/rival-bar";
import { Stat } from "./_components/stat";
import { StatusPill } from "./_components/status-pill";
import { TypingPrompt } from "./_components/typing-prompt";
import { advanceProgress, createEmptyProgress, type ProgressState } from "./_lib/typing-progress";
import {
  BOT_DIFFICULTY_LABELS,
  PROMPT_CATEGORY_LABELS,
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

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type PracticeSession = {
  practiceId: string;
  prompt: Prompt;
  startedAt: number;
  category: PromptCategory;
};

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim() ?? "";
const REALTIME_UNAVAILABLE_MESSAGE = "Realtime の接続先が未設定です。";
const ROOM_CODE_KEY = "type-battle:room-code";

export default function HomePage() {
  const socketRef = useRef<ClientSocket | null>(null);
  const settingsRef = useRef(DEFAULT_PLAYER_SETTINGS);
  const countdownSecondRef = useRef<number | null>(null);
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
  const [error, setError] = useState("");
  const [countdownMs, setCountdownMs] = useState(0);
  const [resumeAttempted, setResumeAttempted] = useState(false);
  const [localProgress, setLocalProgress] = useState<ProgressState>(createEmptyProgress());
  const [practiceProgress, setPracticeProgress] = useState<ProgressState>(createEmptyProgress());
  const realtimeConfigured = REALTIME_URL.length > 0;
  const guestId = guestSession?.guestId ?? "";
  const sessionId = guestSession?.sessionId ?? "";

  const nickname = settings.nickname;
  const setNickname = (next: string) => setSettings((s) => ({ ...s, nickname: next }));

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.id === playerId) ?? null,
    [playerId, room]
  );
  const activePracticePlayer = practiceResult?.players[0] ?? null;
  const activeResult = result ?? practiceResult;
  const activePrompt = room?.prompt ?? practiceSession?.prompt ?? activeResult?.prompt ?? null;
  const activePromptText = activePrompt?.text ?? "";
  const isRoomPlaying = room?.status === "playing";
  const isPracticePlaying = Boolean(practiceSession && !practiceResult && !room);
  const activeProgress = room ? localProgress : practiceProgress;
  const activeProgressPercent = calculateProgress(activeProgress.progressIndex, activePromptText.length);
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
  const canStart =
    room?.status === "waiting" &&
    currentPlayer?.isHost &&
    room.players.length >= 1 &&
    room.players.every((player) => player.connected || player.isBot);

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

  const clearPracticeState = useCallback(() => {
    setPracticeSession(null);
    setPracticeResult(null);
    setPracticeProgress(createEmptyProgress());
  }, []);

  const resetTyping = useCallback(() => {
    setLocalProgress(createEmptyProgress());
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

  const startPractice = useCallback(() => {
    const socket = socketRef.current;
    const validationError = validateNickname(nickname);

    if (!realtimeConfigured || !socket || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    void primeSoundPlayback();
    socket.emit(
      "practice:start",
      { nickname: normalizeNickname(nickname), category: practiceCategory },
      (response) => {
        if (!response.ok) {
          setError(response.error);
          return;
        }

        setError("");
        setPracticeSession({
          ...response.data,
          category: practiceCategory
        });
        setPracticeResult(null);
        setPracticeProgress(createEmptyProgress());
        resetTyping();
      }
    );
  }, [guestId, nickname, practiceCategory, realtimeConfigured, resetTyping]);

  const finishPractice = useCallback(
    (finalProgress: ProgressState) => {
      if (!practiceSession) {
        return;
      }

      const finishTimeMs = Date.now() - practiceSession.startedAt;
      const player: PlayerResult = {
        id: practiceSession.practiceId,
        nickname: normalizeNickname(nickname),
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
    },
    [nickname, practiceSession]
  );

  useEffect(() => {
    const session = loadGuestSession(window.localStorage);
    setGuestSession(session);
    setSettings(loadPlayerSettings(window.localStorage));
    setSettingsHydrated(true);

    if (!realtimeConfigured) {
      setConnected(false);
      return;
    }

    const socket: ClientSocket = io(REALTIME_URL, {
      transports: ["websocket"]
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
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
    });
    socket.on("match:error", ({ message }) => setError(message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [realtimeConfigured, resetTyping]);

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
    if (!connected || !guestId || !sessionId || resumeAttempted) {
      return;
    }

    const storedRoomCode = window.localStorage.getItem(ROOM_CODE_KEY);
    
    // Resume only when there is a saved room and this tab is not already in one.
    if (!storedRoomCode || room) {
      setResumeAttempted(true);
      return;
    }

    const socket = socketRef.current;

    if (!socket) {
      return;
    }

    setResumeAttempted(true);
    socket.emit(
      "room:join",
      {
        roomCode: storedRoomCode,
        nickname: normalizeNickname(nickname),
        guestId,
        sessionId
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
  }, [clearPracticeState, connected, guestId, nickname, resumeAttempted, room, sessionId, updateGuestSession]);

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
        maxStreak: currentPlayer.maxStreak
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const practiceActive = Boolean(practiceSession && !practiceResult && !room);

      if (room?.status !== "playing" && !practiceActive) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      event.preventDefault();

      if (room?.status === "playing" && room?.prompt) {
        setLocalProgress((previous) => {
          const next = advanceProgress(previous, activePromptText[previous.progressIndex], event.key);
          const correct = next.progressIndex > previous.progressIndex;
          const soundOptions = settingsRef.current;

          const payload: TypingProgress = {
            roomCode: room.roomCode,
            progressIndex: next.progressIndex,
            correctCharacters: next.correctCharacters,
            totalTypedCharacters: next.totalTypedCharacters,
            mistakes: next.mistakes
          };

          void playTypingSound({ enabled: soundOptions.soundEnabled }, correct);
          emitProgress(payload, next.progressIndex >= activePromptText.length);
          return next;
        });
        return;
      }

      if (practiceActive && practiceSession) {
        setPracticeProgress((previous) => {
          const next = advanceProgress(previous, activePromptText[previous.progressIndex], event.key);
          const correct = next.progressIndex > previous.progressIndex;
          const soundOptions = settingsRef.current;

          if (next.progressIndex >= activePromptText.length) {
            finishPractice(next);
          }

          void playTypingSound({ enabled: soundOptions.soundEnabled }, correct);
          return next;
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePromptText, emitProgress, finishPractice, practiceResult, practiceSession, room]);

  const createRoom = () => {
    const socket = socketRef.current;
    const validationError = validateNickname(nickname);

    if (!realtimeConfigured || !socket || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    void primeSoundPlayback();
    socket.emit(
      "room:create",
      { nickname: normalizeNickname(nickname), guestId, sessionId },
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
    const validationError = validateNickname(nickname);

    if (!realtimeConfigured || !socket || validationError || !guestId) {
      setError(validationError ?? REALTIME_UNAVAILABLE_MESSAGE);
      return;
    }

    void primeSoundPlayback();
    socket.emit(
      "room:join",
      {
        roomCode: joinCode.trim().toUpperCase(),
        nickname: normalizeNickname(nickname),
        guestId,
        sessionId
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
              value={nickname}
              maxLength={18}
              onChange={(event) => setNickname(event.target.value)}
              disabled={Boolean(room)}
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
                    <span>{getPlayerRoleLabel(player)}</span>
                  </div>
                  <small>{getPlayerConnectionLabel(player)}</small>
                </div>
              ))}
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
                </div>
              </div>

              {room?.status === "countdown" ? (
                <div className="countdown">{Math.max(1, Math.ceil(countdownMs / 1000))}</div>
              ) : null}

              {activePromptText ? (
                <TypingPrompt
                  promptText={activePromptText}
                  progressIndex={activeProgress.progressIndex}
                  inputGuideEnabled={settings.inputGuideEnabled}
                />
              ) : (
                <div className="emptyState">
                  <Swords size={42} />
                  <p>{room ? (room.players.length < room.maxPlayers ? "対戦相手を待っています" : "開始できます") : "練習を開始してください"}</p>
                </div>
              )}

              <ProgressBlock progressPercent={activeProgressPercent} />

              {room ? (
                <div className="rivalGrid">
                  {room.players.map((player) => (
                    <RivalBar
                      key={player.id}
                      player={player}
                      promptLength={activePromptText.length}
                      isSelf={player.id === playerId}
                    />
                  ))}
                </div>
              ) : null}

              {activeResult ? (
                <ResultPanel result={activeResult} isRoomResult={Boolean(room)} onRetry={room ? rematch : startPractice} />
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
