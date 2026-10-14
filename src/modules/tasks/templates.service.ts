import { asc, eq } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import { addDays, daysBetween } from "../../shared/recurrence";
import type {
  TemplateBody,
  TemplateCreate,
  TemplateFrom,
  TemplateTask,
  TemplateUse,
} from "../../shared/templates";
import { createProject, getProject } from "./projects.service";
import { taskTemplates } from "./schema";
import { createTask, getTask, listTasks, type TaskJson } from "./tasks.service";

type TemplateRow = typeof taskTemplates.$inferSelect;

export type TemplateJson = {
  id: number;
  name: string;
  body: TemplateBody;
  /** Tasks it adds, checklist items (subtasks) included. */
  taskCount: number;
  updatedAt: string;
};

const json = (row: TemplateRow): TemplateJson => ({
  id: row.id,
  name: row.name,
  body: row.body,
  taskCount: row.body.tasks.reduce((sum, task) => sum + 1 + (task.subtasks?.length ?? 0), 0),
  updatedAt: row.updatedAt.toISOString(),
});

export function listTemplates(db: Queryable): TemplateJson[] {
  return db
    .select()
    .from(taskTemplates)
    .orderBy(asc(taskTemplates.name), asc(taskTemplates.id))
    .all()
    .map(json);
}

function requireTemplate(db: Queryable, id: number): TemplateRow {
  const row = db.select().from(taskTemplates).where(eq(taskTemplates.id, id)).get();
  if (!row) throw notFound("That template doesn't exist. It may have been deleted.");
  return row;
}

export function createTemplate(db: Queryable, input: TemplateCreate): TemplateJson {
  const now = new Date();
  return json(
    db
      .insert(taskTemplates)
      .values({ name: input.name, body: input.body, createdAt: now, updatedAt: now })
      .returning()
      .get(),
  );
}

export function renameTemplate(db: Queryable, id: number, name: string): TemplateJson {
  requireTemplate(db, id);
  return json(
    db
      .update(taskTemplates)
      .set({ name, updatedAt: new Date() })
      .where(eq(taskTemplates.id, id))
      .returning()
      .get(),
  );
}

export function deleteTemplate(db: Queryable, id: number): void {
  requireTemplate(db, id);
  db.delete(taskTemplates).where(eq(taskTemplates.id, id)).run();
}

/**
 * A task and its subtasks as template tasks. Due dates become days after the earliest
 * due date among everything saved, so the first one lands on the day it's used.
 */
function toTemplateTasks(saved: Array<TaskJson & { subtasks: TaskJson[] }>): TemplateTask[] {
  const dates = saved
    .flatMap((task) => [task.dueDate, ...task.subtasks.map((sub) => sub.dueDate)])
    .filter((date): date is string => date !== null)
    .sort();
  const first = dates[0];
  const dueIn = (date: string | null) =>
    date === null || first === undefined ? null : daysBetween(first, date);
  return saved.map((task) => ({
    title: task.title,
    ...(task.notes ? { notes: task.notes } : {}),
    ...(task.priority > 0 ? { priority: task.priority } : {}),
    dueIn: dueIn(task.dueDate),
    estimateMinutes: task.estimateMinutes,
    ...(task.tags.length > 0 ? { tags: task.tags.map((tag) => tag.name) } : {}),
    ...(task.subtasks.length > 0
      ? {
          subtasks: task.subtasks.map((sub) => ({
            title: sub.title,
            dueIn: dueIn(sub.dueDate),
            estimateMinutes: sub.estimateMinutes,
          })),
        }
      : {}),
  }));
}

/** Saves a task with its checklist, or a project with its open tasks, as a template. */
export function templateFrom(db: Queryable, input: TemplateFrom): TemplateJson {
  if (input.taskId !== undefined) {
    const task = getTask(db, input.taskId);
    return createTemplate(db, {
      name: input.name,
      body: { project: null, tasks: toTemplateTasks([task]) },
    });
  }
  const project = getProject(db, input.projectId ?? 0);
  const open = listTasks(db, { projectId: project.id, status: ["backlog", "todo", "doing"] });
  if (open.length === 0) {
    throw badRequest("That project has no open tasks to save. Add some first.");
  }
  return createTemplate(db, {
    name: input.name,
    body: {
      project: { name: project.name, kind: project.kind },
      tasks: toTemplateTasks(open.map((task) => getTask(db, task.id))),
    },
  });
}

/**
 * Adds the template's tasks, with due dates counted from `date`. A project template
 * makes a new project; a task template adds to the given project or the inbox.
 */
export function useTemplate(
  db: Db,
  id: number,
  input: TemplateUse,
  actor: string,
): { projectId: number | null; taskIds: number[] } {
  const template = requireTemplate(db, id).body;
  const due = (days: number | null | undefined) =>
    days === null || days === undefined ? null : addDays(input.date, days);
  return db.transaction((tx) => {
    const projectId = template.project
      ? createProject(tx, template.project, actor).id
      : (input.projectId ?? null);
    const taskIds: number[] = [];
    for (const item of template.tasks) {
      const task = createTask(
        tx,
        {
          title: item.title,
          notes: item.notes,
          priority: item.priority,
          dueDate: due(item.dueIn),
          estimateMinutes: item.estimateMinutes ?? null,
          tags: item.tags,
          projectId,
        },
        actor,
      );
      taskIds.push(task.id);
      for (const sub of item.subtasks ?? []) {
        createTask(
          tx,
          {
            title: sub.title,
            parentId: task.id,
            dueDate: due(sub.dueIn),
            estimateMinutes: sub.estimateMinutes ?? null,
          },
          actor,
        );
      }
    }
    return { projectId, taskIds };
  });
}
