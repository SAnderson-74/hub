import { z } from "zod";

// Schedules for anything that repeats: tasks now, and bills and habits later. A rule
// is stored as JSON. `frequency` and `interval` alone always make a sensible repeat,
// so a build that predates the other fields (after a rollback) still repeats: it
// treats "Mon, Wed, Fri" as weekly and "the 2nd Tuesday" as monthly. Yearly is stored
// as every 12 months for the same reason.

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** Which week of the month for "the 2nd Tuesday"; -1 is the last. */
export const MONTH_WEEKS = [1, 2, 3, 4, -1] as const;
export type MonthWeek = (typeof MONTH_WEEKS)[number];

/** Days of the week, Sunday first, as Date.getUTCDay() numbers them. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday to Friday. */
export const WORKDAYS = [1, 2, 3, 4, 5] as const;

const weekday = z.number().int().min(0).max(6);
const date = z.iso.date("Use a date like 2030-01-31.");

/**
 * What people can set: how often and every how many, plus optionally which weekdays
 * (weekly), "the 2nd Tuesday" or the last day (monthly), whether the next one counts
 * from when this one is done, and when the series ends.
 */
export const recurrenceSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z
      .number()
      .int()
      .min(1, "Repeat at least every 1.")
      .max(99, "Repeat at most every 99.")
      .default(1),
    /** Weekly: the days it falls on. Left out, the due date's weekday. */
    weekdays: z
      .array(weekday)
      .min(1, "Pick at least one day.")
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b))
      .optional(),
    /** Monthly: with `weekday`, "the 2nd Tuesday" or (-1) "the last Friday". */
    monthWeek: z.union(MONTH_WEEKS.map((week) => z.literal(week))).optional(),
    weekday: weekday.optional(),
    /** Monthly: always the month's last day. */
    onLastDay: z.literal(true).optional(),
    /** "completion" counts the next one from the day this one is done. */
    from: z.enum(["schedule", "completion"]).optional(),
    /** No repeats due after this date. */
    until: date.optional(),
    /** How many more after this one; 0 means this is the last. */
    left: z.number().int().min(0).max(999).optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });
    if (rule.weekdays && rule.frequency !== "weekly") {
      issue("Pick days of the week only for weekly repeats.", "weekdays");
    }
    if ((rule.monthWeek === undefined) !== (rule.weekday === undefined)) {
      issue("Give both the week of the month and the day, like the 2nd Tuesday.", "monthWeek");
    }
    if ((rule.monthWeek !== undefined || rule.onLastDay) && rule.frequency !== "monthly") {
      issue("A day of the month is only for monthly or yearly repeats.", "monthWeek");
    }
    if (rule.monthWeek !== undefined && rule.onLastDay) {
      issue("Pick either the last day or a day of the week.", "onLastDay");
    }
    const fixedDays = rule.weekdays || rule.monthWeek !== undefined || rule.onLastDay;
    if (rule.from === "completion" && fixedDays) {
      issue("Repeats on set days follow the schedule, not when it's done.", "from");
    }
  });
export type RecurrenceInput = z.input<typeof recurrenceSchema>;

/**
 * A stored rule. `monthDay` is kept by the server for monthly repeats, so a task due
 * on the 31st goes back to the 31st after a shorter month (31 for `onLastDay`).
 */
export type Recurrence = z.infer<typeof recurrenceSchema> & { monthDay?: number };

const UNITS: Record<RecurrenceFrequency, [string, string, string]> = {
  daily: ["Daily", "day", "days"],
  weekly: ["Weekly", "week", "weeks"],
  monthly: ["Monthly", "month", "months"],
};

const ORDINALS: Record<MonthWeek, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  [-1]: "last",
};

