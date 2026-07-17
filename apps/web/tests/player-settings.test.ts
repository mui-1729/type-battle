import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYER_SETTINGS,
  loadPlayerSettings,
  persistPlayerSettings,
  PLAYER_SETTINGS_STORAGE_KEY
} from "../lib/player-settings";

function createStorage(initial?: string) {
  const values = new Map<string, string>(initial ? [[PLAYER_SETTINGS_STORAGE_KEY, initial]] : []);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("player settings", () => {
  it("migrates old settings with safe defaults", () => {
    const settings = loadPlayerSettings(createStorage(JSON.stringify({ nickname: "Alice", soundEnabled: false })));
    expect(settings).toMatchObject({
      nickname: "Alice",
      soundEnabled: false,
      reactionsEnabled: true,
      tutorialSeen: false
    });
  });

  it("round-trips the accessibility and tutorial settings", () => {
    const storage = createStorage();
    persistPlayerSettings(storage, { ...DEFAULT_PLAYER_SETTINGS, reactionsEnabled: false, tutorialSeen: true });
    expect(loadPlayerSettings(storage)).toMatchObject({ reactionsEnabled: false, tutorialSeen: true });
  });
});
