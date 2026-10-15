import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { HABIT_KINDS, type HabitSchedule } from "../../shared/habits";

/**
 * Something done on a schedule. A "study" habit is the study streak as a habit: it's
 * checked off by time logged on courses, so it has no check-ins of its own.
 */
export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: HABIT_KINDS }).notNull().default("check"),
  schedule: text("schedule", { mode: "json" })
    .$type<HabitSchedule>()
    .notNull()
    .default({ kind: "daily" }),
  /** The first day it counts from (YYYY-MM-DD), so days before it aren't misses. */
  startDate: text("start_date").notNull(),
  /** "07:30" in Hub's time zone, or null for no reminder. */
  remindAt: text("remind_at"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: real("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A habit done on a day: one row per habit and date. */
export const habitCheckins = sqliteTable(
  "habit_checkins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id),
    date: text("date").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("habit_checkins_habit_date_unique").on(t.habitId, t.date),
    index("habit_checkins_date_idx").on(t.date),
  ],
);
