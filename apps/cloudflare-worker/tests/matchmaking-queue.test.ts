import { describe, expect, it } from "vitest";
import { MatchmakingQueue, ticketsCanMatch } from "../src/matchmaking-queue";

function createQueue(ticketTtlMs = 25_000) {
  let ticketNumber = 0;
  let roomNumber = 0;
  return new MatchmakingQueue({
    ticketTtlMs,
    createTicketId: () => `ticket-${++ticketNumber}`,
    createRoomCode: () => `ROOM${++roomNumber}`
  });
}

describe("MatchmakingQueue", () => {
  it("queues the first guest and matches the second guest", () => {
    const queue = createQueue();

    const first = queue.join({ guestId: "guest_a", socketId: "socket_a", nickname: "A" }, 1_000);
    const second = queue.join({ guestId: "guest_b", socketId: "socket_b", nickname: "B" }, 2_000);

    expect(first.kind).toBe("queued");
    expect(second).toMatchObject({
      kind: "matched",
      match: {
        roomCode: "ROOM1",
        host: { guestId: "guest_a", socketId: "socket_a" },
        guest: { guestId: "guest_b", socketId: "socket_b" }
      }
    });
    expect(queue.size).toBe(0);
  });

  it("refreshes a guest without creating duplicate queue positions", () => {
    const queue = createQueue();

    queue.join({ guestId: "guest_a", socketId: "socket_old", nickname: "Before" }, 1_000);
    queue.join({ guestId: "guest_a", socketId: "socket_new", nickname: "After" }, 2_000);

    expect(queue.size).toBe(1);
    expect(queue.snapshot()).toMatchObject([
      { guestId: "guest_a", socketId: "socket_new", nickname: "After", createdAt: 2_000 }
    ]);
  });

  it("does not pair guests when either side blocks the other", () => {
    const queue = createQueue();

    queue.join(
      {
        guestId: "guest_a",
        socketId: "socket_a",
        nickname: "A",
        blockedGuestIds: ["guest_b"]
      },
      1_000
    );
    const result = queue.join(
      { guestId: "guest_b", socketId: "socket_b", nickname: "B" },
      2_000
    );

    expect(result.kind).toBe("queued");
    expect(queue.snapshot().map((ticket) => ticket.guestId)).toEqual(["guest_a", "guest_b"]);
  });

  it("skips incompatible tickets and matches the oldest compatible guest", () => {
    const queue = createQueue();

    queue.join(
      {
        guestId: "guest_blocked",
        socketId: "socket_blocked",
        nickname: "Blocked",
        blockedGuestIds: ["guest_ok", "guest_c"]
      },
      1_000
    );
    queue.join({ guestId: "guest_ok", socketId: "socket_ok", nickname: "OK" }, 2_000);
    const result = queue.join({ guestId: "guest_c", socketId: "socket_c", nickname: "C" }, 3_000);

    expect(result).toMatchObject({
      kind: "matched",
      match: { host: { guestId: "guest_ok" }, guest: { guestId: "guest_c" } }
    });
    expect(queue.snapshot().map((ticket) => ticket.guestId)).toEqual(["guest_blocked"]);
  });

  it("cancels by guest and removes disconnected sockets", () => {
    const queue = createQueue();

    queue.join({ guestId: "guest_a", socketId: "socket_a", nickname: "A" }, 1_000);
    queue.join({ guestId: "guest_b", socketId: "socket_b", nickname: "B", blockedGuestIds: ["guest_a"] }, 2_000);

    expect(queue.cancelGuest("guest_a")?.guestId).toBe("guest_a");
    expect(queue.removeSocket("socket_b").map((ticket) => ticket.guestId)).toEqual(["guest_b"]);
    expect(queue.size).toBe(0);
  });

  it("expires stale tickets before matching", () => {
    const queue = createQueue(1_000);

    queue.join({ guestId: "guest_stale", socketId: "socket_stale", nickname: "Stale" }, 1_000);
    const result = queue.join({ guestId: "guest_new", socketId: "socket_new", nickname: "New" }, 2_001);

    expect(result.kind).toBe("queued");
    expect(queue.snapshot().map((ticket) => ticket.guestId)).toEqual(["guest_new"]);
  });

  it("normalizes and caps blocked guest IDs", () => {
    const queue = createQueue();
    const blockedGuestIds = Array.from({ length: 120 }, (_, index) => ` guest_${index} `);

    queue.join({
      guestId: "guest_self",
      socketId: "socket_self",
      nickname: "Self",
      blockedGuestIds: ["guest_self", "", ...blockedGuestIds, "guest_0"]
    });

    const [ticket] = queue.snapshot();
    expect(ticket?.blockedGuestIds).toHaveLength(100);
    expect(ticket?.blockedGuestIds).not.toContain("guest_self");
    expect(ticket?.blockedGuestIds[0]).toBe("guest_0");
  });
});

describe("ticketsCanMatch", () => {
  const base = {
    ticketId: "ticket",
    sessionId: "session",
    socketId: "socket",
    nickname: "Player",
    deviceKind: "desktop" as const,
    createdAt: 0,
    expiresAt: 1_000,
    blockedGuestIds: [] as string[]
  };

  it("rejects the same guest ID and symmetric blocks", () => {
    expect(ticketsCanMatch({ ...base, guestId: "guest_a" }, { ...base, ticketId: "ticket2", guestId: "guest_a" })).toBe(false);
    expect(
      ticketsCanMatch(
        { ...base, guestId: "guest_a", blockedGuestIds: ["guest_b"] },
        { ...base, ticketId: "ticket2", guestId: "guest_b" }
      )
    ).toBe(false);
    expect(
      ticketsCanMatch(
        { ...base, guestId: "guest_a" },
        { ...base, ticketId: "ticket2", guestId: "guest_b", blockedGuestIds: ["guest_a"] }
      )
    ).toBe(false);
  });
});
