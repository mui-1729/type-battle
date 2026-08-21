import { useCallback } from "react";
import {
  createRoomCode,
  normalizeNickname,
  validateNickname,
  type MatchResult,
  type PlayerState,
  type RoomState
} from "@type-battle/shared";
import { primeSoundPlayback } from "../../lib/sound";
import { detectDeviceKind } from "./device-kind";
import type { PracticeSession } from "./home-page-view-model";
import type { RealtimeSocket } from "./realtime-client";

type RefBox<T> = { current: T };
type Setter<T> = (value: T) => void;

type CopyFeedback = {
  kind: "idle" | "success" | "error";
  message: string;
};

type UseRoomLifecycleInput = {
  storageKey: string;
  realtimeUnavailableMessage: string;
  refs: {
    socketRef: RefBox<RealtimeSocket | null>;
    nicknameRef: RefBox<string>;
    createPendingRef: RefBox<boolean>;
    storedRoomCodeRef: RefBox<string | null>;
    autoStartRoomRef: RefBox<string | null>;
  };
  state: {
    realtimeConfigured: boolean;
    guestId: string;
    sessionId: string;
    joinCode: string;
    room: RoomState | null;
    currentPlayer: PlayerState | null;
  };
  actions: {
    connectRoomSocket: (roomCode: string) => RealtimeSocket;
    disconnectCurrentSocket: () => void;
    failPendingRoomCreate: (message: string) => void;
    prepareTypingInput: () => void;
    updateGuestSession: () => void;
    clearPracticeState: () => void;
    resetTyping: () => void;
    resetStoredRoomRecovery: (options: { removeStoredCode: boolean }) => void;
    setCreatePending: Setter<boolean>;
    setJoinPending: Setter<boolean>;
    setError: Setter<string>;
    setCopyFeedback: Setter<CopyFeedback>;
    setPlayerId: Setter<string>;
    setRoom: Setter<RoomState | null>;
    setResult: Setter<MatchResult | null>;
    setPracticeSession: Setter<PracticeSession | null>;
    setHomeMode: Setter<null>;
    setExitRequest: Setter<null>;
  };
};

export function useRoomLifecycle({
  storageKey,
  realtimeUnavailableMessage,
  refs,
  state,
  actions
}: UseRoomLifecycleInput) {
  const createRoom = useCallback(() => {
    const currentNickname = refs.nicknameRef.current;
    const roomCode = createRoomCode();
    const validationError = validateNickname(currentNickname);

    if (refs.createPendingRef.current) {
      return;
    }

    actions.setError("");
    if (!state.realtimeConfigured || validationError || !state.guestId) {
      actions.setError(validationError ?? realtimeUnavailableMessage);
      return;
    }

    refs.createPendingRef.current = true;
    actions.setCreatePending(true);
    actions.setError("");
    void primeSoundPlayback();
    const socket = actions.connectRoomSocket(roomCode);
    socket.emit(
      "room:create",
      {
        roomCode,
        nickname: normalizeNickname(currentNickname),
        guestId: state.guestId,
        sessionId: state.sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        if (refs.socketRef.current !== socket) {
          return;
        }

        if (!response.ok) {
          actions.failPendingRoomCreate(
            response.error === "Realtime request timed out."
              ? "ルーム作成の応答がありませんでした。接続を確認して、もう一度お試しください。"
              : response.error
          );
          actions.disconnectCurrentSocket();
          return;
        }

        refs.createPendingRef.current = false;
        actions.setCreatePending(false);
        actions.setError("");
        actions.setCopyFeedback({ kind: "idle", message: "" });
        actions.setPlayerId(response.data.playerId);
        refs.storedRoomCodeRef.current = response.data.roomCode;
        actions.setRoom(response.data.room);
        window.localStorage.setItem(storageKey, response.data.roomCode);
        actions.updateGuestSession();
        actions.clearPracticeState();
        actions.resetTyping();
      }
    );
  }, [actions, realtimeUnavailableMessage, refs, state.guestId, state.realtimeConfigured, state.sessionId, storageKey]);

  const joinRoom = useCallback(() => {
    const currentNickname = refs.nicknameRef.current;
    const roomCode = state.joinCode.trim().toUpperCase();
    const validationError = validateNickname(currentNickname);

    actions.setError("");
    if (!roomCode) {
      actions.setError("ルームコードを入力してください。");
      return;
    }

    if (!state.realtimeConfigured || validationError || !state.guestId) {
      actions.setError(validationError ?? realtimeUnavailableMessage);
      actions.setHomeMode(null);
      return;
    }

    void primeSoundPlayback();
    const socket = actions.connectRoomSocket(roomCode);
    actions.setJoinPending(true);
    socket.emit(
      "room:join",
      {
        roomCode,
        nickname: normalizeNickname(currentNickname),
        guestId: state.guestId,
        sessionId: state.sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        actions.setJoinPending(false);
        if (refs.socketRef.current !== socket) {
          return;
        }

        if (!response.ok) {
          actions.setError(response.error);
          actions.disconnectCurrentSocket();
          return;
        }

        actions.setError("");
        actions.setPlayerId(response.data.playerId);
        refs.storedRoomCodeRef.current = response.data.room.roomCode;
        actions.setRoom(response.data.room);
        window.localStorage.setItem(storageKey, response.data.room.roomCode);
        actions.updateGuestSession();
        actions.clearPracticeState();
        actions.resetTyping();
      }
    );
  }, [actions, realtimeUnavailableMessage, refs, state.guestId, state.joinCode, state.realtimeConfigured, state.sessionId, storageKey]);

  const leaveRoom = useCallback(() => {
    const socket = refs.socketRef.current;
    if (socket && state.room) {
      socket.emit("room:leave", { roomCode: state.room.roomCode });
    }

    actions.resetStoredRoomRecovery({ removeStoredCode: true });
    actions.setHomeMode(null);
    actions.disconnectCurrentSocket();
    actions.setRoom(null);
    actions.setResult(null);
    actions.setPlayerId("");
    actions.clearPracticeState();
    actions.resetTyping();
    actions.setExitRequest(null);
  }, [actions, refs.socketRef, state.room]);

  const setReady = useCallback(() => {
    if (
      !state.realtimeConfigured
      || !refs.socketRef.current
      || !state.room
      || !state.currentPlayer
    ) {
      return;
    }

    actions.prepareTypingInput();
    refs.socketRef.current.emit("player:ready", {
      roomCode: state.room.roomCode,
      ready: !state.currentPlayer.ready
    });
  }, [actions, refs.socketRef, state.currentPlayer, state.realtimeConfigured, state.room]);

  const startMatch = useCallback(() => {
    const socket = refs.socketRef.current;
    if (!state.realtimeConfigured || !socket || !state.room) {
      return false;
    }

    actions.prepareTypingInput();
    void primeSoundPlayback();
    socket.emit("match:start", { roomCode: state.room.roomCode }, (response) => {
      if (refs.socketRef.current !== socket) {
        return;
      }
      if (!response.ok) {
        actions.setError(response.error);
        refs.autoStartRoomRef.current = null;
      }
    });
    return true;
  }, [actions, refs, state.realtimeConfigured, state.room]);

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startMatch
  };
}
