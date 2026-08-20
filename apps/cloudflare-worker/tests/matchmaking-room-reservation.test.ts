import { describe, expect, it } from "vitest";
import {
  claimMatchmakingReservation,
  createMatchmakingRoomReservation,
  isMatchmakingReservationComplete,
  isMatchmakingReservationExpired,
  parseMatchmakingRoomReservation
} from "../src/matchmaking-room-reservation";

function createReservation() {
  const tokens = ["claim-token-host-0001", "claim-token-guest-0002"];
  let tokenIndex = 0;

  return createMatchmakingRoomReservation(
    {
      roomCode: "ab23cd",
      host: { guestId: "guest_host", nickname: " Host " },
      guest: { guestId: "guest_guest", nickname: "Guest" }
    },
    {
      now: 1_000,
      ttlMs: 30_000,
      createClaimToken: () => tokens[tokenIndex++]!
    }
  );
}

describe("matchmaking room reservation", () => {
  it("normalizes identities and keeps assigned host/guest with distinct claim tokens", () => {
    const reservation = createReservation();

    expect(reservation).toMatchObject({
      schemaVersion: 1,
      roomCode: "AB23CD",
      createdAt: 1_000,
      expiresAt: 31_000,
      host: {
        guestId: "guest_host",
        nickname: "Host",
        claimToken: "claim-token-host-0001"
      },
      guest: {
        guestId: "guest_guest",
        nickname: "Guest",
        claimToken: "claim-token-guest-0002"
      }
    });
    expect(reservation.host.claimToken).not.toBe(reservation.guest.claimToken);
  });

  it("allows guest to claim before host without changing assigned roles", () => {
    const initial = createReservation();
    const guestClaim = claimMatchmakingReservation(
      initial,
      {
        guestId: "guest_guest",
        claimToken: initial.guest.claimToken,
        sessionId: "session_guest"
      },
      2_000
    );

    expect(guestClaim).toMatchObject({ ok: true, role: "guest" });
    if (!guestClaim.ok) {
      return;
    }
    expect(guestClaim.reservation.host.guestId).toBe("guest_host");
    expect(guestClaim.reservation.guest.claimedSessionId).toBe("session_guest");
    expect(isMatchmakingReservationComplete(guestClaim.reservation)).toBe(false);

    const hostClaim = claimMatchmakingReservation(
      guestClaim.reservation,
      {
        guestId: "guest_host",
        claimToken: initial.host.claimToken,
        sessionId: "session_host"
      },
      3_000
    );

    expect(hostClaim).toMatchObject({ ok: true, role: "host" });
    if (hostClaim.ok) {
      expect(isMatchmakingReservationComplete(hostClaim.reservation)).toBe(true);
    }
  });

  it("allows an idempotent claim from the same session and rejects session takeover", () => {
    const initial = createReservation();
    const first = claimMatchmakingReservation(
      initial,
      {
        guestId: "guest_host",
        claimToken: initial.host.claimToken,
        sessionId: "session_host"
      },
      2_000
    );

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    expect(
      claimMatchmakingReservation(
        first.reservation,
        {
          guestId: "guest_host",
          claimToken: initial.host.claimToken,
          sessionId: "session_host"
        },
        3_000
      )
    ).toMatchObject({ ok: true, role: "host" });

    expect(
      claimMatchmakingReservation(
        first.reservation,
        {
          guestId: "guest_host",
          claimToken: initial.host.claimToken,
          sessionId: "session_other"
        },
        3_000
      )
    ).toEqual({ ok: false, reason: "session_mismatch" });
  });

  it("rejects wrong tokens and expired reservations", () => {
    const reservation = createReservation();

    expect(
      claimMatchmakingReservation(
        reservation,
        {
          guestId: "guest_host",
          claimToken: "claim-token-wrong-0000",
          sessionId: "session_host"
        },
        2_000
      )
    ).toEqual({ ok: false, reason: "invalid_claim" });

    expect(isMatchmakingReservationExpired(reservation, 31_000)).toBe(true);
    expect(
      claimMatchmakingReservation(
        reservation,
        {
          guestId: "guest_host",
          claimToken: reservation.host.claimToken,
          sessionId: "session_host"
        },
        31_000
      )
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("round-trips persisted reservations and rejects corrupted records", () => {
    const reservation = createReservation();
    const persisted = JSON.parse(JSON.stringify(reservation)) as unknown;

    expect(parseMatchmakingRoomReservation(persisted)).toEqual(reservation);
    expect(
      parseMatchmakingRoomReservation({
        ...reservation,
        guest: { ...reservation.guest, guestId: reservation.host.guestId }
      })
    ).toBeNull();
    expect(
      parseMatchmakingRoomReservation({
        ...reservation,
        guest: { ...reservation.guest, claimToken: reservation.host.claimToken }
      })
    ).toBeNull();
    expect(
      parseMatchmakingRoomReservation({
        ...reservation,
        expiresAt: reservation.createdAt + 10 * 60_000
      })
    ).toBeNull();
  });

  it("rejects duplicate guests and duplicate generated claim tokens", () => {
    expect(() =>
      createMatchmakingRoomReservation(
        {
          roomCode: "AB23CD",
          host: { guestId: "same_guest", nickname: "Host" },
          guest: { guestId: "same_guest", nickname: "Guest" }
        },
        { createClaimToken: () => "claim-token-shared-0000" }
      )
    ).toThrow("two distinct guests");

    expect(() =>
      createMatchmakingRoomReservation(
        {
          roomCode: "AB23CD",
          host: { guestId: "guest_host", nickname: "Host" },
          guest: { guestId: "guest_guest", nickname: "Guest" }
        },
        { createClaimToken: () => "claim-token-shared-0000" }
      )
    ).toThrow("claim tokens must be unique");
  });
});