/** "Mon, Wed, and Fri" */
function listDays(days: readonly number[]): string {
  const names = days.map((day) => WEEKDAY_SHORT[day] ?? "");
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/** "Mar 1, 2030" */
function shortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Every 2 weeks" or "Yearly": how often, before any days or end. */
function cadence(rule: Pick<Recurrence, "frequency" | "interval">): string {
  if (rule.frequency === "monthly" && rule.interval % 12 === 0) {
    const years = rule.interval / 12;
    return years === 1 ? "Yearly" : `Every ${years} years`;
  }
  const [single, , plural] = UNITS[rule.frequency];
  return rule.interval === 1 ? single : `Every ${rule.interval} ${plural}`;
}

/**
 * The rule in words: "Weekly", "Every weekday", "Every 2 weeks on Mon and Thu",
 * "Monthly on the 2nd Tuesday", "Yearly", "Every 3 days after it's done, 2 more".
 */
export function describeRecurrence(rule: Omit<Recurrence, "monthDay">): string {
  let text = cadence(rule);
  const days = rule.weekdays;
  if (rule.frequency === "weekly" && days) {
    const workdays = days.length === 5 && WORKDAYS.every((day) => days.includes(day));
    text = workdays && rule.interval === 1 ? "Every weekday" : `${text} on ${listDays(days)}`;
  }
  if (rule.frequency === "monthly") {
    if (rule.onLastDay) text += " on the last day";
    else if (rule.monthWeek !== undefined && rule.weekday !== undefined) {
      text += ` on the ${ORDINALS[rule.monthWeek]} ${WEEKDAY_NAMES[rule.weekday]}`;
    }
  }
  if (rule.from === "completion") text += " after it's done";
  if (rule.left !== undefined) text += rule.left === 0 ? ", last one" : `, ${rule.left} more`;
  if (rule.until) text += `, until ${shortDate(rule.until)}`;
  return text;
}

/** The unit word for an interval input, like "week" or "weeks". */
export function recurrenceUnit(frequency: RecurrenceFrequency, interval: number): string {
  const [, one, many] = UNITS[frequency];
  return interval === 1 ? one : many;
}

// Calendar dates (YYYY-MM-DD) are handled as UTC midnights so the math ignores
// time zones and daylight saving.

function parse(date: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return { year, month, day };
}

function format(utc: Date): string {
  return utc.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parse(date);
  return format(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Adds months, landing on `monthDay` (or the month's last day when it's shorter). */
export function addMonths(date: string, months: number, monthDay = parse(date).day): string {
  const { year, month } = parse(date);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return format(new Date(Date.UTC(year, month - 1 + months, Math.min(monthDay, lastDay))));
}

export function daysBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/** 0 for Sunday through 6 for Saturday. */
export function weekdayOf(date: string): number {
  const { year, month, day } = parse(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Which "nth weekday" a date is in its month: 1 to 5 (5 only near the end). */
export function monthWeekOf(date: string): number {
  return Math.ceil(parse(date).day / 7);
}

/** Whether a date is the last of its weekday in its month, like the last Friday. */
export function isLastWeekdayOfMonth(date: string): boolean {
  return parse(addDays(date, 7)).month !== parse(date).month;
}

/** Weeks since a fixed Monday, so "every other week" lines up across months and years. */
function weekIndex(date: string): number {
  // 1970-01-01 was a Thursday, three days after a Monday.
  return Math.floor((daysBetween("1970-01-01", date) + 3) / 7);
}

/** The nth weekday of a month ("the 2nd Tuesday"), or the last one for -1. */
function nthWeekday(year: number, month: number, weekday: number, week: MonthWeek): string {
  if (week === -1) {
    const last = new Date(Date.UTC(year, month, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return format(new Date(Date.UTC(year, month - 1, last.getUTCDate() - back)));
  }
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDay + 7) % 7) + (week - 1) * 7;
  return format(new Date(Date.UTC(year, month - 1, day)));
}

/** The kth monthly occurrence counted from the anchor's month. */
function monthlyAt(rule: Recurrence, anchor: string, k: number): string {
  if (rule.monthWeek !== undefined && rule.weekday !== undefined) {
    const { year, month } = parse(addMonths(anchor, k * rule.interval, 1));
    return nthWeekday(year, month, rule.weekday, rule.monthWeek);
  }
  const monthDay = rule.onLastDay ? 31 : (rule.monthDay ?? parse(anchor).day);
  return addMonths(anchor, k * rule.interval, monthDay);
}

/**
 * The first date in the schedule that's strictly after `after`. The schedule is
 * anchored at `anchor` (usually the current due date): weekly days fall in the
 * anchor's week and every `interval` weeks after it; monthly ones in the anchor's
 * month and every `interval` months after it.
 */
export function firstAfter(rule: Recurrence, anchor: string, after: string): string {
  // Nothing in a series comes before its anchor.
  const dayBefore = addDays(anchor, -1);
  if (after < dayBefore) return firstAfter(rule, anchor, dayBefore);
  if (rule.frequency === "monthly") {
    // A month in the anchor's series can fall before the anchor itself (an earlier
    // weekday in the same month), so start counting from the anchor's month.
    for (let k = 0; ; k += 1) {
      const date = monthlyAt(rule, anchor, k);
      if (date > after) return date;
    }
  }
  const days = rule.weekdays;
  if (rule.frequency === "weekly" && days && days.length > 0) {
    const start = weekIndex(anchor);
    for (let date = addDays(after, 1); ; date = addDays(date, 1)) {
      const weeks = weekIndex(date) - start;
      if (weeks % rule.interval === 0 && days.includes(weekdayOf(date))) return date;
    }
  }
  if (after < anchor) return anchor;
  const step = rule.interval * (rule.frequency === "weekly" ? 7 : 1);
  return addDays(anchor, (Math.floor(daysBetween(anchor, after) / step) + 1) * step);
}

/**
 * The due date of the next task in a series. It follows the schedule from `from` (the
 * current due date, or the completion day when there is none) and skips ahead to the
 * first date after `today`, so finishing late never piles up overdue copies. A rule
 * that counts from completion starts from `today` instead.
 */
export function nextDueDate(rule: Recurrence, from: string, today: string): string {
  if (rule.from === "completion") return firstAfter({ ...rule, monthDay: undefined }, today, today);
  return firstAfter(rule, from, from > today ? from : today);
}

/**
 * The next one in a series once the current one (due `from`) is done on `today`: its
 * due date and the rule it carries on with, or null when the series has ended.
 */
export function nextInSeries(
  rule: Recurrence,
  from: string,
  today: string,
): { dueDate: string; rule: Recurrence } | null {
  if (rule.left === 0) return null;
  const dueDate = nextDueDate(rule, from, today);
  if (rule.until && dueDate > rule.until) return null;
  const monthDay =
    rule.frequency === "monthly" && rule.from !== "completion" && rule.monthWeek === undefined
      ? rule.onLastDay
        ? 31
        : (rule.monthDay ?? parse(from).day)
      : undefined;
  const { monthDay: _previous, left, ...rest } = rule;
  return {
    dueDate,
    rule: {
      ...rest,
      ...(monthDay !== undefined && { monthDay }),
      ...(left !== undefined && { left: left - 1 }),
    },
  };
}

/** Every date in the schedule from `from` through `to`, up to `limit` of them. */
export function occurrencesBetween(
  rule: Recurrence,
  anchor: string,
  from: string,
  to: string,
  limit = 400,
): string[] {
  const dates: string[] = [];
  let date = firstAfter(rule, anchor, addDays(from, -1));
  while (date <= to && dates.length < limit) {
    if (rule.until && date > rule.until) break;
    dates.push(date);
    date = firstAfter(rule, anchor, date);
  }
  return dates;
}
