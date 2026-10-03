// Per-viewer UI preferences, remembered in this browser (best effort: storage may be unavailable).
import { useCallback, useState } from "react";

export interface Settings {
  /** Learning mode: list the abilities on your face-down cards before they're revealed. */
  showFaceDownAbilities: boolean;
}

const KEY = "anachronism.settings";
const DEFAULTS: Settings = { showFaceDownAbilities: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: the setting still applies for this session
      }
      return next;
    });
  }, []);
  return { settings, update };
}
