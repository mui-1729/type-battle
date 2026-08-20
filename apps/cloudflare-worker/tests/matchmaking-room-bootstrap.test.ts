import { describe, expect, it } from "vitest";
import { createMatchmakingRoomBootstrapSnapshot } from "../src/matchmaking-room-bootstrap";
import { createMatchmakingRoomReservation } from "../src/matchmaking-room-reservation";

function createReservation() {
  const tokens = ["claim-token-host-0001", "claim-token-guest-0002"];
  let tokenIndex = 0;

  return createMatchmakingRoomReservation(
    {
      roomCode: "AB23CD",
      host: { guestId: "guest_host", nickname: "Host" },
      guest: { guestId: "guest_guest", nickname: "Guest" }
    },
    {
      now: 1_000,
      ttlMs: 30_000,
      createClaimToken: () => tokens[tokenIndex++]!
    }
  );
}

describe("matchmaking room bootstrap snapshot", () => {
  it("preloads host first and binds both room sessions to claim tokens", () => {
    const reservation = createReservation();
    const snapshot = createMatchmakingRoomBootstrapSnapshot(reservation, 2_000);

    expect(snapshot).toMatchObject({
      schemaVersion: 2,
      room: {
        roomCode: "AB23CD",
        hostPlayerId: "guest_host",
        status: "waiting",
        matchRule: "race",
        botDifficulty: "normal",
        promptCategory: "standard",
        maxPlayers: 2,
        round: 1
      },
      playerSessions: {
        guest_host: "claim-token-host-0001",
        guest_guest: "claim-token-guest-0002"
      },
      disconnectedAt: {
        guest_host: 2_000,
        guest_guest: 2_000
      }
    });

    expect(snapshot.room.players.map((player) => player.id)).toEqual(["guest_host", "guest_guest"]);
    expect(snapshot.room.players[0]).toMatchObject({
      id: "guest_host",
      isHost: true,
      connected: false,
      ready: false
    });
    expect(snapshot.room.players[1]).toMatchObject({
      id: "guest_guest",
      isHost: false,
      connected: false,
      ready: false
    });
  });

  it("creates a waiting room with clean typing state", () => {
    const snapshot = createMatchmakingRoomBootstrapSnapshot(createReservation(), 2_000);

    for (const player of snapshot.room.players) {
      expect(player).toMatchObject({
        progressIndex: 0,
        typingProgressIndex: 0,
        pendingInput: "",
        correctCharacters: 0,
        totalTypedCharacters: 0,
        mistakes: 0,
        maxStreak: 0,
        currentStreak: 0,
        wpm: 0,
        accuracy: 100
      });
    }
  });

  it("rejects snapshot creation outside the reservation lifetime", () => {
    const reservation = createReservation();

    expect(() => createMatchmakingRoomBootstrapSnapshot(reservation, 999)).toThrow(
      "reservation is not active"
    );
    expect(() => createMatchmakingRoomBootstrapSnapshot(reservation, 31_000)).toThrow(
      "reservation is not active"
    );
  });
});
