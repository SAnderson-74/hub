import { z } from "zod";
import { PROJECT_KINDS } from "./tasks";

// Templates: reusable tasks and projects. Due dates are kept as days after the day
// the template is used, so "Trip prep" used on the 3rd and on the 20th lands right
// both times. A task's subtasks are its checklist.

const title = z
  .string()
  .trim()
  .min(1, "Give each task a title.")
  .max(200, "Keep task titles under 200 characters.");
const dueIn = z
  .number()
  .int()
  .min(-365, "Keep due dates within a year of the day it's used.")
  .max(365, "Keep due dates within a year of the day it's used.")
  .nullable()
  .optional();
const estimate = z
  .number()
  .int()
  .min(1)
  .max(24 * 60)
  .nullable()
  .optional();
const priority = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional();

const subtaskSchema = z.object({ title, dueIn, estimateMinutes: estimate }).strict();

const templateTaskSchema = z
  .object({
    title,
    notes: z.string().max(20_000).optional(),
    priority,
    /** Days after the day it's used; 0 is that day, null or left out is no due date. */
    dueIn,
    estimateMinutes: estimate,
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    subtasks: z.array(subtaskSchema).max(100, "Keep checklists under 100 items.").optional(),
  })
  .strict();
export type TemplateTask = z.infer<typeof templateTaskSchema>;

export const templateBodySchema = z
  .object({
    /** Set for a project template; using it makes a new project with this name. */
    project: z
      .object({
        name: z.string().trim().min(1).max(100),
        kind: z.enum(PROJECT_KINDS),
      })
      .strict()
      .nullable(),
    tasks: z
      .array(templateTaskSchema)
      .min(1, "A template needs at least one task.")
      .max(200, "Keep templates under 200 tasks."),
  })
  .strict();
export type TemplateBody = z.infer<typeof templateBodySchema>;

const templateName = z
  .string()
  .trim()
  .min(1, "Give the template a name.")
  .max(100, "Keep template names under 100 characters.");

export const templateCreateSchema = z
  .object({ name: templateName, body: templateBodySchema })
  .strict();
export type TemplateCreate = z.infer<typeof templateCreateSchema>;

export const templateUpdateSchema = z.object({ name: templateName }).strict();

/** Saves a task (with its subtasks) or a project (with its open tasks) as a template. */
export const templateFromSchema = z
  .object({
    name: templateName,
    taskId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
  })
  .strict()
  .refine((input) => (input.taskId === undefined) !== (input.projectId === undefined), {
    message: "Pick a task or a project to save.",
  });
export type TemplateFrom = z.infer<typeof templateFromSchema>;

export const templateUseSchema = z
  .object({
    /** The day due dates count from. */
    date: z.iso.date("Use a date like 2030-01-31."),
    /** For task templates: the project to add them to, or null for the inbox. */
    projectId: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type TemplateUse = z.infer<typeof templateUseSchema>;
