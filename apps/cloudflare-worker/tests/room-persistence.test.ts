import type { RoomState } from "@type-battle/shared";
import { describe, expect, it } from "vitest";
import {
  createPersistedRoomSnapshot,
  ROOM_SNAPSHOT_SCHEMA_VERSION
} from "../src/room-persistence.js";

describe("room persistence snapshot", () => {
  it("serializes sessions, disconnect timestamps, and internal typing state", () => {
    const publicRoom = { roomCode: "ABC123" } as RoomState;
    const snapshot = createPersistedRoomSnapshot({
      room: {
        round: 3,
        promptHistory: ["prompt-1", "prompt-2"],
        createdAt: 100,
        lastActivityAt: 200,
        finishedAt: 250,
        players: new Map([
          [
            "player-1",
            {
              disconnectedAt: 190,
              typingProgressIndex: 7,
              pendingInput: "k",
              inputMode: "romaji" as const,
              lastInputSequence: 11,
              typingRateTokens: 4,
              typingRateLastRefillAt: 180
            }
          ],
          [
            "player-2",
            {
              typingProgressIndex: 2,
              pendingInput: "",
              lastInputSequence: 5,
              typingRateTokens: 8,
              typingRateLastRefillAt: 175
            }
          ]
        ])
      },
      publicRoom,
      playerSessions: new Map([
        ["player-1", "session-1"],
        ["player-2", "session-2"]
      ])
    });

    expect(snapshot).toEqual({
      schemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      room: publicRoom,
      playerSessions: {
        "player-1": "session-1",
        "player-2": "session-2"
      },
      disconnectedAt: {
        "player-1": 190
      },
      internal: {
        round: 3,
        promptHistory: ["prompt-1", "prompt-2"],
        createdAt: 100,
        lastActivityAt: 200,
        finishedAt: 250,
        typingState: {
          "player-1": {
            typingProgressIndex: 7,
            pendingInput: "k",
            inputMode: "romaji",
            lastInputSequence: 11,
            typingRateTokens: 4,
            typingRateLastRefillAt: 180
          },
          "player-2": {
            typingProgressIndex: 2,
            pendingInput: "",
            lastInputSequence: 5,
            typingRateTokens: 8,
            typingRateLastRefillAt: 175
          }
        }
      }
    });
  });

  it("copies mutable collections and omits absent optional fields", () => {
    const promptHistory = ["prompt-1"];
    const sessions = new Map([["player-1", "session-1"]]);
    const publicRoom = { roomCode: "ABC123" } as RoomState;

    const snapshot = createPersistedRoomSnapshot({
      room: {
        round: 1,
        promptHistory,
        createdAt: 10,
        lastActivityAt: 20,
        players: new Map([
          [
            "player-1",
            {
              typingProgressIndex: 0,
              pendingInput: "",
              lastInputSequence: 0,
              typingRateTokens: 12,
              typingRateLastRefillAt: 20
            }
          ]
        ])
      },
      publicRoom,
      playerSessions: sessions
    });

    promptHistory.push("prompt-2");
    sessions.set("player-2", "session-2");

    expect(snapshot.internal?.promptHistory).toEqual(["prompt-1"]);
    expect(snapshot.playerSessions).toEqual({ "player-1": "session-1" });
    expect(snapshot.internal).not.toHaveProperty("finishedAt");
    expect(snapshot.internal?.typingState?.["player-1"]).not.toHaveProperty("inputMode");
  });
});
