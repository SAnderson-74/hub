import { z } from "zod";
import { businessRateSchema, defaultBusinessRate } from "./businessRate";
import { HEX_COLOR } from "./color";
import { defaultHomeAssistant, homeAssistantSchema } from "./homeAssistant";
import { defaultModules, modulesSchema, timeZoneSchema } from "./modules";
import { defaultReminders, remindersSchema } from "./reminders";

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
  /** Minutes of study a day that keep the study streak going. */
  studyMinimumMinutes: z
    .number("Enter the minutes as a number.")
    .int("Use whole minutes.")
    .min(5, "Use at least 5 minutes a day.")
    .max(720, "Use 720 minutes (12 hours) a day or fewer."),
  /** The business rate calculator's inputs. */
  businessRate: businessRateSchema,
  /** Home Assistant webhooks for the summary and reminders. */
  homeAssistant: homeAssistantSchema,
  /** Which reminders go to Home Assistant, and when. */
  reminders: remindersSchema,
  /** Which modules show. Turning one off hides it and keeps its data. */
  modules: modulesSchema,
  /** Hub's time zone, or "" for the one the server was set up with (HUB_TIMEZONE). */
  timeZone: timeZoneSchema,
  /** Whether first-run setup is done. */
  setupDone: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  accentColor: "#22d3ee",
  studyMinimumMinutes: 30,
  businessRate: defaultBusinessRate,
  homeAssistant: defaultHomeAssistant,
  reminders: defaultReminders,
  modules: defaultModules,
  timeZone: "",
  setupDone: false,
};
