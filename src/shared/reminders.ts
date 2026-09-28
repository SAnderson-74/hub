import { z } from "zod";

// Reminders Hub sends through Home Assistant's reminder webhook: a morning digest,
// things coming due, and a nudge when the study streak would break. Each has its own
// time, in Hub's time zone.

export const REMINDER_KINDS = ["digest", "due_soon", "streak"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_LABELS: Record<ReminderKind, string> = {
  digest: "Daily digest",
  due_soon: "Due soon",
  streak: "Study streak at risk",
};

/** How far ahead "due soon" looks, in days. 0 is today only. */
export const DUE_SOON_DAYS = [0, 1, 2, 3, 7] as const;
export type DueSoonDays = (typeof DUE_SOON_DAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30.");

const reminder = { enabled: z.boolean(), time };

export const remindersSchema = z
  .object({
    digest: z.object(reminder).strict(),
    dueSoon: z
      .object({
        ...reminder,
        days: z.union(
          DUE_SOON_DAYS.map((days) => z.literal(days)),
          "Look 0, 1, 2, 3, or 7 days ahead.",
        ),
      })
      .strict(),
    streak: z.object(reminder).strict(),
  })
  .strict();
export type ReminderSettings = z.infer<typeof remindersSchema>;

export const defaultReminders: ReminderSettings = {
  digest: { enabled: true, time: "07:30" },
  dueSoon: { enabled: true, time: "18:00", days: 1 },
  streak: { enabled: true, time: "20:00" },
};

/** Minutes after midnight for "07:30". */
export const minutesOf = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

/** "7:30 AM" */
export function formatTime(value: string): string {
  const minutes = minutesOf(value);
  return new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)).toLocaleTimeString(
    "en-US",
    { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
  );
}

/**
 * A reminder that was missed (Hub was down or Home Assistant didn't answer) is still
 * sent this long after its time, but not later: no morning digest in the evening.
 */
export const LATE_WINDOW_MINUTES = 180;

/** Whether a reminder set for `time` should go out at `nowMinutes` past midnight. */
export const inWindow = (time: string, nowMinutes: number) => {
  const start = minutesOf(time);
  return nowMinutes >= start && nowMinutes < start + LATE_WINDOW_MINUTES;
};
