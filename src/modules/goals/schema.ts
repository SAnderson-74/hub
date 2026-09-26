import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { GOAL_STATUSES, PROGRESS_MODES } from "../../shared/goals";

const timestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Something to reach by a date. Progress comes from its milestones, linked tasks
 * (links with relation "goal"), an amount of money, or a percentage set by hand.
 */
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  targetDate: text("target_date"),
  status: text("status", { enum: GOAL_STATUSES }).notNull().default("active"),
  /** When the status last changed to achieved or dropped. */
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  progressMode: text("progress_mode", { enum: PROGRESS_MODES }).notNull().default("milestones"),
  manualPercent: integer("manual_percent").notNull().default(0),
  targetCents: integer("target_cents"),
  currentCents: integer("current_cents").notNull().default(0),
  sortOrder: real("sort_order").notNull().default(0),
  ...timestamps(),
});

/** Steps toward a goal. Deleted with their goal. */
export const milestones = sqliteTable(
  "milestones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    goalId: integer("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    targetDate: text("target_date"),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    sortOrder: real("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("milestones_goal_idx").on(t.goalId)],
);
