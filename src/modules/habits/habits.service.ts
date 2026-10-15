import { and, asc, eq, inArray, max } from "drizzle-orm";
import { localDateParts } from "../../server/db/backup";
import type { Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import {
  type HabitCreate,
  type HabitKind,
  type HabitSchedule,
  type HabitStats,
  type HabitUpdate,
  HEAT_WEEKS,
  habitStats,
  weekOf,
} from "../../shared/habits";
import { addDays } from "../../shared/recurrence";
import { readSettings } from "../core/settings.service";
import { studyMinutesByDate } from "../education/streak.service";
import { habitCheckins, habits } from "./schema";

export type HabitJson = {
  id: number;
  name: string;
  kind: HabitKind;
  schedule: HabitSchedule;
  remindAt: string | null;
  archived: boolean;
  startDate: string;
  /** For the study habit: minutes on courses today, and how many count. */
  study: { todayMinutes: number; minimum: number } | null;
} & HabitStats;

type HabitRow = typeof habits.$inferSelect;
type Clock = { now: Date; timeZone: string };

const todayOf = ({ now, timeZone }: Clock) => localDateParts(now, timeZone).date;

function requireHabit(db: Queryable, id: number): HabitRow {
  const row = db.select().from(habits).where(eq(habits.id, id)).get();
  if (!row) throw notFound("That habit doesn't exist. It may have been deleted.");
  return row;
}

/** Days with enough study to count, for the study habit. */
function studyDays(
  db: Queryable,
  clock: Clock,
): { dates: Set<string>; today: number; minimum: number } {
  const minimum = readSettings(db).studyMinimumMinutes;
  const byDate = studyMinutesByDate(db, clock.now, clock.timeZone);
  const dates = new Set(
    [...byDate].filter(([, minutes]) => minutes >= minimum).map(([date]) => date),
  );
  return { dates, today: byDate.get(todayOf(clock)) ?? 0, minimum };
}

function toJson(rows: readonly HabitRow[], db: Queryable, clock: Clock): HabitJson[] {
  const today = todayOf(clock);
  // Enough history for the strength: from the earliest start, or the heat map's first day.
  const heatStart = addDays(weekOf(today), -7 * (HEAT_WEEKS - 1));
  const ids = rows.map((row) => row.id);
  const checkins = new Map<number, Set<string>>();
  if (ids.length > 0) {
    for (const row of db
      .select({ habitId: habitCheckins.habitId, date: habitCheckins.date })
      .from(habitCheckins)
      .where(inArray(habitCheckins.habitId, ids))
      .all()) {
      const dates = checkins.get(row.habitId) ?? new Set<string>();
      dates.add(row.date);
      checkins.set(row.habitId, dates);
    }
  }
  const study = rows.some((row) => row.kind === "study") ? studyDays(db, clock) : null;
  return rows.map((row) => {
    const done = row.kind === "study" && study ? study.dates : (checkins.get(row.id) ?? new Set());
    // A study habit looks back to the study it already has, like the streak does.
    const start =
      row.kind === "study"
        ? row.startDate < heatStart
          ? row.startDate
          : heatStart
        : row.startDate;
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      schedule: row.schedule,
      remindAt: row.remindAt,
      archived: row.archived,
      startDate: row.startDate,
      study:
        row.kind === "study" && study
          ? { todayMinutes: study.today, minimum: study.minimum }
          : null,
      ...habitStats(row.schedule, start, done, today),
    };
  });
}

/** Habits in order: active first, then archived. */
export function listHabits(db: Queryable, clock: Clock): HabitJson[] {
  const rows = db
    .select()
    .from(habits)
    .orderBy(asc(habits.archived), asc(habits.sortOrder), asc(habits.id))
    .all();
  return toJson(rows, db, clock);
}

export function getHabit(db: Queryable, id: number, clock: Clock): HabitJson {
  return toJson([requireHabit(db, id)], db, clock)[0] as HabitJson;
}

export function createHabit(db: Queryable, input: HabitCreate, clock: Clock): HabitJson {
  if (input.kind === "study") {
    const existing = db
      .select({ id: habits.id })
      .from(habits)
      .where(eq(habits.kind, "study"))
      .get();
    if (existing) throw conflict("There's already a study habit. Change that one instead.");
  }
  const last = db
    .select({ value: max(habits.sortOrder) })
    .from(habits)
    .get();
  const row = db
    .insert(habits)
    .values({
      name: input.name.trim(),
      kind: input.kind ?? "check",
      schedule: input.schedule ?? { kind: "daily" },
      remindAt: input.remindAt ?? null,
      startDate: todayOf(clock),
      sortOrder: (last?.value ?? 0) + 1,
    })
    .returning()
    .get();
  return getHabit(db, row.id, clock);
}

export function updateHabit(
  db: Queryable,
  id: number,
  patch: HabitUpdate,
  clock: Clock,
): HabitJson {
  requireHabit(db, id);
  db.update(habits)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.schedule !== undefined ? { schedule: patch.schedule as HabitSchedule } : {}),
      ...(patch.remindAt !== undefined ? { remindAt: patch.remindAt } : {}),
      ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
      updatedAt: new Date(),
    })
    .where(eq(habits.id, id))
    .run();
  return getHabit(db, id, clock);
}

export function deleteHabit(db: Queryable, id: number): void {
  db.transaction((tx) => {
    requireHabit(tx, id);
    tx.delete(habitCheckins).where(eq(habitCheckins.habitId, id)).run();
    tx.delete(habits).where(eq(habits.id, id)).run();
  });
}

/** Checks a habit off for a day, or takes the check-in back. Not for future days. */
export function setCheckin(
  db: Queryable,
  id: number,
  date: string,
  done: boolean,
  clock: Clock,
): HabitJson {
  const row = requireHabit(db, id);
  if (row.kind === "study") {
    throw badRequest(
      "The study habit is checked off by time logged on courses. Log study time instead.",
    );
  }
  if (date > todayOf(clock)) throw badRequest("You can't check off a day that hasn't come yet.");
  if (done) {
    db.insert(habitCheckins).values({ habitId: id, date }).onConflictDoNothing().run();
  } else {
    db.delete(habitCheckins)
      .where(and(eq(habitCheckins.habitId, id), eq(habitCheckins.date, date)))
      .run();
  }
  return getHabit(db, id, clock);
}

/** Habits with a reminder at a time, not yet done today, that are meant for today. */
export function habitsToRemind(db: Queryable, clock: Clock): HabitJson[] {
  return listHabits(db, clock).filter(
    (habit) =>
      !habit.archived && habit.remindAt !== null && habit.scheduledToday && !habit.doneToday,
  );
}
