import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { PROJECT_KINDS, TASK_STATUSES, type TaskPriority } from "../../shared/tasks";

// Ids use AUTOINCREMENT so a deleted row's id is never reused: links and the
// activity log refer to entities by id.

const timestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A container for tasks. Archived projects keep their tasks but drop out of pickers. */
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: PROJECT_KINDS }).notNull().default("general"),
  notes: text("notes").notNull().default(""),
  sortOrder: real("sort_order").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  ...timestamps(),
});

/**
 * Tasks and their subtasks (one level deep). A task without a project is in the inbox.
 * `sort_order` is fractional so a task can be moved between two others without
 * renumbering the rest.
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").references(() => projects.id),
    parentId: integer("parent_id").references((): AnySQLiteColumn => tasks.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    priority: integer("priority").$type<TaskPriority>().notNull().default(0),
    dueDate: text("due_date"),
    sortOrder: real("sort_order").notNull().default(0),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    ...timestamps(),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_due_date_idx").on(t.dueDate),
  ],
);
