"use client";

import { Clipboard, Play, RotateCcw, Settings, Swords, Unplug, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import {
  calculateAccuracy,
  calculateProgress,
  calculateWpm,
  createGuestId,
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

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ProgressState = {
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
  currentStreak: number;
  maxStreak: number;
};

type PlayerSettings = {
  nickname: string;
  theme: "system" | "light" | "dark";
  soundEnabled: boolean;
  countdownSoundEnabled: boolean;
  inputGuideEnabled: boolean;
  reducedMotion: boolean;
  fontSize: "small" | "normal" | "large";
};

type PracticeSession = {
  practiceId: string;
  prompt: Prompt;
  startedAt: number;
  category: PromptCategory;
};

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://127.0.0.1:3001";
const GUEST_ID_KEY = "type-battle:guest-id";
const ROOM_CODE_KEY = "type-battle:room-code";
const SETTINGS_KEY = "type-battle:settings";

const DEFAULT_SETTINGS: PlayerSettings = {
  nickname: "Player",
  theme: "system",
  soundEnabled: true,
  countdownSoundEnabled: true,
  inputGuideEnabled: true,
  reducedMotion: false,
  fontSize: "normal"
};

function createEmptyProgress(): ProgressState {
  return {
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0,
    currentStreak: 0,
    maxStreak: 0
  };
}

export default function HomePage() {
  const socketRef = useRef<ClientSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [guestId, setGuestId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);
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

  const startPractice = useCallback(() => {
    const socket = socketRef.current;
    const validationError = validateNickname(nickname);

    if (!socket || validationError || !guestId) {
      setError(validationError ?? "サーバーに接続していません。");
      return;
    }

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
  }, [guestId, nickname, practiceCategory, resetTyping]);

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
    const storedGuestId = window.localStorage.getItem(GUEST_ID_KEY) ?? createGuestId();
    const storedSettingsJson = window.localStorage.getItem(SETTINGS_KEY);
    window.localStorage.setItem(GUEST_ID_KEY, storedGuestId);
    setGuestId(storedGuestId);

    if (storedSettingsJson) {
      try {
        const storedSettings = JSON.parse(storedSettingsJson);
        setSettings((prev) => ({ ...prev, ...storedSettings }));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
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
  }, [resetTyping]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    const html = document.documentElement;
    html.classList.remove("theme-light", "theme-dark", "font-small", "font-normal", "font-large", "reduced-motion");
    
    if (settings.theme !== "system") {
      html.classList.add(`theme-${settings.theme}`);
    }
    html.classList.add(`font-${settings.fontSize}`);
    if (settings.reducedMotion) {
      html.classList.add("reduced-motion");
    }
  }, [settings]);

  useEffect(() => {
    if (!connected || !guestId || resumeAttempted) {
      return;
    }

    const storedRoomCode = window.localStorage.getItem(ROOM_CODE_KEY);
    
    // Only attempt to resume if we have a room code and we are not currently in a room
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
        guestId
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
        clearPracticeState();
      }
    );
  }, [clearPracticeState, connected, guestId, nickname, resumeAttempted, room]);

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
      return;
    }

    const interval = window.setInterval(() => {
      setCountdownMs(Math.max((room.serverStartAt ?? Date.now()) - Date.now(), 0));
    }, 100);

    return () => window.clearInterval(interval);
  }, [room?.serverStartAt, room?.status]);

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
          const expected = activePromptText[previous.progressIndex];
          const correct = event.key === expected;
          const nextIndex = correct ? previous.progressIndex + 1 : previous.progressIndex;
          const next: ProgressState = {
            progressIndex: nextIndex,
            correctCharacters: correct ? previous.correctCharacters + 1 : previous.correctCharacters,
            totalTypedCharacters: previous.totalTypedCharacters + 1,
            mistakes: correct ? previous.mistakes : previous.mistakes + 1,
            currentStreak: correct ? previous.currentStreak + 1 : 0,
            maxStreak: correct ? Math.max(previous.maxStreak, previous.currentStreak + 1) : previous.maxStreak
          };

          const payload: TypingProgress = {
            roomCode: room.roomCode,
            progressIndex: next.progressIndex,
            correctCharacters: next.correctCharacters,
            totalTypedCharacters: next.totalTypedCharacters,
            mistakes: next.mistakes
          };

          emitProgress(payload, nextIndex >= activePromptText.length);
          return next;
        });
        return;
      }

      if (practiceActive && practiceSession) {
        setPracticeProgress((previous) => {
          const expected = activePromptText[previous.progressIndex];
          const correct = event.key === expected;
          const nextIndex = correct ? previous.progressIndex + 1 : previous.progressIndex;
          const next: ProgressState = {
            progressIndex: nextIndex,
            correctCharacters: correct ? previous.correctCharacters + 1 : previous.correctCharacters,
            totalTypedCharacters: previous.totalTypedCharacters + 1,
            mistakes: correct ? previous.mistakes : previous.mistakes + 1,
            currentStreak: correct ? previous.currentStreak + 1 : 0,
            maxStreak: correct ? Math.max(previous.maxStreak, previous.currentStreak + 1) : previous.maxStreak
          };

          if (nextIndex >= activePromptText.length) {
            finishPractice(next);
          }

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

    if (!socket || validationError || !guestId) {
      setError(validationError ?? "サーバーに接続していません。");
      return;
    }

    socket.emit(
      "room:create",
      { nickname: normalizeNickname(nickname), guestId },
      (response) => {
        if (!response.ok) {
          setError(response.error);
          return;
        }

        setError("");
        setPlayerId(response.data.playerId);
        setRoom(response.data.room);
        window.localStorage.setItem(ROOM_CODE_KEY, response.data.roomCode);
        clearPracticeState();
        resetTyping();
      }
    );
  };

  const joinRoom = () => {
    const socket = socketRef.current;
    const validationError = validateNickname(nickname);

    if (!socket || validationError || !guestId) {
      setError(validationError ?? "サーバーに接続していません。");
      return;
    }

    socket.emit(
      "room:join",
      {
        roomCode: joinCode.trim().toUpperCase(),
        nickname: normalizeNickname(nickname),
        guestId
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
    if (!socketRef.current || !room || !currentPlayer) {
      return;
    }

    socketRef.current.emit("player:ready", {
      roomCode: room.roomCode,
      ready: !currentPlayer.ready
    });
  };

  const startMatch = () => {
    if (!socketRef.current || !room) {
      return;
    }

    socketRef.current.emit("match:start", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setError(response.error);
      }
    });
  };

  const rematch = () => {
    if (!socketRef.current || !room) {
      return;
    }

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
      <section className="topBar" aria-label="Game status">
        <div>
          <p className="eyebrow">TYPE BATTLE</p>
          <h1>Online typing match</h1>
        </div>
        <div className={connected ? "connection isOnline" : "connection"}>
          <span />
          {connected ? "online" : "offline"}
        </div>
        <button
          className="iconButton"
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Open settings"
        >
          <Settings size={18} />
        </button>
      </section>

      <section className="workspace">
        <aside className="sidePanel" aria-label="Room controls">
          <div className="fieldGroup">
            <label htmlFor="nickname">Nickname</label>
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
              <button className="primaryButton" type="button" onClick={createRoom}>
                <Swords size={18} />
                Create room
              </button>
              <div className="joinRow">
                <input
                  aria-label="Room code"
                  placeholder="ROOM CODE"
                  value={joinCode}
                  maxLength={8}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                />
                <button className="iconButton" type="button" onClick={joinRoom} title="Join room">
                  <Users size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="roomMeta">
              <div>
                <span>Room</span>
                <strong>{room.roomCode}</strong>
              </div>
              <button className="iconButton" type="button" onClick={copyRoomCode} title="Copy room code">
                <Clipboard size={18} />
              </button>
              <button className="iconButton" type="button" onClick={leaveRoom} title="Leave room">
                <Unplug size={18} />
              </button>
            </div>
          )}

          {!room ? (
            <div className="difficultySelector">
              <span>Practice mode</span>
              <div className="difficultyButtons">
                {(["short", "standard", "long"] as const).map((category) => (
                  <button
                    key={category}
                    className={practiceCategory === category ? "active" : ""}
                    type="button"
                    onClick={() => setPracticeCategory(category)}
                    disabled={Boolean(practiceSession && !practiceResult)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <button
                className="secondaryButton"
                type="button"
                onClick={startPractice}
                disabled={Boolean(practiceSession && !practiceResult)}
              >
                <Swords size={18} />
                {practiceSession && !practiceResult
                  ? "Practice running"
                  : practiceResult
                    ? "Practice again"
                    : "Start practice"}
              </button>
            </div>
          ) : null}

          {error ? <p className="errorText">{error}</p> : null}

          {room ? (
            <div className="playerList">
              {room.players.map((player) => (
                <div className="playerRow" key={player.id}>
                  <div>
                    <strong>{player.nickname}</strong>
                    <span>
                      {player.isBot ? "com" : player.isHost ? "host" : player.ready ? "ready" : "waiting"}
                    </span>
                  </div>
                  <small>
                    {player.isBot
                      ? "bot"
                      : player.finishTimeMs === Infinity
                        ? "forfeited"
                        : player.connected
                          ? "connected"
                          : "reconnecting..."}
                  </small>
                </div>
              ))}
            </div>
          ) : null}

          {room?.status === "waiting" && room.players.length < room.maxPlayers ? (
            <div className="difficultySelector">
              <span>Prompt Category</span>
              <div className="difficultyButtons">
                {(["short", "standard", "long"] as const).map((c) => (
                  <button
                    key={c}
                    className={room.promptCategory === c ? "active" : ""}
                    type="button"
                    onClick={() => setPromptCategory(c)}
                    disabled={!currentPlayer?.isHost}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {room?.status === "waiting" && room.players.length < room.maxPlayers ? (
            <div className="difficultySelector">
              <span>COM Difficulty</span>
              <div className="difficultyButtons">
                {(["easy", "normal", "hard"] as const).map((difficulty) => (
                  <button
                    key={difficulty}
                    className={room.botDifficulty === difficulty ? "active" : ""}
                    type="button"
                    onClick={() => setBotDifficulty(difficulty)}
                    disabled={!currentPlayer?.isHost}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {room?.status === "waiting" ? (
            <div className="lobbyActions">
              <button className="secondaryButton" type="button" onClick={setReady}>
                {currentPlayer?.ready ? "Ready" : "Set ready"}
              </button>
              <button className="primaryButton" type="button" onClick={startMatch} disabled={!canStart}>
                <Play size={18} />
                {room.players.length < room.maxPlayers ? "Start vs COM" : "Start"}
              </button>
            </div>
          ) : null}
        </aside>

        <section className="matchSurface" aria-label="Typing match">
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
                <div className="promptBox" aria-label="Typing prompt">
                  {activePromptText.split("").map((char, index) => {
                    const className =
                      index < activeProgress.progressIndex
                        ? "char typed"
                        : index === activeProgress.progressIndex && settings.inputGuideEnabled
                          ? "char current"
                          : "char";
                    return (
                      <span className={className} key={`${char}-${index}`}>
                        {char}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="emptyState">
                  <Swords size={42} />
                  <p>{room ? (room.players.length < room.maxPlayers ? "Waiting for rival" : "Ready to start") : "Start practice"}</p>
                </div>
              )}

              <div className="progressBlock">
                <div className="progressLabel">
                  <span>Your progress</span>
                  <strong>{activeProgressPercent}%</strong>
                </div>
                <div className="progressTrack">
                  <span style={{ width: `${activeProgressPercent}%` }} />
                </div>
              </div>

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
                <div className="resultPanel">
                  <div className="resultRows">
                    {activeResult.players.map((player) => (
                      <div className="resultRow" key={player.id}>
                        <span>#{player.rank}</span>
                        <strong>{player.nickname}</strong>
                        <small>
                          {player.wpm} WPM / {player.accuracy}% / {player.mistakes} miss / Streak: {player.maxStreak}
                          {player.finishGap !== undefined ? ` / Gap: ${player.finishGap}ms` : ""}
                        </small>
                      </div>
                    ))}
                  </div>
                  <button
                    className="primaryButton"
                    type="button"
                    onClick={room ? rematch : startPractice}
                  >
                    <RotateCcw size={18} />
                    {room ? "Rematch" : "Practice again"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="emptyState large">
              <Swords size={56} />
              <p>Create or join a room</p>
            </div>
          )}
        </section>
      </section>

      {settingsOpen ? (
        <div className="modalBackdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>Player Settings</h2>
              <button className="iconButton" onClick={() => setSettingsOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="settingsGrid">
              <div className="fieldGroup">
                <label>Nickname</label>
                <input
                  value={settings.nickname}
                  maxLength={18}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>

              <div className="fieldGroup">
                <label>Theme</label>
                <div className="difficultyButtons">
                  {(["system", "light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      className={settings.theme === t ? "active" : ""}
                      onClick={() => setSettings((s) => ({ ...s, theme: t }))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fieldGroup">
                <label>Display & Accessibility</label>
                <div className="toggleGroup">
                  <label className="toggleLabel">
                    <input
                      type="checkbox"
                      checked={settings.inputGuideEnabled}
                      onChange={(e) => setSettings((s) => ({ ...s, inputGuideEnabled: e.target.checked }))}
                    />
                    Input Guide (Highlight next char)
                  </label>
                  <label className="toggleLabel">
                    <input
                      type="checkbox"
                      checked={settings.reducedMotion}
                      onChange={(e) => setSettings((s) => ({ ...s, reducedMotion: e.target.checked }))}
                    />
                    Reduced Motion
                  </label>
                </div>
              </div>

              <div className="fieldGroup">
                <label>Font Size</label>
                <div className="difficultyButtons">
                  {(["small", "normal", "large"] as const).map((f) => (
                    <button
                      key={f}
                      className={settings.fontSize === f ? "active" : ""}
                      onClick={() => setSettings((s) => ({ ...s, fontSize: f }))}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fieldGroup">
                <label>Sound</label>
                <div className="toggleGroup">
                  <label className="toggleLabel">
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={(e) => setSettings((s) => ({ ...s, soundEnabled: e.target.checked }))}
                    />
                    Sound Effects
                  </label>
                  <label className="toggleLabel">
                    <input
                      type="checkbox"
                      checked={settings.countdownSoundEnabled}
                      onChange={(e) => setSettings((s) => ({ ...s, countdownSoundEnabled: e.target.checked }))}
                    />
                    Countdown Sound
                  </label>
                </div>
              </div>
            </div>

            <div className="modalActions">
              <button className="primaryButton" onClick={() => setSettingsOpen(false)}>
                Save & Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function StatusPill({ status }: { status: RoomState["status"] | "result" }) {
  return <div className={`statusPill status-${status}`}>{status}</div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="statItem">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RivalBar({
  player,
  promptLength,
  isSelf
}: {
  player: RoomState["players"][number];
  promptLength: number;
  isSelf: boolean;
}) {
  const progress = calculateProgress(player.progressIndex, promptLength);
  const isForfeited = player.forfeited;
  const isDisconnected = !player.connected && !player.isBot;

  return (
    <div className={isSelf ? "rivalBar isSelf" : "rivalBar"}>
      <div className="rivalInfo">
        <strong>{player.nickname}</strong>
        {isForfeited ? (
          <span className="statusTag isForfeited">FORFEITED</span>
        ) : isDisconnected ? (
          <span className="statusTag isDisconnected">RECONNECTING...</span>
        ) : (
          <span>{progress}%</span>
        )}
      </div>
      <div className="miniTrack">
        <span style={{ width: `${progress}%` }} className={isForfeited ? "isForfeited" : ""} />
      </div>
    </div>
  );
}
