import { normalizeNickname } from "@type-battle/shared";
import type { MatchResult, QuickReaction, RoomState } from "@type-battle/shared";
import { detectDeviceKind } from "./device-kind";
import {
  createReactionErrorFeedback,
  replaceReactionDisplayTimer,
  type ReactionFeedback
} from "./reaction-feedback";
import type { RealtimeSocket } from "./realtime-client";
import type { RealtimeConnectionMode } from "./realtime-connection-controller";
import { getRoomDisconnectRecoveryState, type StoredRoomRecoveryState } from "./room-reconnect";
import { resolveRoomSnapshot } from "./room-state-order";

type RefBox<T> = {
  current: T;
};

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type GuestSessionIdentity = {
  guestId: string;
  sessionId: string;
};

type ReactionSettings = {
  reactionsEnabled: boolean;
};

type RemoteReaction = {
  playerId: string;
  reaction: QuickReaction;
};

export type RoomSocketHandlerContext = {
  socketRef: RefBox<RealtimeSocket | null>;
  roomRef: RefBox<RoomState | null>;
  resultRef: RefBox<MatchResult | null>;
  createPendingRef: RefBox<boolean>;
  typingInputRef: RefBox<HTMLTextAreaElement | null>;
  guestSessionRef: RefBox<GuestSessionIdentity | null>;
  attemptStoredRoomJoinRef: RefBox<(socket: RealtimeSocket) => void>;
  nicknameRef: RefBox<string>;
  storedRoomCodeRef: RefBox<string | null>;
  reactionRequestPendingRef: RefBox<boolean>;
  settingsRef: RefBox<ReactionSettings>;
  playerIdRef: RefBox<string>;
  remoteReactionTimerRef: RefBox<number | null>;
  setConnected: StateSetter<boolean>;
  setRoom: StateSetter<RoomState | null>;
  setResult: StateSetter<MatchResult | null>;
  setStoredRoomRecovery: StateSetter<StoredRoomRecoveryState>;
  setError: StateSetter<string>;
  setPlayerId: StateSetter<string>;
  setReactionFeedback: StateSetter<ReactionFeedback>;
  setCountdownMs: StateSetter<number>;
  setRemoteReaction: StateSetter<RemoteReaction | null>;
  setRematchError: StateSetter<string>;
  setRematchPending: StateSetter<boolean>;
  failPendingRoomCreate: (message: string) => void;
  resetTyping: () => void;
};

export function bindRoomSocketHandlers({
  socket,
  mode,
  context
}: {
  socket: RealtimeSocket;
  mode: RealtimeConnectionMode;
  context: RoomSocketHandlerContext;
}): void {
  const isCurrentSocket = () => context.socketRef.current === socket;
  const applyRoomSnapshot = (nextRoom: RoomState, beforeApply?: () => void) => {
    if (!isCurrentSocket()) {
      return false;
    }
    if (mode === "room" && context.createPendingRef.current && !context.roomRef.current) {
      return false;
    }

    const resolution = resolveRoomSnapshot(context.roomRef.current, context.resultRef.current, nextRoom);
    if (!resolution.accepted) {
      return false;
    }
    beforeApply?.();
    context.roomRef.current = resolution.room;
    context.resultRef.current = resolution.result;
    context.setRoom(resolution.room);
    context.setResult(resolution.result);

    if (nextRoom.status === "finished" || resolution.result) {
      context.typingInputRef.current?.blur();
    }
    return true;
  };

  socket.on("connect", () => {
    if (!isCurrentSocket()) {
      return;
    }

    context.setConnected(true);
    const currentRoom = context.roomRef.current;
    const currentSession = context.guestSessionRef.current;

    if (mode !== "room") {
      return;
    }

    if (!currentRoom || !currentSession) {
      context.attemptStoredRoomJoinRef.current(socket);
      return;
    }

    socket.emit(
      "room:join",
      {
        roomCode: currentRoom.roomCode,
        nickname: normalizeNickname(context.nicknameRef.current),
        guestId: currentSession.guestId,
        sessionId: currentSession.sessionId,
        deviceKind: detectDeviceKind()
      },
      (response) => {
        if (!isCurrentSocket()) {
          return;
        }

        if (!response.ok) {
          context.setError(response.error);
          context.setStoredRoomRecovery({
            status: "failed",
            message: "ルームへの再接続に失敗しました。接続を確認して再試行してください。"
          });
          return;
        }

        context.setStoredRoomRecovery({ status: "idle", message: "" });
        context.setError("");
        context.setPlayerId(response.data.playerId);
        context.storedRoomCodeRef.current = response.data.room.roomCode;
        applyRoomSnapshot(response.data.room, context.resetTyping);
      }
    );
  });

  socket.on("disconnect", ({ reason, willReconnect }) => {
    if (!isCurrentSocket()) {
      return;
    }

    context.setConnected(false);
    if (mode === "room" && context.createPendingRef.current && !context.roomRef.current) {
      context.failPendingRoomCreate(
        reason
          ? `ルーム作成中に接続が切れました（${reason}）。接続を確認して、もう一度お試しください。`
          : "ルーム作成中に接続が切れました。接続を確認して、もう一度お試しください。"
      );
    }
    context.reactionRequestPendingRef.current = false;
    context.setReactionFeedback((current) =>
      current.phase === "sending"
        ? createReactionErrorFeedback("接続が切れたため、リアクションを送信できませんでした。")
        : current
    );
    if (mode === "room") {
      context.setStoredRoomRecovery(getRoomDisconnectRecoveryState({ reason, willReconnect }));
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
    if (!applyRoomSnapshot(nextRoom, context.resetTyping)) {
      return;
    }
    context.setCountdownMs(Math.max(serverStartAt - Date.now(), 0));
  });

  socket.on("match:started", (nextRoom) => {
    if (!isCurrentSocket()) {
      return;
    }
    if (!applyRoomSnapshot(nextRoom, context.resetTyping)) {
      return;
    }
    context.setCountdownMs(0);
  });

  socket.on("match:result", (nextResult) => {
    const currentRoom = context.roomRef.current;
    if (!isCurrentSocket() || !currentRoom || currentRoom.roomCode !== nextResult.roomCode) {
      return;
    }

    context.resultRef.current = nextResult;
    context.setResult(nextResult);
    context.setCountdownMs(0);
    const finishedRoom = {
      ...currentRoom,
      status: "finished" as const,
      result: nextResult
    };
    context.roomRef.current = finishedRoom;
    context.setRoom(finishedRoom);
    context.typingInputRef.current?.blur();
  });

  socket.on("match:error", ({ message }) => {
    if (!isCurrentSocket()) {
      return;
    }
    if (mode === "room" && context.createPendingRef.current && !context.roomRef.current) {
      context.failPendingRoomCreate(
        "ルーム作成中に接続エラーが発生しました。接続を確認して、もう一度お試しください。"
      );
      return;
    }
    context.setError(message);
    context.setRematchError(message);
    context.setRematchPending(false);
  });

  socket.on("player:reaction", (payload) => {
    if (
      !isCurrentSocket() ||
      !context.settingsRef.current.reactionsEnabled ||
      payload.playerId === context.playerIdRef.current
    ) {
      return;
    }
    context.setRemoteReaction(payload);
    context.remoteReactionTimerRef.current = replaceReactionDisplayTimer(
      context.remoteReactionTimerRef.current,
      () => {
        context.remoteReactionTimerRef.current = null;
        context.setRemoteReaction(null);
      }
    );
  });
}
