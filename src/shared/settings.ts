import { z } from "zod";
import { HEX_COLOR } from "./color";

export type AccentPreset = { name: string; hex: string };

/** Bright accents that read well on the dark base. The first one is the default. */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { name: "Cyan", hex: "#22d3ee" },
  { name: "Blue", hex: "#4c8dff" },
  { name: "Violet", hex: "#a57bff" },
  { name: "Pink", hex: "#ff5fb7" },
  { name: "Coral", hex: "#ff6b5e" },
  { name: "Amber", hex: "#ffb224" },
  { name: "Lime", hex: "#9be22d" },
];

const hexColor = z
  .string()
  .trim()
  .regex(HEX_COLOR, "Use a 6-digit hex color like #22d3ee")
  .transform((value) => value.toLowerCase());

/** Every user setting and its validation. Add new settings here, with a default below. */
export const settingsSchema = z.object({
  accentColor: hexColor,
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  accentColor: "#22d3ee",
};
