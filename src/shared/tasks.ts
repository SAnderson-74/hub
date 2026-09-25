import { z } from "zod";
import { tagNamesSchema } from "./entities";

export const PROJECT_KINDS = ["general", "course", "homelab", "business", "resale"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  general: "General",
  course: "Course",
  homelab: "Homelab",
  business: "Business",
  resale: "Resale",
};

/** Board columns, in order. */
export const TASK_STATUSES = ["backlog", "todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

/** Priority is stored as 0-3 so it sorts naturally. */
export const TASK_PRIORITY_LABELS = ["None", "Low", "Medium", "High"] as const;
export type TaskPriority = 0 | 1 | 2 | 3;

const id = z.number().int().positive();
const notes = z.string().max(20_000, "Keep notes under 20,000 characters.");
const sortOrder = z.number();
const dueDate = z.iso.date("Use a date like 2030-01-31.");
const priority = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const projectName = z
  .string()
  .trim()
  .min(1, "Give the project a name.")
  .max(100, "Keep project names under 100 characters.");

export const projectCreateSchema = z
  .object({
    name: projectName,
    kind: z.enum(PROJECT_KINDS).optional(),
    notes: notes.optional(),
  })
  .strict();
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = z
  .object({
    name: projectName,
    kind: z.enum(PROJECT_KINDS),
    notes,
    archived: z.boolean(),
    sortOrder,
  })
  .partial()
  .strict();
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

const taskTitle = z
  .string()
  .trim()
  .min(1, "Give the task a title.")
  .max(200, "Keep task titles under 200 characters.");

export const taskCreateSchema = z
  .object({
    title: taskTitle,
    notes: notes.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: priority.optional(),
    dueDate: dueDate.nullable().optional(),
    /** Leave out or null for the inbox. Subtasks always use their parent's project. */
    projectId: id.nullable().optional(),
    parentId: id.nullable().optional(),
    tags: tagNamesSchema.optional(),
  })
  .strict();
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: taskTitle,
    notes,
    status: z.enum(TASK_STATUSES),
    priority,
    dueDate: dueDate.nullable(),
    projectId: id.nullable(),
    parentId: id.nullable(),
    /** Replaces the task's tags. */
    tags: tagNamesSchema,
    sortOrder,
  })
  .partial()
  .strict();
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

/** Filters for the task list. The list holds top-level tasks; subtasks come with each task. */
export const taskListQuerySchema = z
  .object({
    /** A project id, or "inbox" for tasks without a project. */
    projectId: z.union([z.literal("inbox"), z.coerce.number().int().positive()]),
    /** One status or several separated by commas, like "todo,doing". */
    status: z
      .string()
      .transform((value) => value.split(",").map((part) => part.trim()))
      .pipe(z.array(z.enum(TASK_STATUSES))),
    tag: z.string().trim().min(1),
    /** Tasks due on or before this date. */
    dueBy: dueDate,
  })
  .partial();
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
