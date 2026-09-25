import { z } from "zod";

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** What people can set on a task: how often, and every how many days, weeks, or months. */
export const recurrenceSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z
      .number()
      .int()
      .min(1, "Repeat at least every 1.")
      .max(99, "Repeat at most every 99.")
      .default(1),
  })
  .strict();
export type RecurrenceInput = z.input<typeof recurrenceSchema>;

/**
 * A stored rule. `monthDay` is kept by the server for monthly repeats, so a task due
 * on the 31st goes back to the 31st after a shorter month.
 */
export type Recurrence = z.infer<typeof recurrenceSchema> & { monthDay?: number };

const UNITS: Record<RecurrenceFrequency, [string, string, string]> = {
  daily: ["Daily", "day", "days"],
  weekly: ["Weekly", "week", "weeks"],
  monthly: ["Monthly", "month", "months"],
};

/** "Weekly", "Every 2 weeks". */
export function describeRecurrence(rule: { frequency: RecurrenceFrequency; interval: number }) {
  const [single, , plural] = UNITS[rule.frequency];
  return rule.interval === 1 ? single : `Every ${rule.interval} ${plural}`;
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

/**
 * The due date of the next task in a series. It follows the schedule from `from` (the
 * current due date, or the completion day when there is none) and skips ahead to the
 * first date after `today`, so finishing late never piles up overdue copies.
 */
export function nextDueDate(rule: Recurrence, from: string, today: string): string {
  if (rule.frequency === "monthly") {
    const monthDay = rule.monthDay ?? parse(from).day;
    let steps = 1;
    let next = addMonths(from, rule.interval, monthDay);
    while (next <= today) {
      steps += 1;
      next = addMonths(from, rule.interval * steps, monthDay);
    }
    return next;
  }
  const stepDays = rule.interval * (rule.frequency === "weekly" ? 7 : 1);
  const behind = Math.max(0, daysBetween(from, today));
  const steps = Math.floor(behind / stepDays) + 1;
  return addDays(from, steps * stepDays);
}
