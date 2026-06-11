export type GuestSession = {
  guestId: string;
  sessionId: string;
  createdAt: number;
  lastSeenAt: number;
};

export const GUEST_SESSION_STORAGE_KEY = "type-battle:guest-session";

export function createGuestSession(): GuestSession {
  const now = Date.now();

  return {
    guestId: createGuestId(),
    sessionId: createSessionId(),
    createdAt: now,
    lastSeenAt: now
  };
}

export function loadGuestSession(storage: Pick<Storage, "getItem" | "setItem">): GuestSession {
  const rawSession = storage.getItem(GUEST_SESSION_STORAGE_KEY);

  if (rawSession) {
    try {
      const parsedSession = JSON.parse(rawSession) as Partial<GuestSession>;

      if (
        typeof parsedSession.guestId === "string" &&
        typeof parsedSession.sessionId === "string" &&
        typeof parsedSession.createdAt === "number" &&
        typeof parsedSession.lastSeenAt === "number"
      ) {
        return {
          guestId: parsedSession.guestId,
          sessionId: parsedSession.sessionId,
          createdAt: parsedSession.createdAt,
          lastSeenAt: parsedSession.lastSeenAt
        };
      }
    } catch {
      // Fall through to migration / regeneration.
    }
  }

  const legacyGuestId = storage.getItem("type-battle:guest-id");
  const session = {
    guestId: legacyGuestId ?? createGuestId(),
    sessionId: createSessionId(),
    createdAt: Date.now(),
    lastSeenAt: Date.now()
  };

  persistGuestSession(storage, session);
  return session;
}

export function persistGuestSession(storage: Pick<Storage, "setItem">, session: GuestSession): void {
  storage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function touchGuestSession(session: GuestSession): GuestSession {
  return {
    ...session,
    lastSeenAt: Date.now()
  };
}

function createSessionId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function createGuestId(): string {
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
