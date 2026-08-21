import { useCallback, useEffect, useRef } from "react";
import { normalizeNickname, type MatchResult, type RoomState } from "@type-battle/shared";
import type { GuestSession } from "../../lib/guest-session";
import { detectDeviceKind } from "./device-kind";
import type { RealtimeSocket } from "./realtime-client";
import {
  getStoredRoomJoinFailureAction,
  getStoredRoomRejoinDelayMs,
  type StoredRoomRecoveryState
} from "./room-reconnect";

type RefBox<T> = { current: T };
type Setter<T> = (value: T) => void;

type StoredRoomRecoveryRefs = {
  socketRef: RefBox<RealtimeSocket | null>;
  socketModeRef: RefBox<"practice" | "room" | null>;
  guestSessionRef: RefBox<GuestSession | null>;
  nicknameRef: RefBox<string>;
  roomRef: RefBox<RoomState | null>;
  resultRef: RefBox<MatchResult | null>;
  storedRoomCodeRef: RefBox<string | null>;
  storedRoomJoinInFlightRef: RefBox<boolean>;
  attemptStoredRoomJoinRef: RefBox<(socket: RealtimeSocket) => void>;
};

type StoredRoomRecoveryActions = {
  setStoredRoomRecovery: Setter<StoredRoomRecoveryState>;
  setError: Setter<string>;
  setPlayerId: Setter<string>;
  setRoom: Setter<RoomState | null>;
  setResult: Setter<MatchResult | null>;
  resetTyping: () => void;
  updateGuestSession: () => void;
  clearPracticeState: () => void;
  connectRoomSocket: (roomCode: string) => RealtimeSocket;
  disconnectCurrentSocket: () => void;
};

type UseStoredRoomRecoveryInput = {
  storageKey: string;
  refs: StoredRoomRecoveryRefs;
  actions: StoredRoomRecoveryActions;
};

type ResetStoredRoomRecoveryOptions = {
  removeStoredCode?: boolean;
};

export function useStoredRoomRecovery({
  storageKey,
  refs,
  actions
}: UseStoredRoomRecoveryInput) {
  const storedRoomJoinAttemptsRef = useRef(0);
  const storedRoomRetryTimerRef = useRef<number | null>(null);

  const clearStoredRoomRetryTimer = useCallback(() => {
    if (storedRoomRetryTimerRef.current !== null) {
      window.clearTimeout(storedRoomRetryTimerRef.current);
      storedRoomRetryTimerRef.current = null;
    }
  }, []);

  const resetStoredRoomRecovery = useCallback(
    ({ removeStoredCode = false }: ResetStoredRoomRecoveryOptions = {}) => {
      clearStoredRoomRetryTimer();
      storedRoomJoinAttemptsRef.current = 0;
      refs.storedRoomJoinInFlightRef.current = false;
      if (removeStoredCode) {
        refs.storedRoomCodeRef.current = null;
        window.localStorage.removeItem(storageKey);
      }
      actions.setStoredRoomRecovery({ status: "idle", message: "" });
    },
    [actions, clearStoredRoomRetryTimer, refs, storageKey]
  );

  const discardStoredRoom = useCallback(
    (message: string) => {
      resetStoredRoomRecovery({ removeStoredCode: true });
      actions.setError(message);
      actions.disconnectCurrentSocket();
    },
    [actions, resetStoredRoomRecovery]
  );

  const attemptStoredRoomJoin = useCallback(
    (socket: RealtimeSocket) => {
      const storedRoomCode = refs.storedRoomCodeRef.current;
      const currentSession = refs.guestSessionRef.current;

      if (!storedRoomCode || !currentSession || refs.storedRoomJoinInFlightRef.current) {
        return;
      }

      clearStoredRoomRetryTimer();
      refs.storedRoomJoinInFlightRef.current = true;
      storedRoomJoinAttemptsRef.current += 1;
      const attempts = storedRoomJoinAttemptsRef.current;
      actions.setStoredRoomRecovery({
        status: "reconnecting",
        message: `保存済みルームへ再接続しています（${attempts}/5）…`
      });

      socket.emit(
        "room:join",
        {
          roomCode: storedRoomCode,
          nickname: normalizeNickname(refs.nicknameRef.current),
          guestId: currentSession.guestId,
          sessionId: currentSession.sessionId,
          deviceKind: detectDeviceKind()
        },
        (response) => {
          if (refs.socketRef.current !== socket) {
            return;
          }

          refs.storedRoomJoinInFlightRef.current = false;

          if (response.ok) {
            storedRoomJoinAttemptsRef.current = 0;
            refs.storedRoomCodeRef.current = response.data.room.roomCode;
            actions.setStoredRoomRecovery({ status: "idle", message: "" });
            actions.setError("");
            actions.setPlayerId(response.data.playerId);
            actions.resetTyping();
            refs.roomRef.current = response.data.room;
            refs.resultRef.current = response.data.room.result ?? null;
            actions.setRoom(response.data.room);
            actions.setResult(response.data.room.result ?? null);
            actions.updateGuestSession();
            actions.clearPracticeState();
            return;
          }

          const action = getStoredRoomJoinFailureAction(response.error, attempts);
          if (action === "discard") {
            discardStoredRoom(response.error);
            return;
          }

          if (action === "pause") {
            actions.setStoredRoomRecovery({
              status: "failed",
              message: "ルームへの再接続を一時停止しました。接続を確認して再試行してください。"
            });
            return;
          }

          const delay = getStoredRoomRejoinDelayMs(attempts);
          actions.setStoredRoomRecovery({
            status: "reconnecting",
            message: `再接続に失敗しました。約 ${Math.ceil(delay / 1000)} 秒後に再試行します。`
          });
          storedRoomRetryTimerRef.current = window.setTimeout(() => {
            storedRoomRetryTimerRef.current = null;
            if (refs.socketRef.current !== socket) {
              return;
            }
            refs.attemptStoredRoomJoinRef.current(socket);
          }, delay);
        }
      );
    },
    [actions, clearStoredRoomRetryTimer, discardStoredRoom, refs]
  );

  useEffect(() => {
    refs.attemptStoredRoomJoinRef.current = attemptStoredRoomJoin;
  }, [attemptStoredRoomJoin, refs.attemptStoredRoomJoinRef]);

  const retryStoredRoomJoin = useCallback(() => {
    const storedRoomCode = refs.storedRoomCodeRef.current;
    if (!storedRoomCode) {
      actions.setStoredRoomRecovery({ status: "idle", message: "" });
      return;
    }

    storedRoomJoinAttemptsRef.current = 0;
    actions.setStoredRoomRecovery({
      status: "reconnecting",
      message: "保存済みルームへ再接続しています…"
    });
    const socket = refs.socketRef.current;

    if (socket && refs.socketModeRef.current === "room" && socket.isConnected()) {
      refs.attemptStoredRoomJoinRef.current(socket);
      return;
    }

    actions.connectRoomSocket(storedRoomCode);
  }, [actions, refs]);

  return {
    clearStoredRoomRetryTimer,
    resetStoredRoomRecovery,
    retryStoredRoomJoin
  };
}
