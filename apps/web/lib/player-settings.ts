export type PlayerSettings = {
  nickname: string;
  theme: "system" | "light" | "dark";
  soundEnabled: boolean;
  countdownSoundEnabled: boolean;
  reactionsEnabled: boolean;
  inputGuideEnabled: boolean;
  reducedMotion: boolean;
  fontSize: "small" | "normal" | "large";
  tutorialSeen: boolean;
};

export const PLAYER_SETTINGS_STORAGE_KEY = "type-battle:settings";

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  nickname: "Player",
  theme: "system",
  soundEnabled: true,
  countdownSoundEnabled: true,
  reactionsEnabled: true,
  inputGuideEnabled: true,
  reducedMotion: false,
  fontSize: "normal",
  tutorialSeen: false
};

export function loadPlayerSettings(storage: Pick<Storage, "getItem">): PlayerSettings {
  const rawSettings = storage.getItem(PLAYER_SETTINGS_STORAGE_KEY);

  if (!rawSettings) {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }

  try {
    const parsedSettings = JSON.parse(rawSettings) as Partial<PlayerSettings>;
    return {
      ...DEFAULT_PLAYER_SETTINGS,
      nickname:
        typeof parsedSettings.nickname === "string" && parsedSettings.nickname.trim()
          ? parsedSettings.nickname
          : DEFAULT_PLAYER_SETTINGS.nickname,
      theme: isPlayerTheme(parsedSettings.theme) ? parsedSettings.theme : DEFAULT_PLAYER_SETTINGS.theme,
      soundEnabled:
        typeof parsedSettings.soundEnabled === "boolean"
          ? parsedSettings.soundEnabled
          : DEFAULT_PLAYER_SETTINGS.soundEnabled,
      countdownSoundEnabled:
        typeof parsedSettings.countdownSoundEnabled === "boolean"
          ? parsedSettings.countdownSoundEnabled
          : DEFAULT_PLAYER_SETTINGS.countdownSoundEnabled,
      reactionsEnabled:
        typeof parsedSettings.reactionsEnabled === "boolean"
          ? parsedSettings.reactionsEnabled
          : DEFAULT_PLAYER_SETTINGS.reactionsEnabled,
      inputGuideEnabled:
        typeof parsedSettings.inputGuideEnabled === "boolean"
          ? parsedSettings.inputGuideEnabled
          : DEFAULT_PLAYER_SETTINGS.inputGuideEnabled,
      reducedMotion:
        typeof parsedSettings.reducedMotion === "boolean"
          ? parsedSettings.reducedMotion
          : DEFAULT_PLAYER_SETTINGS.reducedMotion,
      fontSize: isFontSize(parsedSettings.fontSize) ? parsedSettings.fontSize : DEFAULT_PLAYER_SETTINGS.fontSize,
      tutorialSeen:
        typeof parsedSettings.tutorialSeen === "boolean"
          ? parsedSettings.tutorialSeen
          : DEFAULT_PLAYER_SETTINGS.tutorialSeen
    };
  } catch {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }
}

export function persistPlayerSettings(storage: Pick<Storage, "setItem">, settings: PlayerSettings): void {
  storage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function applyPlayerSettingsToDocument(document: Document, settings: PlayerSettings): void {
  const html = document.documentElement;

  html.classList.remove("theme-light", "theme-dark", "font-small", "font-normal", "font-large", "reduced-motion");

  if (settings.theme !== "system") {
    html.classList.add(`theme-${settings.theme}`);
  }

  html.classList.add(`font-${settings.fontSize}`);

  if (settings.reducedMotion) {
    html.classList.add("reduced-motion");
  }
}

function isPlayerTheme(value: unknown): value is PlayerSettings["theme"] {
  return value === "system" || value === "light" || value === "dark";
}

function isFontSize(value: unknown): value is PlayerSettings["fontSize"] {
  return value === "small" || value === "normal" || value === "large";
}
