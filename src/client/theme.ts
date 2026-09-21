import { BASE_BACKGROUND, ensureContrast, isHexColor, readableTextOn } from "../shared/color";
import { defaultSettings } from "../shared/settings";

const STORAGE_KEY = "hub.accent";

/** Applies an accent to the whole app without remembering it (used while previewing). */
export function previewAccent(hex: string): void {
  const color = isHexColor(hex) ? hex.toLowerCase() : defaultSettings.accentColor;
  const style = document.documentElement.style;
  style.setProperty("--accent", color);
  style.setProperty("--accent-text", ensureContrast(color, BASE_BACKGROUND, 4.5));
  style.setProperty("--on-accent", readableTextOn(color));
}

/** Applies the saved accent and remembers it so the next load starts with it. */
export function applyAccent(hex: string): void {
  previewAccent(hex);
  try {
    localStorage.setItem(STORAGE_KEY, hex.toLowerCase());
  } catch {
    // Storage can be unavailable (private browsing); the server copy still applies.
  }
}

export function cachedAccent(): string {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value && isHexColor(value)) return value;
  } catch {
    // Fall through to the default.
  }
  return defaultSettings.accentColor;
}
