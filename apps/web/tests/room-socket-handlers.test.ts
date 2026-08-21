import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchResult, QuickReaction, RoomState } from "@type-battle/shared";
import type { ReactionFeedback } from "../app/_lib/reaction-feedback";
import { REACTION_DISPLAY_MS } from "../app/_lib/reaction-feedback";
import {
  bindRoomSocketHandlers,
  type RoomSocketHandlerContext
} from "../app/_lib/room-socket-handlers";
import type { RealtimeSocket } from "../app/_lib/realtime-client";

type EventHandler = (...args: never[]) => void;

function createSocketHarness() {
  const handlers = new Map<string, EventHandler>();
  const on = vi.fn((event: string, handler: EventHandler) => {
    handlers.set(event, handler);
  });
  const emit = vi.fn();
  const socket = {
    isConnected: vi.fn(() => true),
    on,
    off: vi.fn(),
    emit,
    disconnect: vi.fn()
  } as unknown as RealtimeSocket;

  return {
    socket,
    on,
    emit,
    dispatch(event: string, payload?: unknown) {
      const handler = handlers.get(event);
      if (!handler) {
        throw new Error(`Missing handler for ${event}`);
      }
      handler(payload as never);
    }
  };
}

function room(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: "ABC123",
    hostPlayerId: "player-1",
    status: "waiting",
    matchRule: "race",
    botDifficulty: "normal",
    promptCategory: "standard",
    players: [],
    maxPlayers: 2,
    round: 1,
    ...overrides
  };
}

function result(roomCode = "ABC123"): MatchResult {
  return {
    roomCode,
    prompt: {
      id: "prompt-1",
      text: "test",
      category: "standard",
      typing: { romaji: "test", hiragana: "てすと" }
    },
    players: []
  };
}

function createContext(socket: RealtimeSocket, overrides: Partial<RoomSocketHandlerContext> = {}) {
  let reactionFeedback: ReactionFeedback = { phase: "idle", reaction: null, message: "" };
  const context: RoomSocketHandlerContext = {
    socketRef: { current: socket },
    roomRef: { current: null },
    resultRef: { current: null },
    createPendingRef: { current: false },
    typingInputRef: { current: { blur: vi.fn() } as unknown as HTMLTextAreaElement },
    guestSessionRef: { current: { guestId: "guest-1", sessionId: "session-1" } },
    attemptStoredRoomJoinRef: { current: vi.fn() },
    nicknameRef: { current: "  Alice  " },
    storedRoomCodeRef: { current: "STORED" },
    reactionRequestPendingRef: { current: false },
    settingsRef: { current: { reactionsEnabled: true } },
    playerIdRef: { current: "player-1" },
    remoteReactionTimerRef: { current: null },
    setConnected: vi.fn(),
    setRoom: vi.fn(),
    setResult: vi.fn(),
    setStoredRoomRecovery: vi.fn(),
    setError: vi.fn(),
    setPlayerId: vi.fn(),
    setReactionFeedback: vi.fn((value) => {
      reactionFeedback = typeof value === "function" ? value(reactionFeedback) : value;
    }),
    setCountdownMs: vi.fn(),
    setRemoteReaction: vi.fn(),
    setRematchError: vi.fn(),
    setRematchPending: vi.fn(),
    failPendingRoomCreate: vi.fn(),
    resetTyping: vi.fn(),
    ...overrides
  };

  return { context, getReactionFeedback: () => reactionFeedback };
}

