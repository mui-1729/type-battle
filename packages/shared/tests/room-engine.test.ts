import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRoom,
  joinRoom,
  metrics,
  rooms,
  setMatchRule,
  setRoomEngineConfig,
  startMatch
} from "../src/room-engine.js";
import { PROMPTS } from "../src/prompts.js";
import type { Prompt } from "../src/game-state.js";

afterEach(() => {
  rooms.clear();
  metrics.matchesStarted = 0;
  metrics.matchesFinished = 0;
  metrics.disconnectCount = 0;
  metrics.serverErrors = 0;
  setRoomEngineConfig({ timeAttackMs: 30_000 });
});

beforeEach(() => {
  rooms.clear();
  metrics.matchesStarted = 0;
  metrics.matchesFinished = 0;
  metrics.disconnectCount = 0;
  metrics.serverErrors = 0;
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
});
