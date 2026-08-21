import type { RoomState } from "@type-battle/shared";
import { describe, expect, it } from "vitest";
import {
  createPersistedRoomSnapshot,
  ROOM_SNAPSHOT_SCHEMA_VERSION
} from "../src/room-persistence.js";

function createPublicRoom(): RoomState {
  return {
    roomCode: "ABC123",
    hostPlayerId: "player-1",
    status: "playing",
    matchRule: "race",
    botDifficulty: "normal",
    promptCategory: "short",
    prompt: {
      id: "prompt-1",
      text: "猫",
      category: "short",
      typing: { romaji: "neko", hiragana: "ねこ" }
    },
    timeAttackPromptIds: ["prompt-1", "prompt-2"],
    players: [
      {
        id: "player-1",
        nickname: "Alice",
        connected: true,
        ready: true,
        isHost: true,
        isBot: false,
        progressIndex: 1,
        correctCharacters: 1,
        totalTypedCharacters: 1,
        mistakes: 0,
        maxStreak: 1,
        currentStreak: 1,
        wpm: 60,
        accuracy: 100
      },
      {
        id: "player-2",
        nickname: "Bob",
        connected: true,
        ready: true,
        isHost: false,
        isBot: false,
        progressIndex: 0,
        correctCharacters: 0,
        totalTypedCharacters: 0,
        mistakes: 0,
        maxStreak: 0,
        currentStreak: 0,
        wpm: 0,
        accuracy: 100
      }
    ],
    maxPlayers: 2,
    round: 3
  };
}

