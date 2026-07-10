import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceBot,
  createRoom,
  getRoom,
  joinRoom,
  leaveBySocket,
  markPlaying,
  resetRoomEngineState,
  restoreRoomState,
  setReady,
  setMatchRule,
  setRoomEngineConfig,
  startMatch,
  updateProgress
} from "../src/room-engine.js";
import { PROMPTS } from "../src/prompts.js";
import type { Prompt } from "../src/game-state.js";

afterEach(() => {
  resetRoomEngineState();
  setRoomEngineConfig({ timeAttackMs: 30_000 });
});

beforeEach(() => {
  resetRoomEngineState();
  setRoomEngineConfig({ timeAttackMs: 30_000 });
});

describe("room engine config", () => {
  it("uses the configured time attack duration when starting a match", () => {
    setRoomEngineConfig({ timeAttackMs: 5_000 });

    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_time_attack_config",
      socketId: "socket_alice_time_attack_config"
    });

    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_time_attack_config",
      socketId: "socket_bob_time_attack_config"
    });

    expect("error" in joined).toBe(false);

    const rule = setMatchRule("socket_alice_time_attack_config", created.room.roomCode, "timeAttack");
    expect("error" in rule).toBe(false);

    const started = startMatch("socket_alice_time_attack_config", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    expect(started.room.matchEndsAt).toBe(started.room.serverStartAt! + 5_000);
  });

  it("ignores invalid prompts when selecting a room prompt", () => {
    const invalidPrompt = {
      id: "standard-invalid-room-prompt",
      text: "無効",
      category: "standard",
      enabled: false,
      typing: {
        romaji: "mukou",
        hiragana: "むこう"
      }
    } satisfies Prompt;
    const standardPromptCount = PROMPTS.filter((prompt) => prompt.category === "standard").length;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(standardPromptCount);

    PROMPTS.push(invalidPrompt);

    try {
      const created = createRoom({
        nickname: "Alice",
        guestId: "guest_alice_invalid_prompt_filter",
        socketId: "socket_alice_invalid_prompt_filter"
      });

      const started = startMatch("socket_alice_invalid_prompt_filter", created.room.roomCode);

      expect("error" in started).toBe(false);
      if ("error" in started) {
        return;
      }

      const prompt = started.room.prompt;
      expect(prompt).toBeDefined();
      if (!prompt) {
        return;
      }

      expect(prompt.id).not.toBe(invalidPrompt.id);
    } finally {
      nowSpy.mockRestore();
      PROMPTS.pop();
    }
  });

  it("returns an error without advancing the room when no valid prompt exists", () => {
    const standardPrompts = PROMPTS.filter((prompt) => prompt.category === "standard");
    const snapshots = standardPrompts.map((prompt) => ({
      prompt,
      value: {
        id: prompt.id,
        text: prompt.text,
        category: prompt.category,
        enabled: prompt.enabled,
        typing: { ...prompt.typing }
      }
    }));

    for (const prompt of standardPrompts) {
      prompt.enabled = false;
    }

    try {
      const created = createRoom({
        nickname: "Alice",
        guestId: "guest_alice_no_valid_prompt",
        socketId: "socket_alice_no_valid_prompt"
      });

      const started = startMatch("socket_alice_no_valid_prompt", created.room.roomCode);

      expect(started).toEqual({ error: "有効な課題文がありません。" });
      expect(getRoom(created.room.roomCode)?.status).toBe("waiting");
      expect(getRoom(created.room.roomCode)?.prompt).toBeUndefined();
    } finally {
      for (const { prompt, value } of snapshots) {
        Object.assign(prompt, value);
      }
    }
  });

  it("invalidates the previous socket when an existing player rejoins", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_rebind",
      socketId: "socket_alice_rebind_1"
    });

    const rejoined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Alice",
      guestId: "guest_alice_rebind",
      socketId: "socket_alice_rebind_2"
    });

    expect("error" in rejoined).toBe(false);

    expect(setReady("socket_alice_rebind_1", created.room.roomCode, true)).toBeNull();
    expect(setReady("socket_alice_rebind_2", created.room.roomCode, true)).not.toBeNull();
  });

  it("lets a rejoined player restart input sequence without reusing the old socket", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_rejoin_sequence",
      socketId: "socket_alice_rejoin_sequence_1"
    });

    const started = startMatch("socket_alice_rejoin_sequence_1", created.room.roomCode);
    expect("error" in started).toBe(false);
    markPlaying(created.room.roomCode);

    const promptInput = getRoom(created.room.roomCode)?.prompt?.typing.romaji ?? "";
    expect(promptInput.length).toBeGreaterThan(0);

    expect(updateProgress("socket_alice_rejoin_sequence_1", {
      roomCode: created.room.roomCode,
      input: promptInput[0] ?? "",
      sequence: 1
    })).not.toBeNull();

    const rejoined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Alice",
      guestId: "guest_alice_rejoin_sequence",
      socketId: "socket_alice_rejoin_sequence_2"
    });

    expect("error" in rejoined).toBe(false);
    expect(updateProgress("socket_alice_rejoin_sequence_1", {
      roomCode: created.room.roomCode,
      input: promptInput[0] ?? "",
      sequence: 2
    })).toBeNull();
    expect(updateProgress("socket_alice_rejoin_sequence_2", {
      roomCode: created.room.roomCode,
      input: promptInput[0] ?? "",
      sequence: 1
    })).not.toBeNull();
  });

  it("keeps disconnected humans in grace instead of finishing a COM match immediately", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_disconnect_grace",
      socketId: "socket_alice_disconnect_grace"
    });

    const started = startMatch("socket_alice_disconnect_grace", created.room.roomCode);
    expect("error" in started).toBe(false);

    markPlaying(created.room.roomCode);
    leaveBySocket("socket_alice_disconnect_grace");

    const outcome = advanceBot(created.room.roomCode);

    expect(outcome?.type).toBe("progress");
    expect(getRoom(created.room.roomCode)?.status).toBe("playing");
    expect(getRoom(created.room.roomCode)?.players.find((player) => player.id === "guest_alice_disconnect_grace")).toMatchObject({
      connected: false,
      forfeited: undefined
    });
  });

  it("transfers host to the first restored player who reconnects when the original host is absent", () => {
    restoreRoomState(
      {
        roomCode: "HOST01",
        hostPlayerId: "guest_alice_restored_host",
        status: "waiting",
        matchRule: "race",
        botDifficulty: "normal",
        promptCategory: "standard",
        maxPlayers: 2,
        players: [
          {
            id: "guest_alice_restored_host",
            nickname: "Alice",
            connected: false,
            ready: false,
            isHost: true,
            isBot: false,
            progressIndex: 0,
            correctCharacters: 0,
            totalTypedCharacters: 0,
            mistakes: 0,
            maxStreak: 0,
            currentStreak: 0,
            wpm: 0,
            accuracy: 100
          },
          {
            id: "guest_bob_restored_host",
            nickname: "Bob",
            connected: false,
            ready: false,
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
        ]
      },
      {
        guest_alice_restored_host: "session-alice-restored-host",
        guest_bob_restored_host: "session-bob-restored-host"
      }
    );

    const rejoined = joinRoom({
      roomCode: "HOST01",
      nickname: "Bob",
      guestId: "guest_bob_restored_host",
      socketId: "socket_bob_restored_host",
      sessionId: "session-bob-restored-host"
    });

    expect("error" in rejoined).toBe(false);
    if ("error" in rejoined) {
      return;
    }

    expect(rejoined.room.hostPlayerId).toBe("guest_bob_restored_host");
    expect(rejoined.room.players.find((player) => player.id === "guest_bob_restored_host")).toMatchObject({
      connected: true,
      isHost: true
    });
  });
});
