import { z } from "zod";
import { addDays } from "./recurrence";
import { weekdayIndex } from "./streak";

// Habits: something done on a schedule (every day, on some days, or a few times a
// week), checked off once a day. Each has a strength that rises with each check-in and
// dips for a miss, rather than a streak that resets to zero. The study habit is checked
// off by itself on days with enough time logged on courses.

export const HABIT_KINDS = ["check", "study"] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const habitScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }).strict(),
  z
    .object({
      kind: z.literal("days"),
      /** 0 for Monday through 6 for Sunday. */
      days: z
        .array(z.number().int().min(0).max(6))
        .min(1, "Pick at least one day.")
        .max(7)
        .transform((days) => [...new Set(days)].sort()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("weekly"),
      times: z.number().int().min(1, "Use 1 to 6 times a week.").max(6, "Use 1 to 6 times a week."),
    })
    .strict(),
]);
export type HabitSchedule = z.infer<typeof habitScheduleSchema>;

const name = z
  .string()
  .trim()
  .min(1, "Give the habit a name.")
  .max(80, "Keep habit names under 80 characters.");
/** "07:30" in Hub's time zone, or null for no reminder. */
const remindAt = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30.")
  .nullable();

export const habitCreateSchema = z
  .object({
    name,
    kind: z.enum(HABIT_KINDS).default("check"),
    schedule: habitScheduleSchema.default({ kind: "daily" }),
    remindAt: remindAt.default(null),
  })
  .strict();
export type HabitCreate = z.input<typeof habitCreateSchema>;

export const habitUpdateSchema = z
  .object({ name, schedule: habitScheduleSchema, remindAt, archived: z.boolean() })
  .partial()
  .strict();
export type HabitUpdate = z.input<typeof habitUpdateSchema>;

export const checkinSchema = z.object({ done: z.boolean() }).strict();
export const checkinParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  date: z.iso.date("Use a date like 2030-01-31."),
});

/** "Every day", "Mon, Wed, Fri", "3 times a week". */
export function scheduleText(schedule: HabitSchedule): string {
  if (schedule.kind === "daily") return "Every day";
  if (schedule.kind === "weekly") {
    return schedule.times === 1 ? "Once a week" : `${schedule.times} times a week`;
  }
  if (schedule.days.length === 7) return "Every day";
  if (schedule.days.join() === "0,1,2,3,4") return "Weekdays";
  if (schedule.days.join() === "5,6") return "Weekends";
  return schedule.days.map((day) => WEEKDAY_SHORT[day]).join(", ");
}

/** Whether a day is one the habit is meant for. Any day counts toward a weekly one. */
export function scheduledOn(schedule: HabitSchedule, date: string): boolean {
  return schedule.kind === "days" ? schedule.days.includes(weekdayIndex(date)) : true;
}

/** The Monday of a date's week. */
export const weekOf = (date: string) => addDays(date, -weekdayIndex(date));

/** How many checks it takes for half of an old result to fade from the strength. */
function halfLife(schedule: HabitSchedule): number {
  if (schedule.kind === "weekly") return 4; // weeks
  if (schedule.kind === "days") return Math.max(3, Math.round((13 * schedule.days.length) / 7));
  return 13; // days
}

export type DayState = "done" | "missed" | "off" | "open";

export type HabitStats = {
  /** 0 to 100: rises with each check-in, dips for each miss. */
  strength: number;
  /** Scheduled days (or weeks, for a weekly habit) done in a row, through today. */
  streak: number;
  streakUnit: "day" | "week";
  /** Whether today is one of its days, and whether it's done. */
  scheduledToday: boolean;
  doneToday: boolean;
  /** For a weekly habit: check-ins this week, and how many it's for. */
  weekCount: number;
  weekTarget: number;
  /** The last twelve weeks, Monday first, ending today, for the heat map. */
  days: Array<{ date: string; state: DayState }>;
};

/** The heat map covers this many weeks. */
export const HEAT_WEEKS = 12;

/**
 * A habit's strength, streak, and recent days from the dates it was done. Days before
 * `start` don't count against it, and today never counts as a miss before it's over.
 * Strength is a running average that weighs recent checks most: each scheduled day
 * (each week, for a weekly habit) moves it toward 100 when done and toward 0 when not.
 */
export function habitStats(
  schedule: HabitSchedule,
  start: string,
  done: ReadonlySet<string>,
  today: string,
): HabitStats {
  const keep = 0.5 ** (1 / halfLife(schedule));
  const earliest = [...done].filter((date) => date <= today).sort()[0];
  const from = earliest && earliest < start ? earliest : start;
  let score = 0;
  const thisWeek = weekOf(today);
  const weekCount = [...done].filter((date) => date >= thisWeek && date <= today).length;
  const weekTarget = schedule.kind === "weekly" ? schedule.times : 0;

  if (schedule.kind === "weekly") {
    for (let week = weekOf(from); week <= thisWeek; week = addDays(week, 7)) {
      const count = [...done].filter((date) => date >= week && date < addDays(week, 7)).length;
      // This week counts once its target is met; until then it isn't a miss yet.
      if (week === thisWeek && count < schedule.times) continue;
      score = score * keep + Math.min(1, count / schedule.times) * (1 - keep);
    }
  } else {
    for (let date = from; date <= today; date = addDays(date, 1)) {
      const counts = scheduledOn(schedule, date) || done.has(date);
      if (!counts || (date === today && !done.has(date))) continue;
      score = score * keep + (done.has(date) ? 1 : 0) * (1 - keep);
    }
  }

  let streak = 0;
  if (schedule.kind === "weekly") {
    const met = (week: string) =>
      [...done].filter((date) => date >= week && date < addDays(week, 7)).length >= schedule.times;
    let week = met(thisWeek) ? thisWeek : addDays(thisWeek, -7);
    while (week >= weekOf(from) && met(week)) {
      streak += 1;
      week = addDays(week, -7);
    }
  } else {
    let date = done.has(today) ? today : addDays(today, -1);
    for (; date >= from; date = addDays(date, -1)) {
      if (!scheduledOn(schedule, date)) continue;
      if (!done.has(date)) break;
      streak += 1;
    }
  }

  const first = addDays(thisWeek, -7 * (HEAT_WEEKS - 1));
  const days: HabitStats["days"] = [];
  for (let date = first; date <= today; date = addDays(date, 1)) {
    const state: DayState = done.has(date)
      ? "done"
      : date < from || !scheduledOn(schedule, date) || schedule.kind === "weekly"
        ? "off"
        : date === today
          ? "open"
          : "missed";
    days.push({ date, state });
  }

  return {
    strength: Math.round(score * 100),
    streak,
    streakUnit: schedule.kind === "weekly" ? "week" : "day",
    scheduledToday:
      schedule.kind === "weekly"
        ? weekCount < schedule.times || done.has(today)
        : scheduledOn(schedule, today),
    doneToday: done.has(today),
    weekCount,
    weekTarget,
    days,
  };
}

/** A word for a strength, said alongside the number. */
export function strengthLabel(strength: number): string {
  if (strength >= 80) return "Strong";
  if (strength >= 50) return "Building";
  if (strength >= 20) return "Starting";
  return "New";
}
