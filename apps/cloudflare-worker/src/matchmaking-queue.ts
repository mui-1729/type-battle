import { createRoomCode, type DeviceKind } from "@type-battle/shared";

export type MatchmakingTicket = {
  ticketId: string;
  guestId: string;
  sessionId: string;
  socketId: string;
  nickname: string;
  deviceKind: DeviceKind;
  blockedGuestIds: readonly string[];
  createdAt: number;
  expiresAt: number;
};

export type MatchmakingMatch = {
  roomCode: string;
  host: MatchmakingTicket;
  guest: MatchmakingTicket;
};

export type MatchmakingJoinResult =
  | { kind: "queued"; ticket: MatchmakingTicket }
  | { kind: "matched"; match: MatchmakingMatch };

export type MatchmakingQueueOptions = {
  ticketTtlMs?: number;
  createTicketId?: () => string;
  createRoomCode?: () => string;
};

type JoinInput = {
  guestId: string;
  sessionId?: string;
  socketId: string;
  nickname: string;
  deviceKind?: DeviceKind;
  blockedGuestIds?: readonly string[];
};

const DEFAULT_TICKET_TTL_MS = 25_000;
const MAX_BLOCKED_GUEST_IDS = 100;

export class MatchmakingQueue {
  private readonly ticketsByGuestId = new Map<string, MatchmakingTicket>();
  private readonly ticketTtlMs: number;
  private readonly createTicketId: () => string;
  private readonly createMatchRoomCode: () => string;

  constructor(options: MatchmakingQueueOptions = {}) {
    this.ticketTtlMs = options.ticketTtlMs ?? DEFAULT_TICKET_TTL_MS;
    this.createTicketId = options.createTicketId ?? (() => crypto.randomUUID());
    this.createMatchRoomCode = options.createRoomCode ?? createRoomCode;
  }

  get size(): number {
    return this.ticketsByGuestId.size;
  }

  join(input: JoinInput, now = Date.now()): MatchmakingJoinResult {
    this.expire(now);

    const guestId = input.guestId.trim();
    // Gateway protocol validation always supplies a real session/device. The
    // fallback keeps the pure queue API compatible with older internal tests.
    const sessionId = input.sessionId?.trim() || guestId;
    const socketId = input.socketId.trim();
    const nickname = input.nickname.trim();
    const blockedGuestIds = normalizeBlockedGuestIds(input.blockedGuestIds, guestId);

    if (!guestId || !sessionId || !socketId || !nickname) {
      throw new Error("guestId, sessionId, socketId and nickname are required.");
    }

    // Rejoining with the same guest ID refreshes the existing ticket instead
    // of creating a second queue position.
    this.ticketsByGuestId.delete(guestId);

    const incomingTicket: MatchmakingTicket = {
      ticketId: this.createTicketId(),
      guestId,
      sessionId,
      socketId,
      nickname,
      deviceKind: input.deviceKind ?? "desktop",
      blockedGuestIds,
      createdAt: now,
      expiresAt: now + this.ticketTtlMs
    };

    const candidate = this.findCompatibleCandidate(incomingTicket);
    if (candidate) {
      this.ticketsByGuestId.delete(candidate.guestId);
      return {
        kind: "matched",
        match: {
          roomCode: this.createMatchRoomCode(),
          host: candidate,
          guest: incomingTicket
        }
      };
    }

    this.ticketsByGuestId.set(guestId, incomingTicket);
    return { kind: "queued", ticket: incomingTicket };
  }

  cancelGuest(guestId: string): MatchmakingTicket | null {
    const normalizedGuestId = guestId.trim();
    const ticket = this.ticketsByGuestId.get(normalizedGuestId) ?? null;
    if (ticket) {
      this.ticketsByGuestId.delete(normalizedGuestId);
    }
    return ticket;
  }

  removeSocket(socketId: string): MatchmakingTicket[] {
    const normalizedSocketId = socketId.trim();
    const removed: MatchmakingTicket[] = [];

    for (const [guestId, ticket] of this.ticketsByGuestId) {
      if (ticket.socketId !== normalizedSocketId) {
        continue;
      }

      this.ticketsByGuestId.delete(guestId);
      removed.push(ticket);
    }

    return removed;
  }

  expire(now = Date.now()): MatchmakingTicket[] {
    const expired: MatchmakingTicket[] = [];

    for (const [guestId, ticket] of this.ticketsByGuestId) {
      if (ticket.expiresAt > now) {
        continue;
      }

      this.ticketsByGuestId.delete(guestId);
      expired.push(ticket);
    }

    return expired;
  }

  snapshot(): MatchmakingTicket[] {
    return [...this.ticketsByGuestId.values()].sort(
      (left, right) => left.createdAt - right.createdAt || left.ticketId.localeCompare(right.ticketId)
    );
  }

  private findCompatibleCandidate(incoming: MatchmakingTicket): MatchmakingTicket | null {
    for (const candidate of this.snapshot()) {
      if (ticketsCanMatch(candidate, incoming)) {
        return candidate;
      }
    }

    return null;
  }
}

export function ticketsCanMatch(left: MatchmakingTicket, right: MatchmakingTicket): boolean {
  if (left.guestId === right.guestId) {
    return false;
  }

  return (
    !left.blockedGuestIds.includes(right.guestId) &&
    !right.blockedGuestIds.includes(left.guestId)
  );
}

function normalizeBlockedGuestIds(
  values: readonly string[] | undefined,
  ownGuestId: string
): string[] {
  if (!values) {
    return [];
  }

  const uniqueValues = new Set<string>();
  for (const value of values) {
    const guestId = value.trim();
    if (!guestId || guestId === ownGuestId) {
      continue;
    }

    uniqueValues.add(guestId);
    if (uniqueValues.size >= MAX_BLOCKED_GUEST_IDS) {
      break;
    }
  }

  return [...uniqueValues];
}
