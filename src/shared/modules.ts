import { z } from "zod";

// Hub's modules. Each can be turned off in Settings (or during first-run setup):
// it leaves the navigation and the home screen, and its data stays where it is.
// Home and Settings are always on.

export const MODULES = [
  { id: "tasks", label: "Tasks", description: "Projects, tasks, and a board" },
  { id: "time", label: "Time", description: "Timers and time logged" },
  { id: "goals", label: "Goals", description: "Goals, milestones, and savings goals" },
  { id: "courses", label: "Courses", description: "Terms, courses, and a study streak" },
  { id: "resale", label: "Resale", description: "Items bought to sell, and profit" },
  { id: "money", label: "Money", description: "Accounts, budgets, and cash flow" },
  { id: "tithing", label: "Tithing", description: "Tithing owed, paid, and what's left" },
  { id: "taxes", label: "Taxes", description: "Tax lessons and estimates" },
  { id: "business", label: "Business", description: "Steps, gear, skills, and leads" },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];

export const MODULE_IDS = MODULES.map((module) => module.id) as [ModuleId, ...ModuleId[]];

// A module added after someone saved their settings is on until they turn it off, so
// settings saved by an older build still read as they were.
export const modulesSchema = z
  .object(
    Object.fromEntries(MODULE_IDS.map((id) => [id, z.boolean().default(true)])) as Record<
      ModuleId,
      z.ZodDefault<z.ZodBoolean>
    >,
  )
  .strict();
export type ModuleSettings = z.infer<typeof modulesSchema>;

export const defaultModules = Object.fromEntries(
  MODULE_IDS.map((id) => [id, true]),
) as ModuleSettings;

/** Whether a name is an IANA time zone this runtime knows, like "America/New_York". */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A time zone, or "" to use the one the server was set up with. */
export const timeZoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine((value) => value === "" || isTimeZone(value), "Pick a time zone from the list.");
