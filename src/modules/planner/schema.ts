import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ReviewStepId } from "../../shared/planner";

/** A week's review: the steps ticked off, and when it was finished. One row per week. */
export const weeklyReviews = sqliteTable("weekly_reviews", {
  /** The Monday the week starts on, YYYY-MM-DD. */
  week: text("week").primaryKey(),
  /** Steps ticked off by hand. */
  done: text("done", { mode: "json" }).$type<ReviewStepId[]>().notNull().default([]),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