function bind(mode: "practice" | "room" = "room", overrides: Partial<RoomSocketHandlerContext> = {}) {
  const harness = createSocketHarness();
  const fixture = createContext(harness.socket, overrides);
  bindRoomSocketHandlers({ socket: harness.socket, mode, context: fixture.context });
  return { ...harness, ...fixture };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bindRoomSocketHandlers", () => {
  it("wires every room socket event and ignores all events from a stale socket", () => {
    const fixture = bind();
    const currentSocket = createSocketHarness().socket;
    fixture.context.socketRef.current = currentSocket;

    expect(fixture.on).toHaveBeenCalledTimes(9);
    expect(fixture.on.mock.calls.map(([event]) => event)).toEqual([
      "connect",
      "disconnect",
      "room:state",
      "player:progress",
      "match:countdown",
      "match:started",
      "match:result",
      "match:error",
      "player:reaction"
    ]);

    fixture.dispatch("connect");
    fixture.dispatch("disconnect", { code: 1006, reason: "lost", willReconnect: true });
    fixture.dispatch("room:state", room());
    fixture.dispatch("player:progress", room({ status: "playing" }));
    fixture.dispatch("match:countdown", { room: room({ status: "countdown" }), serverStartAt: Date.now() });
    fixture.dispatch("match:started", room({ status: "playing" }));
    fixture.dispatch("match:result", result());
    fixture.dispatch("match:error", { message: "failed" });
    fixture.dispatch("player:reaction", { playerId: "player-2", reaction: "ナイス" });

    for (const setter of [
      fixture.context.setConnected,
      fixture.context.setRoom,
      fixture.context.setResult,
      fixture.context.setStoredRoomRecovery,
      fixture.context.setError,
      fixture.context.setPlayerId,
      fixture.context.setReactionFeedback,
      fixture.context.setCountdownMs,
      fixture.context.setRemoteReaction,
      fixture.context.setRematchError,
      fixture.context.setRematchPending
    ]) {
      expect(setter).not.toHaveBeenCalled();
    }
    expect(fixture.context.attemptStoredRoomJoinRef.current).not.toHaveBeenCalled();
    expect(fixture.context.failPendingRoomCreate).not.toHaveBeenCalled();
    expect(fixture.context.resetTyping).not.toHaveBeenCalled();
  });

  it("connect emits a normalized existing-room join instead of stored-room recovery", () => {
    vi.stubGlobal("window", { navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" } });
    const currentRoom = room();
    const fixture = bind("room", { roomRef: { current: currentRoom } });

    fixture.dispatch("connect");

    expect(fixture.context.setConnected).toHaveBeenCalledWith(true);
    expect(fixture.context.attemptStoredRoomJoinRef.current).not.toHaveBeenCalled();
    expect(fixture.emit).toHaveBeenCalledWith(
      "room:join",
      {
        roomCode: "ABC123",
        nickname: "Alice",
        guestId: "guest-1",
        sessionId: "session-1",
        deviceKind: "mobile"
      },
      expect.any(Function)
    );
  });

  it("connect uses stored-room recovery when either the room or session is absent", () => {
    for (const overrides of [
      { roomRef: { current: null } },
      { roomRef: { current: room() }, guestSessionRef: { current: null } }
    ] satisfies Partial<RoomSocketHandlerContext>[]) {
      const fixture = bind("room", overrides);
      fixture.dispatch("connect");
      expect(fixture.context.attemptStoredRoomJoinRef.current).toHaveBeenCalledWith(fixture.socket);
      expect(fixture.emit).not.toHaveBeenCalled();
    }

    const practice = bind("practice");
    practice.dispatch("connect");
    expect(practice.context.attemptStoredRoomJoinRef.current).not.toHaveBeenCalled();
  });

  it("sets failed and successful existing-room rejoin state", () => {
    const fixture = bind("room", { roomRef: { current: room() } });
    fixture.dispatch("connect");
    const ack = fixture.emit.mock.calls[0]?.[2] as (response: unknown) => void;

    ack({ ok: false, error: "join failed" });
    expect(fixture.context.setError).toHaveBeenLastCalledWith("join failed");
    expect(fixture.context.setStoredRoomRecovery).toHaveBeenLastCalledWith({
      status: "failed",
      message: "ルームへの再接続に失敗しました。接続を確認して再試行してください。"
    });

    const rejoinedRoom = room({ status: "playing" });
    ack({ ok: true, data: { playerId: "player-2", room: rejoinedRoom } });
    expect(fixture.context.setStoredRoomRecovery).toHaveBeenLastCalledWith({ status: "idle", message: "" });
    expect(fixture.context.setError).toHaveBeenLastCalledWith("");
    expect(fixture.context.setPlayerId).toHaveBeenCalledWith("player-2");
    expect(fixture.context.storedRoomCodeRef.current).toBe("ABC123");
    expect(fixture.context.resetTyping).toHaveBeenCalledOnce();
    expect(fixture.context.setRoom).toHaveBeenLastCalledWith(rejoinedRoom);
  });

  it("blocks create-pending snapshots and turns errors or disconnects into create failures", () => {
    const fixture = bind("room", {
      createPendingRef: { current: true },
      roomRef: { current: null }
    });

    fixture.dispatch("room:state", room());
    expect(fixture.context.setRoom).not.toHaveBeenCalled();

    fixture.dispatch("match:error", { message: "transport detail" });
    expect(fixture.context.failPendingRoomCreate).toHaveBeenCalledWith(
      "ルーム作成中に接続エラーが発生しました。接続を確認して、もう一度お試しください。"
    );
    expect(fixture.context.setError).not.toHaveBeenCalled();

    fixture.dispatch("disconnect", { code: 1006, reason: "network", willReconnect: true });
    expect(fixture.context.failPendingRoomCreate).toHaveBeenLastCalledWith(
      "ルーム作成中に接続が切れました（network）。接続を確認して、もう一度お試しください。"
    );
    expect(fixture.context.setConnected).toHaveBeenCalledWith(false);
  });

  it("rejects lower-round and post-finished playing snapshots", () => {
    const terminalResult = result();
    const finished = room({ round: 2, status: "finished", result: terminalResult });
    const fixture = bind("room", {
      roomRef: { current: finished },
      resultRef: { current: terminalResult }
    });

    fixture.dispatch("room:state", room({ round: 1, status: "playing" }));
    fixture.dispatch("player:progress", room({ round: 2, status: "playing" }));

    expect(fixture.context.setRoom).not.toHaveBeenCalled();
    expect(fixture.context.setResult).not.toHaveBeenCalled();
    expect(fixture.context.roomRef.current).toBe(finished);
    expect(fixture.context.resultRef.current).toBe(terminalResult);
  });

  it("resets typing before applying countdown/start snapshots and then updates countdown", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const fixture = bind();
    const countdownRoom = room({ status: "countdown" });
    fixture.dispatch("match:countdown", { room: countdownRoom, serverStartAt: 4_500 });

    expect(fixture.context.resetTyping).toHaveBeenCalledBefore(fixture.context.setRoom as ReturnType<typeof vi.fn>);
    expect(fixture.context.setRoom).toHaveBeenCalledWith(countdownRoom);
    expect(fixture.context.setCountdownMs).toHaveBeenCalledWith(3_500);

    const startedRoom = room({ status: "playing" });
    fixture.dispatch("match:started", startedRoom);
    expect(fixture.context.resetTyping).toHaveBeenCalledTimes(2);
    expect(fixture.context.setRoom).toHaveBeenLastCalledWith(startedRoom);
    expect(fixture.context.setCountdownMs).toHaveBeenLastCalledWith(0);
  });

  it("ignores mismatched results but finishes and blurs input for a matching result", () => {
    const blur = vi.fn();
    const fixture = bind("room", {
      roomRef: { current: room({ status: "playing" }) },
      typingInputRef: { current: { blur } as unknown as HTMLTextAreaElement }
    });

    fixture.dispatch("match:result", result("OTHER"));
    expect(fixture.context.setResult).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();

    const matchingResult = result();
    fixture.dispatch("match:result", matchingResult);
    expect(fixture.context.setResult).toHaveBeenCalledWith(matchingResult);
    expect(fixture.context.setCountdownMs).toHaveBeenCalledWith(0);
    expect(fixture.context.setRoom).toHaveBeenCalledWith(
      expect.objectContaining({ status: "finished", result: matchingResult })
    );
    expect(blur).toHaveBeenCalledOnce();
  });

  it("filters self and disabled reactions while reduced motion keeps accessible static feedback", () => {
    const fixture = bind();
    fixture.dispatch("player:reaction", { playerId: "player-1", reaction: "ナイス" });
    expect(fixture.context.setRemoteReaction).not.toHaveBeenCalled();

    fixture.context.settingsRef.current.reactionsEnabled = false;
    fixture.dispatch("player:reaction", { playerId: "player-2", reaction: "ナイス" });
    expect(fixture.context.setRemoteReaction).not.toHaveBeenCalled();

    // Reduced motion suppresses animation in CSS; it must not hide the text reaction.
    fixture.context.settingsRef.current.reactionsEnabled = true;
    const reducedSettings = fixture.context.settingsRef.current as { reactionsEnabled: boolean; reducedMotion?: boolean };
    reducedSettings.reducedMotion = true;
    fixture.dispatch("player:reaction", { playerId: "player-2", reaction: "よろしく" });
    expect(fixture.context.setRemoteReaction).toHaveBeenCalledWith({
      playerId: "player-2",
      reaction: "よろしく"
    });
  });

  it("replaces the incoming reaction timer", () => {
    vi.useFakeTimers();
    const fixture = bind();
    const first: { playerId: string; reaction: QuickReaction } = { playerId: "player-2", reaction: "よろしく" };
    const second: { playerId: string; reaction: QuickReaction } = { playerId: "player-2", reaction: "ナイス" };

    fixture.dispatch("player:reaction", first);
    vi.advanceTimersByTime(REACTION_DISPLAY_MS - 100);
    fixture.dispatch("player:reaction", second);
    vi.advanceTimersByTime(101);
    expect(fixture.context.setRemoteReaction).not.toHaveBeenCalledWith(null);

    vi.advanceTimersByTime(REACTION_DISPLAY_MS - 101);
    expect(fixture.context.setRemoteReaction).toHaveBeenLastCalledWith(null);
    expect(fixture.context.remoteReactionTimerRef.current).toBeNull();
  });

  it("disconnect changes a sending reaction to an error and releases its pending flag", () => {
    const fixture = bind();
    fixture.context.reactionRequestPendingRef.current = true;
    fixture.context.setReactionFeedback({ phase: "sending", reaction: "ナイス", message: "sending" });

    fixture.dispatch("disconnect", { code: 1006, reason: "network", willReconnect: true });

    expect(fixture.context.reactionRequestPendingRef.current).toBe(false);
    expect(fixture.getReactionFeedback()).toEqual({
      phase: "error",
      reaction: null,
      message: "接続が切れたため、リアクションを送信できませんでした。"
    });
  });
});
