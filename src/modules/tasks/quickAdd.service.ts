import type { Queryable } from "../../server/db/client";
import { badRequest } from "../../server/errors";
import { parseQuickAdd, type QuickAddInput } from "../../shared/quickAdd";
import { taskCreateSchema } from "../../shared/tasks";
import { listProjects } from "./projects.service";
import { createTask, type TaskDetailJson } from "./tasks.service";

/**
 * Adds a task from one line of text, read the same way as the Tasks page reads it
 * ("Renew registration next Fri !high #car every year"). For iOS Shortcuts and other
 * places without the page's chips.
 */
export function quickAddTask(
  db: Queryable,
  input: QuickAddInput,
  today: string,
  actor: string,
): TaskDetailJson {
  const projects = listProjects(db).map(({ id, name, archived }) => ({ id, name, archived }));
  const parsed = parseQuickAdd(input.text, { today, projects });
  if (!parsed.title) throw badRequest("Add a few words for the title, not just a date or tags.");
  const task = taskCreateSchema.safeParse({
    title: parsed.title,
    dueDate: parsed.dueDate,
    projectId: parsed.projectId ?? input.projectId ?? null,
    tags: parsed.tags,
    recurrence: parsed.recurrence,
    ...(parsed.priority === null ? {} : { priority: parsed.priority }),
  });
  if (!task.success) {
    throw badRequest(task.error.issues[0]?.message ?? "That task isn't valid.");
  }
  return createTask(db, task.data, actor);
}
