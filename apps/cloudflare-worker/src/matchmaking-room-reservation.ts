import { isValidRoomCode, normalizeNickname, validateNickname } from "@type-battle/shared";
import { normalizeRoomCode } from "./room-routing.js";

export const MATCHMAKING_ROOM_RESERVATION_PATH = "/__internal/matchmaking-room-reservation";
export const MATCHMAKING_ROOM_RESERVATION_STORAGE_KEY = "matchmaking-room-reservation:v1";
export const MATCHMAKING_ROOM_RESERVATION_TTL_MS = 30_000;

const MAX_IDENTIFIER_LENGTH = 96;
const MAX_CLAIM_TOKEN_LENGTH = 128;
const MAX_RESERVATION_TTL_MS = 5 * 60_000;

export type MatchmakingReservationRole = "host" | "guest";

export type MatchmakingReservationPlayer = {
  guestId: string;
  nickname: string;
  claimToken: string;
  claimedSessionId?: string;
};

export type MatchmakingRoomReservation = {
  schemaVersion: 1;
  roomCode: string;
  createdAt: number;
  expiresAt: number;
  host: MatchmakingReservationPlayer;
  guest: MatchmakingReservationPlayer;
};

type ReservationIdentity = {
  guestId: string;
  nickname: string;
};

type CreateReservationInput = {
  roomCode: string;
  host: ReservationIdentity;
  guest: ReservationIdentity;
};

type CreateReservationOptions = {
  now?: number;
  ttlMs?: number;
  createClaimToken?: () => string;
};

export type MatchmakingReservationClaimResult =
  | {
      ok: true;
      role: MatchmakingReservationRole;
      reservation: MatchmakingRoomReservation;
    }
  | {
      ok: false;
      reason: "expired" | "invalid_claim" | "invalid_session" | "session_mismatch";
    };

export function createMatchmakingRoomReservation(
  input: CreateReservationInput,
  options: CreateReservationOptions = {}
): MatchmakingRoomReservation {
  const roomCode = normalizeRoomCode(input.roomCode);
  const host = normalizeIdentity(input.host);
  const guest = normalizeIdentity(input.guest);

  if (!isValidRoomCode(roomCode)) {
    throw new Error("Invalid matchmaking room code.");
  }
  if (host.guestId === guest.guestId) {
    throw new Error("Matchmaking reservation requires two distinct guests.");
  }

  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? MATCHMAKING_ROOM_RESERVATION_TTL_MS;
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_RESERVATION_TTL_MS) {
    throw new Error("Invalid matchmaking reservation lifetime.");
  }

  const createClaimToken = options.createClaimToken ?? (() => crypto.randomUUID());
  const hostClaimToken = normalizeClaimToken(createClaimToken());
  const guestClaimToken = normalizeClaimToken(createClaimToken());
  if (hostClaimToken === guestClaimToken) {
    throw new Error("Matchmaking claim tokens must be unique.");
  }

  return {
    schemaVersion: 1,
    roomCode,
    createdAt: now,
    expiresAt: now + ttlMs,
    host: {
      ...host,
      claimToken: hostClaimToken
    },
    guest: {
      ...guest,
      claimToken: guestClaimToken
    }
  };
}

export function parseMatchmakingRoomReservation(value: unknown): MatchmakingRoomReservation | null {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return null;
  }

  const roomCode = readRoomCode(value.roomCode);
  const createdAt = readFiniteNumber(value.createdAt);
  const expiresAt = readFiniteNumber(value.expiresAt);
  const host = parseReservationPlayer(value.host);
  const guest = parseReservationPlayer(value.guest);

  if (!roomCode || createdAt === null || expiresAt === null || !host || !guest) {
    return null;
  }
  if (expiresAt <= createdAt || expiresAt - createdAt > MAX_RESERVATION_TTL_MS) {
    return null;
  }
  if (host.guestId === guest.guestId || host.claimToken === guest.claimToken) {
    return null;
  }

  return {
    schemaVersion: 1,
    roomCode,
    createdAt,
    expiresAt,
    host,
    guest
  };
}

