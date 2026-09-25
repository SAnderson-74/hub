import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ENTITY_TYPES } from "../../shared/entities";

/**
 * Time spent, optionally on something (a task, a project, and later courses and
 * resale items). An entry without an end is the running timer; there is at most one.
 * The subject is kept after that entity is deleted, so logged time isn't lost.
 */
export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    /** Whole minutes between start and end, set when the entry ends. */
    minutes: integer("minutes"),
    note: text("note").notNull().default(""),
    subjectType: text("subject_type", { enum: ENTITY_TYPES }),
    subjectId: integer("subject_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("time_entries_started_idx").on(t.startedAt),
    index("time_entries_subject_idx").on(t.subjectType, t.subjectId),
  ],
);
