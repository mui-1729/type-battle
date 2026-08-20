import { describe, expect, it } from "vitest";
import {
  createMatchmakingRoomBootstrapSnapshot,
  isAssignedMatchmakingHostConnected
} from "../src/matchmaking-room-bootstrap";

function createSnapshot() {
  return createMatchmakingRoomBootstrapSnapshot({
    roomCode: "ab23cd",
    host: {
      guestId: "guest_host",
      sessionId: "session_host",
      nickname: " Host ",
      deviceKind: "desktop"
    },
    guest: {
      guestId: "guest_guest",
      sessionId: "session_guest",
      nickname: "Guest",
      deviceKind: "mobile"
    },
    now: 2_000
  });
}

describe("matchmaking room bootstrap", () => {
  it("preloads host first and binds existing browser sessions", () => {
    const snapshot = createSnapshot();

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
        guest_host: "session_host",
        guest_guest: "session_guest"
      },
      disconnectedAt: {
        guest_host: 2_000,
        guest_guest: 2_000
      }
    });

    expect(snapshot.room.players.map((player) => player.id)).toEqual(["guest_host", "guest_guest"]);
    expect(snapshot.room.players[0]).toMatchObject({
      id: "guest_host",
      nickname: "Host",
      isHost: true,
      connected: false,
      ready: false,
      deviceKind: "desktop",
      inputMode: "romaji"
    });
    expect(snapshot.room.players[1]).toMatchObject({
      id: "guest_guest",
      nickname: "Guest",
      isHost: false,
      connected: false,
      ready: false,
      deviceKind: "mobile",
      inputMode: "kana"
    });
  });

  it("does not expose session IDs in public room state", () => {
    const snapshot = createSnapshot();
    const serializedRoom = JSON.stringify(snapshot.room);

    expect(serializedRoom).not.toContain("session_host");
    expect(serializedRoom).not.toContain("session_guest");
    expect(JSON.stringify(snapshot.playerSessions)).toContain("session_host");
  });

  it("starts both reserved players with clean typing state", () => {
    const snapshot = createSnapshot();

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

  it("only accepts the originally assigned connected host", () => {
    const snapshot = createSnapshot();

    expect(isAssignedMatchmakingHostConnected(snapshot.room, "guest_host")).toBe(false);

    const hostConnected = {
      ...snapshot.room,
      players: snapshot.room.players.map((player) =>
        player.id === "guest_host" ? { ...player, connected: true } : player
      )
    };
    expect(isAssignedMatchmakingHostConnected(hostConnected, "guest_host")).toBe(true);

    const roleFlipped = {
      ...hostConnected,
      hostPlayerId: "guest_guest",
      players: hostConnected.players.map((player) => ({
        ...player,
        isHost: player.id === "guest_guest"
      }))
    };
    expect(isAssignedMatchmakingHostConnected(roleFlipped, "guest_host")).toBe(false);
  });

  it("rejects duplicate identities and invalid bootstrap inputs", () => {
    expect(() =>
      createMatchmakingRoomBootstrapSnapshot({
        roomCode: "AB23CD",
        host: { guestId: "same", sessionId: "session_host", nickname: "Host" },
        guest: { guestId: "same", sessionId: "session_guest", nickname: "Guest" }
      })
    ).toThrow("two distinct guests");

    expect(() =>
      createMatchmakingRoomBootstrapSnapshot({
        roomCode: "AB23CD",
        host: { guestId: "host", sessionId: "same_session", nickname: "Host" },
        guest: { guestId: "guest", sessionId: "same_session", nickname: "Guest" }
      })
    ).toThrow("distinct sessions");

    expect(() =>
      createMatchmakingRoomBootstrapSnapshot({
        roomCode: "BAD",
        host: { guestId: "host", sessionId: "session_host", nickname: "Host" },
        guest: { guestId: "guest", sessionId: "session_guest", nickname: "Guest" }
      })
    ).toThrow("Invalid matchmaking room code");
  });
});
