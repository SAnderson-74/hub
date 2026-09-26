import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ASSESSMENT_KINDS, COURSE_STATUSES } from "../../shared/education";

const timestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A block of study, like a semester, with a credit goal. */
export const terms = sqliteTable("terms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  creditGoal: integer("credit_goal"),
  ...timestamps(),
});

/**
 * A course in a term, with the window it's planned for. Deleted with its term.
 * `completed_on` is the day it was passed or transferred.
 */
export const courses = sqliteTable(
  "courses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    termId: integer("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    code: text("code").notNull().default(""),
    title: text("title").notNull(),
    credits: real("credits").notNull().default(0),
    status: text("status", { enum: COURSE_STATUSES }).notNull().default("not_started"),
    plannedStart: text("planned_start"),
    plannedEnd: text("planned_end"),
    completedOn: text("completed_on"),
    notes: text("notes").notNull().default(""),
    sortOrder: real("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("courses_term_idx").on(t.termId)],
);

/** Exams, projects, and other work a course needs. Deleted with their course. */
export const assessments = sqliteTable(
  "assessments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ASSESSMENT_KINDS }).notNull().default("other"),
    label: text("label").notNull(),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    ...timestamps(),
  },
  (t) => [index("assessments_course_idx").on(t.courseId)],
);
