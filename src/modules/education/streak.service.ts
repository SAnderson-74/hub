import { eq } from "drizzle-orm";
import { localDateParts } from "../../server/db/backup";
import type { Queryable } from "../../server/db/client";
import { addDays } from "../../shared/recurrence";
import { countStreak, type StudyStreak, weekdayIndex } from "../../shared/streak";
import { timeEntries } from "../time/schema";

/**
 * The study streak from time logged on courses. Each entry counts on the day it
 * started in `timeZone`, like the week chart, and a running course timer counts up
 * to `now`. Time on a course that was later deleted still counts.
 */
export function studyStreak(
  db: Queryable,
  { now, timeZone, minimum }: { now: Date; timeZone: string; minimum: number },
): StudyStreak {
  const today = localDateParts(now, timeZone).date;
  const minutesByDate = new Map<string, number>();
  const rows = db
    .select({
      startedAt: timeEntries.startedAt,
      minutes: timeEntries.minutes,
    })
    .from(timeEntries)
    .where(eq(timeEntries.subjectType, "course"))
    .all();
  for (const row of rows) {
    const minutes =
      row.minutes ?? Math.max(0, Math.floor((now.getTime() - row.startedAt.getTime()) / 60_000));
    const date = localDateParts(row.startedAt, timeZone).date;
    minutesByDate.set(date, (minutesByDate.get(date) ?? 0) + minutes);
  }

  const first = addDays(today, -(weekdayIndex(today) + 21));
  const days = [];
  for (let date = first; date <= today; date = addDays(date, 1)) {
    days.push({ date, minutes: minutesByDate.get(date) ?? 0 });
  }
  return {
    minimum,
    today,
    todayMinutes: minutesByDate.get(today) ?? 0,
    ...countStreak(minutesByDate, today, minimum),
    days,
  };
}
