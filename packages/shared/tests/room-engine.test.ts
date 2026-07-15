import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceBot,
  checkExpiredTimeAttackMatches,
  createRoom,
  finishTyping,
  getRoom,
  joinRoom,
  leaveBySocket,
  markPlaying,
  resetRoomEngineState,
  restoreRoomState,
  setBotDifficulty,
  setPromptCategory,
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
  it("earns and consumes a mistake guard after a 20-character streak", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_mistake_guard",
      socketId: "socket_alice_mistake_guard",
      deviceKind: "mobile"
    });
    setReady("socket_alice_mistake_guard", created.room.roomCode, true);
    const started = startMatch("socket_alice_mistake_guard", created.room.roomCode);
    expect("error" in started).toBe(false);
    if ("error" in started) {
      return;
    }

    markPlaying(created.room.roomCode);
    const prompt = started.room.prompt?.typing.hiragana ?? "";
    Array.from(prompt.slice(0, 20)).forEach((character, index) => {
      updateProgress("socket_alice_mistake_guard", {
        roomCode: created.room.roomCode,
        input: character,
        sequence: index + 1
      });
    });

    expect(getRoom(created.room.roomCode)?.players[0]?.mistakeGuards).toBe(1);

    updateProgress("socket_alice_mistake_guard", {
      roomCode: created.room.roomCode,
      input: "誤",
      sequence: 21
    });
    expect(getRoom(created.room.roomCode)?.players[0]).toMatchObject({ mistakes: 0, mistakeGuards: 0 });
  });

  it("uses HP100, romaji input damage, and one self-damage per mistake", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_hp_damage",
      socketId: "socket_alice_hp_damage"
    });
    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_hp_damage",
      socketId: "socket_bob_hp_damage"
    });
    expect("error" in joined).toBe(false);

    setMatchRule("socket_alice_hp_damage", created.room.roomCode, "hpBattle");
    setReady("socket_alice_hp_damage", created.room.roomCode, true);
    setReady("socket_bob_hp_damage", created.room.roomCode, true);
    const started = startMatch("socket_alice_hp_damage", created.room.roomCode);
    expect("error" in started).toBe(false);
    if ("error" in started) return;

    expect(started.room.matchEndsAt).toBe(started.room.serverStartAt! + 90_000);
    markPlaying(created.room.roomCode);
    const prompt = started.room.prompt?.typing.romaji ?? "a";
    updateProgress("socket_alice_hp_damage", {
      roomCode: created.room.roomCode,
      input: prompt.slice(0, 3),
      sequence: 1
    });

    let room = getRoom(created.room.roomCode);
    const bobHpAfterAttack = room?.players.find((player) => player.id === "guest_bob_hp_damage")?.hp ?? 100;
    expect(bobHpAfterAttack).toBeLessThan(100);

    const aliceHpBeforeMistake = room?.players.find((player) => player.id === "guest_alice_hp_damage")?.hp ?? 100;
    updateProgress("socket_alice_hp_damage", {
      roomCode: created.room.roomCode,
      input: "!",
      sequence: 2
    });
    room = getRoom(created.room.roomCode);
    expect(room?.players.find((player) => player.id === "guest_alice_hp_damage")).toMatchObject({ hp: aliceHpBeforeMistake - 1, mistakes: 1 });
  });

  it("enters sudden death when HP is tied at the 90-second deadline", () => {
    const created = createRoom({ nickname: "Alice", guestId: "guest_alice_hp_sudden", socketId: "socket_alice_hp_sudden" });
    const joined = joinRoom({ roomCode: created.room.roomCode, nickname: "Bob", guestId: "guest_bob_hp_sudden", socketId: "socket_bob_hp_sudden" });
    expect("error" in joined).toBe(false);
    setMatchRule("socket_alice_hp_sudden", created.room.roomCode, "hpBattle");
    setReady("socket_alice_hp_sudden", created.room.roomCode, true);
    setReady("socket_bob_hp_sudden", created.room.roomCode, true);
    const started = startMatch("socket_alice_hp_sudden", created.room.roomCode);
    expect("error" in started).toBe(false);
    if ("error" in started) return;

    markPlaying(created.room.roomCode);
    const now = vi.spyOn(Date, "now").mockReturnValue(started.room.matchEndsAt! + 1);
    expect(checkExpiredTimeAttackMatches()).toEqual([]);
    expect(getRoom(created.room.roomCode)).toMatchObject({ suddenDeath: true });
    now.mockRestore();
  });

  it("loops the HP prompt instead of finishing after the first cycle", () => {
    const created = createRoom({ nickname: "Alice", guestId: "guest_alice_hp_loop", socketId: "socket_alice_hp_loop" });
    const joined = joinRoom({ roomCode: created.room.roomCode, nickname: "Bob", guestId: "guest_bob_hp_loop", socketId: "socket_bob_hp_loop" });
    expect("error" in joined).toBe(false);
    setMatchRule("socket_alice_hp_loop", created.room.roomCode, "hpBattle");
    setReady("socket_alice_hp_loop", created.room.roomCode, true);
    setReady("socket_bob_hp_loop", created.room.roomCode, true);
    const started = startMatch("socket_alice_hp_loop", created.room.roomCode);
    expect("error" in started).toBe(false);
    if ("error" in started) return;

    markPlaying(created.room.roomCode);
    const prompt = started.room.prompt?.typing.romaji ?? "a";
    for (let offset = 0, sequence = 1; offset < prompt.length; offset += 16, sequence += 1) {
      updateProgress("socket_alice_hp_loop", {
        roomCode: created.room.roomCode,
        input: prompt.slice(offset, offset + 16),
        sequence
      });
    }

    const afterFirstCycle = getRoom(created.room.roomCode);
    expect(afterFirstCycle?.status).toBe("playing");
    expect(afterFirstCycle?.players[0]?.finishStatus).not.toBe("finished");
    const hpAfterFirstCycle = afterFirstCycle?.players[1]?.hp ?? 100;

    updateProgress("socket_alice_hp_loop", {
      roomCode: created.room.roomCode,
      input: prompt.slice(0, 3),
      sequence: Math.ceil(prompt.length / 16) + 1
    });

    expect(getRoom(created.room.roomCode)?.players[1]?.hp).toBeLessThan(hpAfterFirstCycle);
  });

  it("does not start until every connected human is ready", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_ready_guard",
      socketId: "socket_alice_ready_guard"
    });
    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_ready_guard",
      socketId: "socket_bob_ready_guard"
    });

    expect("error" in joined).toBe(false);
    expect(startMatch("socket_alice_ready_guard", created.room.roomCode)).toEqual({
      error: "参加者全員のREADYが必要です。"
    });
    expect(getRoom(created.room.roomCode)?.status).toBe("waiting");
    expect(getRoom(created.room.roomCode)?.players).toHaveLength(2);

    setReady("socket_alice_ready_guard", created.room.roomCode, true);
    setReady("socket_bob_ready_guard", created.room.roomCode, true);
    const started = startMatch("socket_alice_ready_guard", created.room.roomCode);
    expect("error" in started).toBe(false);
  });

  it("clears both ready states when the host changes match settings", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_ready_settings",
      socketId: "socket_alice_ready_settings"
    });
    const joined = joinRoom({
      roomCode: created.room.roomCode,
      nickname: "Bob",
      guestId: "guest_bob_ready_settings",
      socketId: "socket_bob_ready_settings"
    });

    expect("error" in joined).toBe(false);
    setReady("socket_alice_ready_settings", created.room.roomCode, true);
    setReady("socket_bob_ready_settings", created.room.roomCode, true);

    const updatedRule = setMatchRule("socket_alice_ready_settings", created.room.roomCode, "hpBattle");
    expect("error" in updatedRule).toBe(false);
    if ("error" in updatedRule) {
      return;
    }
    expect(updatedRule.room.players.every((player) => !player.ready)).toBe(true);

    setReady("socket_alice_ready_settings", created.room.roomCode, true);
    setReady("socket_bob_ready_settings", created.room.roomCode, true);
    const updatedPrompt = setPromptCategory("socket_alice_ready_settings", created.room.roomCode, "long");
    expect("error" in updatedPrompt).toBe(false);
    if ("error" in updatedPrompt) {
      return;
    }
    expect(updatedPrompt.room.players.every((player) => !player.ready)).toBe(true);

    setReady("socket_alice_ready_settings", created.room.roomCode, true);
    setReady("socket_bob_ready_settings", created.room.roomCode, true);
    const updatedBot = setBotDifficulty("socket_alice_ready_settings", created.room.roomCode, "hard");
    expect("error" in updatedBot).toBe(false);
    if ("error" in updatedBot) {
      return;
    }
    expect(updatedBot.room.players.every((player) => !player.ready)).toBe(true);
  });

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
    setReady("socket_alice_time_attack_config", created.room.roomCode, true);
    setReady("socket_bob_time_attack_config", created.room.roomCode, true);

    const started = startMatch("socket_alice_time_attack_config", created.room.roomCode);
    expect("error" in started).toBe(false);

    if ("error" in started) {
      return;
    }

    expect(started.room.matchEndsAt).toBe(started.room.serverStartAt! + 5_000);
  });

  it("keeps the match rule on the immutable match result", () => {
    const created = createRoom({
      nickname: "Alice",
      guestId: "guest_alice_result_rule",
      socketId: "socket_alice_result_rule"
    });
    const rule = setMatchRule("socket_alice_result_rule", created.room.roomCode, "timeAttack");
    expect("error" in rule).toBe(false);
    setReady("socket_alice_result_rule", created.room.roomCode, true);
    const started = startMatch("socket_alice_result_rule", created.room.roomCode);
    expect("error" in started).toBe(false);
    if ("error" in started) {
      return;
    }

    markPlaying(created.room.roomCode);
    const chunks = (started.room.prompt?.typing.romaji ?? "").match(/.{1,8}/g) ?? [];
    let finished: ReturnType<typeof finishTyping> = null;
    chunks.forEach((input, index) => {
      const payload = {
        roomCode: created.room.roomCode,
        input,
        sequence: index + 1
      };
      finished = index === chunks.length - 1
        ? finishTyping("socket_alice_result_rule", payload)
        : updateProgress("socket_alice_result_rule", payload);
    });

    expect(finished).toMatchObject({
      roomCode: created.room.roomCode,
      matchRule: "timeAttack",
      status: "playing"
    });
    expect(finished && "maxPlayers" in finished).toBe(true);
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

      setReady("socket_alice_invalid_prompt_filter", created.room.roomCode, true);
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

      setReady("socket_alice_no_valid_prompt", created.room.roomCode, true);
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

    setReady("socket_alice_rejoin_sequence_1", created.room.roomCode, true);
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

    setReady("socket_alice_disconnect_grace", created.room.roomCode, true);
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
