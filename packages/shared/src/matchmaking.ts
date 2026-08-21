import type { DeviceKind } from "./game-state.js";

export type MatchmakingPlayerSummary = {
  id: string;
  nickname: string;
};

export type QuickMatchJoinPayload = {
  guestId: string;
  sessionId: string;
  nickname: string;
  deviceKind: DeviceKind;
  blockedGuestIds?: string[];
};

export type QuickMatchCancelPayload = {
  guestId: string;
  sessionId: string;
  ticketId: string;
  matchId?: string;
};

export type QuickMatchHostReadyPayload = {
  ticketId: string;
  matchId: string;
};

export type MatchmakingMatchedPayload = {
  roomCode: string;
  role: "host" | "guest";
  ticketId: string;
  matchId: string;
  opponent: MatchmakingPlayerSummary;
};

export type MatchmakingAssignedHostPayload = MatchmakingMatchedPayload & {
  role: "host";
  hostReadyDeadlineAt: number;
};

export type MatchmakingWaitingHostPayload = {
  role: "guest";
  ticketId: string;
  matchId: string;
  hostReadyDeadlineAt: number;
  opponent: MatchmakingPlayerSummary;
};

export type MatchmakingJoinResponse =
  | {
      status: "queued";
      ticketId: string;
      expiresAt: number;
    }
  | ({ status: "assignedHost" } & MatchmakingAssignedHostPayload)
  | ({ status: "waitingHost" } & MatchmakingWaitingHostPayload);

export type MatchmakingTimeoutPayload = {
  ticketId: string;
  matchId?: string;
  phase: "queue" | "host";
  fallback: "com";
};

export type MatchmakingFailurePayload = {
  ticketId: string;
  matchId?: string;
  reason: "bootstrap" | "cancelled" | "disconnected" | "capacity";
  retryable: boolean;
};

export const MATCHMAKING_MAX_IDENTIFIER_LENGTH = 96;
export const MATCHMAKING_MAX_BLOCKED_GUEST_IDS = 100;
export const MATCHMAKING_QUEUE_TTL_MS = 25_000;
export const MATCHMAKING_HOST_READY_TTL_MS = 10_000;