export function claimMatchmakingReservation(
  reservation: MatchmakingRoomReservation,
  input: {
    guestId: string;
    claimToken: string;
    sessionId: string;
  },
  now = Date.now()
): MatchmakingReservationClaimResult {
  if (isMatchmakingReservationExpired(reservation, now)) {
    return { ok: false, reason: "expired" };
  }

  const guestId = readIdentifier(input.guestId);
  const claimToken = readClaimToken(input.claimToken);
  const sessionId = readIdentifier(input.sessionId);
  if (!guestId || !claimToken) {
    return { ok: false, reason: "invalid_claim" };
  }
  if (!sessionId) {
    return { ok: false, reason: "invalid_session" };
  }

  const role = findReservationRole(reservation, guestId, claimToken);
  if (!role) {
    return { ok: false, reason: "invalid_claim" };
  }

  const player = reservation[role];
  if (player.claimedSessionId && player.claimedSessionId !== sessionId) {
    return { ok: false, reason: "session_mismatch" };
  }

  return {
    ok: true,
    role,
    reservation: {
      ...reservation,
      [role]: {
        ...player,
        claimedSessionId: sessionId
      }
    }
  };
}

export function isMatchmakingReservationComplete(reservation: MatchmakingRoomReservation): boolean {
  return Boolean(reservation.host.claimedSessionId && reservation.guest.claimedSessionId);
}

export function isMatchmakingReservationExpired(
  reservation: Pick<MatchmakingRoomReservation, "expiresAt">,
  now = Date.now()
): boolean {
  return now >= reservation.expiresAt;
}

export function getMatchmakingReservationPlayer(
  reservation: MatchmakingRoomReservation,
  role: MatchmakingReservationRole
): MatchmakingReservationPlayer {
  return reservation[role];
}

function findReservationRole(
  reservation: MatchmakingRoomReservation,
  guestId: string,
  claimToken: string
): MatchmakingReservationRole | null {
  if (reservation.host.guestId === guestId && reservation.host.claimToken === claimToken) {
    return "host";
  }
  if (reservation.guest.guestId === guestId && reservation.guest.claimToken === claimToken) {
    return "guest";
  }
  return null;
}

function normalizeIdentity(input: ReservationIdentity): ReservationIdentity {
  const guestId = readIdentifier(input.guestId);
  const nickname = typeof input.nickname === "string" ? normalizeNickname(input.nickname) : "";

  if (!guestId || validateNickname(nickname)) {
    throw new Error("Invalid matchmaking reservation identity.");
  }

  return { guestId, nickname };
}

function parseReservationPlayer(value: unknown): MatchmakingReservationPlayer | null {
  if (!isRecord(value)) {
    return null;
  }

  const guestId = readIdentifier(value.guestId);
  const nickname = typeof value.nickname === "string" ? normalizeNickname(value.nickname) : "";
  const claimToken = readClaimToken(value.claimToken);
  const claimedSessionId = value.claimedSessionId === undefined
    ? undefined
    : readIdentifier(value.claimedSessionId);

  if (!guestId || validateNickname(nickname) || !claimToken || (value.claimedSessionId !== undefined && !claimedSessionId)) {
    return null;
  }

  return {
    guestId,
    nickname,
    claimToken,
    ...(claimedSessionId ? { claimedSessionId } : {})
  };
}

function normalizeClaimToken(value: string): string {
  const claimToken = readClaimToken(value);
  if (!claimToken) {
    throw new Error("Invalid matchmaking claim token.");
  }
  return claimToken;
}

function readRoomCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const roomCode = normalizeRoomCode(value);
  return isValidRoomCode(roomCode) ? roomCode : null;
}

function readIdentifier(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_IDENTIFIER_LENGTH ? normalized : null;
}

function readClaimToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length >= 16 && normalized.length <= MAX_CLAIM_TOKEN_LENGTH ? normalized : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
