"use client";

import { useEffect } from "react";
import {
  applyPlayerSettingsToDocument,
  loadPlayerSettings
} from "../../lib/player-settings";

export function PlayerSettingsDocumentSync() {
  useEffect(() => {
    const applyStoredSettings = () => {
      applyPlayerSettingsToDocument(document, loadPlayerSettings(window.localStorage));
    };

    applyStoredSettings();
    window.addEventListener("storage", applyStoredSettings);

    return () => window.removeEventListener("storage", applyStoredSettings);
  }, []);

  return null;
}