function createInternalPlayers(inputMode: "kana" | "romaji" = "romaji") {
  return new Map([
    [
      "player-1",
      {
        disconnectedAt: 190,
        typingProgressIndex: 7,
        pendingInput: "k",
        inputMode,
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
  ]);
}

describe("room persistence snapshot", () => {
  it("serializes sessions, disconnect timestamps, and kana typing state", () => {
    const publicRoom = createPublicRoom();
    const snapshot = createPersistedRoomSnapshot({
      room: {
        roomCode: "ABC123",
        round: 3,
        promptHistory: ["prompt-1", "prompt-2"],
        createdAt: 100,
        lastActivityAt: 200,
        finishedAt: 250,
        players: createInternalPlayers("kana")
      },
      publicRoom,
      playerSessions: new Map([
        ["player-1", "session-1"],
        ["player-2", "session-2"]
      ])
    });

    expect(snapshot).toMatchObject({
      schemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      room: publicRoom,
      playerSessions: {
        "player-1": "session-1",
        "player-2": "session-2"
      },
      disconnectedAt: { "player-1": 190 },
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
            inputMode: "kana",
            lastInputSequence: 11,
            typingRateTokens: 4,
            typingRateLastRefillAt: 180
          }
        }
      }
    });
  });

  it("detaches all nested mutable public room state", () => {
    const publicRoom = createPublicRoom();
    publicRoom.result = {
      roomCode: publicRoom.roomCode,
      prompt: publicRoom.prompt!,
      players: [{ ...publicRoom.players[0]!, rank: 1, finishGap: 0 }]
    };

    const snapshot = createPersistedRoomSnapshot({
      room: {
        roomCode: "ABC123",
        round: 3,
        promptHistory: ["prompt-1"],
        createdAt: 100,
        lastActivityAt: 200,
        players: createInternalPlayers()
      },
      publicRoom,
      playerSessions: new Map()
    });

    publicRoom.players[0]!.nickname = "Changed";
    publicRoom.prompt!.typing.hiragana = "へんこう";
    publicRoom.timeAttackPromptIds!.push("prompt-3");
    publicRoom.result!.players[0]!.nickname = "Changed result";
    publicRoom.result!.prompt.text = "変更";

    expect(snapshot.room.players[0]!.nickname).toBe("Alice");
    expect(snapshot.room.prompt?.typing.hiragana).toBe("ねこ");
    expect(snapshot.room.timeAttackPromptIds).toEqual(["prompt-1", "prompt-2"]);
    expect(snapshot.room.result?.players[0]!.nickname).toBe("Alice");
    expect(snapshot.room.result?.prompt.text).toBe("猫");
    expect(snapshot.room).not.toBe(publicRoom);
    expect(snapshot.room.players).not.toBe(publicRoom.players);
  });

  it("preserves zero-valued optional fields", () => {
    const publicRoom = createPublicRoom();
    publicRoom.serverStartAt = 0;
    publicRoom.matchEndsAt = 0;
    publicRoom.players[0]!.typingProgressIndex = 0;
    publicRoom.players[0]!.finishedAt = 0;
    publicRoom.players[0]!.finishTimeMs = 0;
    publicRoom.players[0]!.hp = 0;

    const snapshot = createPersistedRoomSnapshot({
      room: {
        roomCode: "ABC123",
        round: 1,
        promptHistory: [],
        createdAt: 0,
        lastActivityAt: 0,
        finishedAt: 0,
        players: new Map([
          [
            "player-1",
            {
              disconnectedAt: 0,
              typingProgressIndex: 0,
              pendingInput: "",
              lastInputSequence: 0,
              typingRateTokens: 0,
              typingRateLastRefillAt: 0
            }
          ],
          [
            "player-2",
            {
              typingProgressIndex: 0,
              pendingInput: "",
              lastInputSequence: 0,
              typingRateTokens: 0,
              typingRateLastRefillAt: 0
            }
          ]
        ])
      },
      publicRoom,
      playerSessions: new Map()
    });

    expect(snapshot.room).toMatchObject({
      serverStartAt: 0,
      matchEndsAt: 0
    });
    expect(snapshot.room.players[0]).toMatchObject({
      typingProgressIndex: 0,
      finishedAt: 0,
      finishTimeMs: 0,
      hp: 0
    });
    expect(snapshot.disconnectedAt).toEqual({ "player-1": 0 });
    expect(snapshot.internal).toMatchObject({
      createdAt: 0,
      lastActivityAt: 0,
      finishedAt: 0,
      typingState: {
        "player-1": {
          typingProgressIndex: 0,
          lastInputSequence: 0,
          typingRateTokens: 0,
          typingRateLastRefillAt: 0
        }
      }
    });
  });

  it("preserves empty collections and omits absent optional fields", () => {
    const snapshot = createPersistedRoomSnapshot({
      room: {
        roomCode: "EMPTY1",
        round: 1,
        promptHistory: [],
        createdAt: 10,
        lastActivityAt: 20,
        players: new Map()
      },
      publicRoom: {
        ...createPublicRoom(),
        roomCode: "EMPTY1",
        hostPlayerId: "",
        players: [],
        timeAttackPromptIds: []
      },
      playerSessions: new Map()
    });

    expect(snapshot.room.players).toEqual([]);
    expect(snapshot.room.timeAttackPromptIds).toEqual([]);
    expect(snapshot.playerSessions).toEqual({});
    expect(snapshot.disconnectedAt).toEqual({});
    expect(snapshot.internal?.promptHistory).toEqual([]);
    expect(snapshot.internal?.typingState).toEqual({});
    expect(snapshot.internal).not.toHaveProperty("finishedAt");
  });

  it("rejects room code and player identity mismatches", () => {
    const publicRoom = createPublicRoom();
    const room = {
      roomCode: "ABC123",
      round: 1,
      promptHistory: [],
      createdAt: 10,
      lastActivityAt: 20,
      players: createInternalPlayers()
    };

    expect(() => createPersistedRoomSnapshot({
      room,
      publicRoom: { ...publicRoom, roomCode: "OTHER1" },
      playerSessions: new Map()
    })).toThrow(/roomCode mismatch/);

    expect(() => createPersistedRoomSnapshot({
      room,
      publicRoom: { ...publicRoom, players: publicRoom.players.slice(0, 1) },
      playerSessions: new Map()
    })).toThrow(/player ID mismatch/);

    expect(() => createPersistedRoomSnapshot({
      room,
      publicRoom: { ...publicRoom, players: [publicRoom.players[0]!, publicRoom.players[0]!] },
      playerSessions: new Map()
    })).toThrow(/player ID mismatch/);
  });
});
