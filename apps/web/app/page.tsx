"use client";

import { Clipboard, Play, RotateCcw, Swords, Unplug, Users } from "lucide-react";
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
  RoomState,
  ServerToClientEvents,
  TypingProgress
} from "@type-battle/shared";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://127.0.0.1:3001";
const GUEST_ID_KEY = "type-battle:guest-id";
const ROOM_CODE_KEY = "type-battle:room-code";
const NICKNAME_KEY = "type-battle:nickname";

export default function HomePage() {
  const socketRef = useRef<ClientSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [guestId, setGuestId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [nickname, setNickname] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState("");
  const [countdownMs, setCountdownMs] = useState(0);
  const [resumeAttempted, setResumeAttempted] = useState(false);
  const [localProgress, setLocalProgress] = useState({
    progressIndex: 0,
    correctCharacters: 0,
    totalTypedCharacters: 0,
    mistakes: 0
  });

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.id === playerId) ?? null,
    [playerId, room]
  );
  const promptText = room?.prompt?.text ?? result?.prompt.text ?? "";
  const progressPercent = calculateProgress(localProgress.progressIndex, promptText.length);
  const elapsedMs =
    room?.serverStartAt && room.status === "playing" ? Date.now() - room.serverStartAt : 0;
  const localWpm = calculateWpm(localProgress.correctCharacters, elapsedMs);
  const localAccuracy = calculateAccuracy(
    localProgress.correctCharacters,
    localProgress.totalTypedCharacters
  );
  const canStart =
    room?.status === "waiting" &&
    currentPlayer?.isHost &&
    room.players.length >= 1 &&
    room.players.every((player) => player.connected || player.isBot);

  const resetTyping = useCallback(() => {
    setLocalProgress({
      progressIndex: 0,
      correctCharacters: 0,
      totalTypedCharacters: 0,
      mistakes: 0
    });
    setResult(null);
  }, []);

  useEffect(() => {
    const storedGuestId = window.localStorage.getItem(GUEST_ID_KEY) ?? createGuestId();
    const storedNickname = window.localStorage.getItem(NICKNAME_KEY);
    window.localStorage.setItem(GUEST_ID_KEY, storedGuestId);
    setGuestId(storedGuestId);

    if (storedNickname) {
      setNickname(storedNickname);
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
    if (!connected || resumeAttempted || !guestId || room) {
      return;
    }

    const storedRoomCode = window.localStorage.getItem(ROOM_CODE_KEY);
    const storedNickname = window.localStorage.getItem(NICKNAME_KEY) ?? nickname;

    if (!storedRoomCode) {
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
        nickname: normalizeNickname(storedNickname),
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
      }
    );
  }, [connected, guestId, nickname, resumeAttempted, room]);

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
        mistakes: currentPlayer.mistakes
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
      if (room?.status !== "playing" || !promptText || result) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      event.preventDefault();

      setLocalProgress((previous) => {
        const expected = promptText[previous.progressIndex];
        const correct = event.key === expected;
        const nextIndex = correct ? previous.progressIndex + 1 : previous.progressIndex;
        const next = {
          progressIndex: nextIndex,
          correctCharacters: correct ? previous.correctCharacters + 1 : previous.correctCharacters,
          totalTypedCharacters: previous.totalTypedCharacters + 1,
          mistakes: correct ? previous.mistakes : previous.mistakes + 1
        };

        const payload: TypingProgress = {
          roomCode: room.roomCode,
          ...next
        };

        emitProgress(payload, nextIndex >= promptText.length);
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [emitProgress, promptText, result, room]);

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
        window.localStorage.setItem(NICKNAME_KEY, normalizeNickname(nickname));
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
        window.localStorage.setItem(NICKNAME_KEY, normalizeNickname(nickname));
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
                  <small>{player.isBot ? "bot" : player.connected ? "connected" : "offline"}</small>
                </div>
              ))}
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
          {room ? (
            <>
              <div className="matchHeader">
                <StatusPill status={result ? "result" : room.status} />
                <div className="statsGrid">
                  <Stat label="WPM" value={room.status === "playing" ? localWpm : currentPlayer?.wpm ?? 0} />
                  <Stat
                    label="ACC"
                    value={`${room.status === "playing" ? localAccuracy : currentPlayer?.accuracy ?? 100}%`}
                  />
                  <Stat label="MISS" value={localProgress.mistakes} />
                </div>
              </div>

              {room.status === "countdown" ? (
                <div className="countdown">{Math.max(1, Math.ceil(countdownMs / 1000))}</div>
              ) : null}

              {promptText ? (
                <div className="promptBox" aria-label="Typing prompt">
                  {promptText.split("").map((char, index) => {
                    const className =
                      index < localProgress.progressIndex
                        ? "char typed"
                        : index === localProgress.progressIndex
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
                  <p>{room.players.length < room.maxPlayers ? "Waiting for rival" : "Ready to start"}</p>
                </div>
              )}

              <div className="progressBlock">
                <div className="progressLabel">
                  <span>Your progress</span>
                  <strong>{progressPercent}%</strong>
                </div>
                <div className="progressTrack">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <div className="rivalGrid">
                {room.players.map((player) => (
                  <RivalBar
                    key={player.id}
                    player={player}
                    promptLength={promptText.length}
                    isSelf={player.id === playerId}
                  />
                ))}
              </div>

              {result ? (
                <div className="resultPanel">
                  <div className="resultRows">
                    {result.players.map((player) => (
                      <div className="resultRow" key={player.id}>
                        <span>#{player.rank}</span>
                        <strong>{player.nickname}</strong>
                        <small>
                          {player.wpm} WPM / {player.accuracy}% / {player.mistakes} miss
                        </small>
                      </div>
                    ))}
                  </div>
                  <button className="primaryButton" type="button" onClick={rematch}>
                    <RotateCcw size={18} />
                    Rematch
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

  return (
    <div className={isSelf ? "rivalBar isSelf" : "rivalBar"}>
      <div>
        <strong>{player.nickname}</strong>
        <span>{progress}%</span>
      </div>
      <div className="miniTrack">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
