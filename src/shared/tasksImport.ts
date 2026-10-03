import { z } from "zod";
import { hasLongNumber } from "./receipts";
import { parseImportDate } from "./resaleImport";

// The `hub-tasks/v1` format (docs/CLAUDE_PROJECT.md): projects, tasks with subtasks,
// and goals with milestones, as a Claude Project reads them from notes, lists, or a
// screenshot. Pasted text is untrusted: every field has a size limit, unknown fields
// are ignored, and nothing is saved before a preview.

const text = (max: number) => z.string().max(max, `Keep this under ${max} characters.`);

export const IMPORT_PRIORITIES = ["none", "low", "medium", "high"] as const;
export type ImportPriority = (typeof IMPORT_PRIORITIES)[number];
/** Open statuses only: done work isn't worth importing. */
export const IMPORT_STATUSES = ["backlog", "todo", "doing"] as const;

const taskSchema = z.object({
  title: text(200),
  /** A project's name, new or already in Hub. Left out for the inbox. */
  project: text(100).optional(),
  due: text(40).optional(),
  priority: z.enum(IMPORT_PRIORITIES).optional(),
  status: z.enum(IMPORT_STATUSES).optional(),
  notes: text(2_000).optional(),
  subtasks: z.array(text(200)).max(20, "Keep tasks to 20 subtasks.").optional(),
});

const goalSchema = z.object({
  title: text(200),
  targetDate: text(40).optional(),
  notes: text(2_000).optional(),
  milestones: z
    .array(z.object({ title: text(200), targetDate: text(40).optional() }))
    .max(20, "Keep goals to 20 milestones.")
    .optional(),
});

export const tasksDocumentSchema = z
  .object({
    format: z.literal("hub-tasks/v1", {
      error: 'This isn\'t a hub-tasks/v1 document. Its "format" should be "hub-tasks/v1".',
    }),
    projects: z
      .array(z.object({ name: text(100), notes: text(2_000).optional() }))
      .max(20, "Paste up to 20 projects at a time.")
      .optional(),
    tasks: z.array(taskSchema).max(200, "Paste up to 200 tasks at a time.").optional(),
    goals: z.array(goalSchema).max(20, "Paste up to 20 goals at a time.").optional(),
  })
  .refine(
    (document) =>
      (document.projects?.length ?? 0) +
        (document.tasks?.length ?? 0) +
        (document.goals?.length ?? 0) >
      0,
    "There are no projects, tasks, or goals in it.",
  );
export type TasksDocument = z.input<typeof tasksDocumentSchema>;

/** A pasted document, as the browser sends it to be previewed or added. */
export const tasksImportSchema = z.object({ document: tasksDocumentSchema }).strict();
export type TasksImportInput = z.input<typeof tasksImportSchema>;

export type ReadTask = {
  title: string;
  project: string;
  dueDate: string | null;
  priority: 0 | 1 | 2 | 3;
  status: (typeof IMPORT_STATUSES)[number];
  notes: string;
  subtasks: string[];
  /** Said in the preview; none of them stop the task being added. */
  notices: string[];
};

export type ReadGoal = {
  title: string;
  targetDate: string | null;
  notes: string;
  milestones: Array<{ title: string; targetDate: string | null }>;
  notices: string[];
};

const LONG_NUMBER_NOTICE =
  "It has a long number. Check it isn't an account, card, or ID number before adding it.";

/** A date, or null with a notice when there's text Hub can't read as one. */
function readDate(value: string | undefined, what: string, notices: string[]): string | null {
  const textValue = value?.trim() ?? "";
  if (!textValue) return null;
  const date = parseImportDate(textValue);
  if (!date)
    notices.push(
      `${what} "${textValue.slice(0, 40)}" isn't a date Hub can read, so it's left off.`,
    );
  return date;
}

/**
 * Reads a pasted document. Titles are trimmed, and items without one are dropped;
 * unreadable dates are left off with a notice. Long numbers aren't changed, since a
 * task can need one (a phone number to call), but the preview asks to check them.
 */
export function readTasksDocument(document: z.infer<typeof tasksDocumentSchema>): {
  projects: Array<{ name: string; notes: string }>;
  tasks: ReadTask[];
  goals: ReadGoal[];
} {
  const projects = (document.projects ?? [])
    .map((project) => ({ name: project.name.trim(), notes: project.notes?.trim() ?? "" }))
    .filter((project) => project.name !== "");

  const tasks = (document.tasks ?? []).flatMap((task): ReadTask[] => {
    const title = task.title.trim();
    if (!title) return [];
    const notices: string[] = [];
    const dueDate = readDate(task.due, "Due", notices);
    const notes = task.notes?.trim() ?? "";
    const subtasks = (task.subtasks ?? []).map((subtask) => subtask.trim()).filter(Boolean);
    if ([title, notes, ...subtasks].some(hasLongNumber)) notices.push(LONG_NUMBER_NOTICE);
    return [
      {
        title,
        project: task.project?.trim() ?? "",
        dueDate,
        priority: IMPORT_PRIORITIES.indexOf(task.priority ?? "none") as ReadTask["priority"],
        status: task.status ?? "todo",
        notes,
        subtasks,
        notices,
      },
    ];
  });

  const goals = (document.goals ?? []).flatMap((goal): ReadGoal[] => {
    const title = goal.title.trim();
    if (!title) return [];
    const notices: string[] = [];
    const targetDate = readDate(goal.targetDate, "Target date", notices);
    const notes = goal.notes?.trim() ?? "";
    const milestones = (goal.milestones ?? [])
      .map((milestone) => ({
        title: milestone.title.trim(),
        targetDate: readDate(milestone.targetDate, "A milestone's date", notices),
      }))
      .filter((milestone) => milestone.title !== "");
    if ([title, notes, ...milestones.map((milestone) => milestone.title)].some(hasLongNumber)) {
      notices.push(LONG_NUMBER_NOTICE);
    }
    return [{ title, targetDate, notes, milestones, notices }];
  });

  return { projects, tasks, goals };
}

/** What adding a document did, or would do. */
export type TasksImportResult = {
  /** Project names that will be (or were) made. */
  projectsCreated: string[];
  tasks: Array<{
    title: string;
    project: string | null;
    dueDate: string | null;
    subtasks: number;
    /** duplicate: an open task with this title is already in that project (or the inbox). */
    outcome: "create" | "duplicate";
    notices: string[];
  }>;
  goals: Array<{
    title: string;
    targetDate: string | null;
    milestones: number;
    /** duplicate: an active goal with this title is already in Hub. */
    outcome: "create" | "duplicate";
    notices: string[];
  }>;
  created: { tasks: number; subtasks: number; goals: number; milestones: number };
};
