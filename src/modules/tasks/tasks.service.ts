import { and, asc, count, eq, inArray, isNull, lte, type SQL, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import {
  addDays,
  daysBetween,
  describeRecurrence,
  nextDueDate,
  type Recurrence,
  type RecurrenceFrequency,
} from "../../shared/recurrence";
import type {
  TaskCreate,
  TaskListQuery,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
} from "../../shared/tasks";
import { changedFields, recordActivity } from "../core/activity.service";
import { detachEntities } from "../core/entities";
import { taggings, tags } from "../core/schema";
import { setTags, type TagJson, tagsFor } from "../core/tags.service";
import { projects, tasks } from "./schema";

type TaskRow = typeof tasks.$inferSelect;

export type TaskJson = {
  id: number;
  projectId: number | null;
  parentId: number | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  sortOrder: number;
  completedAt: string | null;
  recurrence: { frequency: RecurrenceFrequency; interval: number } | null;
  createdAt: string;
  updatedAt: string;
  tags: TagJson[];
  subtaskCount: number;
  subtasksDone: number;
};

export type TaskDetailJson = TaskJson & { subtasks: TaskJson[] };

const inOrder = [asc(tasks.sortOrder), asc(tasks.id)];

/** Adds tags and subtask counts to task rows. */
function withExtras(db: Queryable, rows: TaskRow[]): TaskJson[] {
  const ids = rows.map((row) => row.id);
  const tagMap = tagsFor(db, "task", ids);
  const counts = new Map(
    ids.length === 0
      ? []
      : db
          .select({
            parentId: tasks.parentId,
            total: count(),
            done: sql<number>`sum(${tasks.status} = 'done')`.mapWith(Number),
          })
          .from(tasks)
          .where(inArray(tasks.parentId, ids))
          .groupBy(tasks.parentId)
          .all()
          .map((row) => [row.parentId, row]),
  );
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    title: row.title,
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    sortOrder: row.sortOrder,
    completedAt: row.completedAt?.toISOString() ?? null,
    recurrence: row.recurrence
      ? { frequency: row.recurrence.frequency, interval: row.recurrence.interval }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tags: tagMap.get(row.id) ?? [],
    subtaskCount: counts.get(row.id)?.total ?? 0,
    subtasksDone: counts.get(row.id)?.done ?? 0,
  }));
}

/** Top-level tasks matching the filters, in sort order. */
export function listTasks(db: Queryable, query: TaskListQuery): TaskJson[] {
  const conditions: SQL[] = [isNull(tasks.parentId)];
  if (query.projectId === "inbox") conditions.push(isNull(tasks.projectId));
  else if (query.projectId !== undefined) conditions.push(eq(tasks.projectId, query.projectId));
  if (query.status) conditions.push(inArray(tasks.status, query.status));
  if (query.dueBy) conditions.push(lte(tasks.dueDate, query.dueBy));
  if (query.tag) {
    const tagged = db
      .select({ id: taggings.entityId })
      .from(taggings)
      .innerJoin(tags, eq(taggings.tagId, tags.id))
      .where(and(eq(taggings.entityType, "task"), sql`lower(${tags.name}) = lower(${query.tag})`));
    conditions.push(inArray(tasks.id, tagged));
  }
  const rows = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(...inOrder)
    .all();
  return withExtras(db, rows);
}

function findTask(db: Queryable, id: number): TaskRow | undefined {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

function requireTask(db: Queryable, id: number): TaskRow {
  const row = findTask(db, id);
  if (!row) throw notFound("That task doesn't exist. It may have been deleted.");
  return row;
}

/** One task with its subtasks. */
export function getTask(db: Queryable, id: number): TaskDetailJson {
  const [task] = withExtras(db, [requireTask(db, id)]);
  if (!task) throw notFound("That task doesn't exist. It may have been deleted.");
  const subtasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, id))
    .orderBy(...inOrder)
    .all();
  return { ...task, subtasks: withExtras(db, subtasks) };
}

function nextSortOrder(db: Queryable): number {
  const row = db
    .select({ last: sql<number | null>`max(${tasks.sortOrder})` })
    .from(tasks)
    .get();
  return (row?.last ?? 0) + 1;
}

/**
 * Where a task will live after a create or update. Subtasks go one level deep and
 * always share their parent's project.
 */
function placeTask(
  db: Queryable,
  task: { id: number | null; parentId: number | null; projectId: number | null },
  requestedProjectId: number | null | undefined,
): { parentId: number | null; projectId: number | null } {
  if (task.parentId !== null) {
    if (task.parentId === task.id) throw badRequest("A task can't be its own subtask.");
    const parent = findTask(db, task.parentId);
    if (!parent) throw badRequest("The parent task doesn't exist. It may have been deleted.");
    if (parent.parentId !== null) {
      throw badRequest("Subtasks can't have subtasks of their own. Pick a top-level task.");
    }
    if (task.id !== null) {
      const child = db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.parentId, task.id))
        .get();
      if (child) {
        throw badRequest(
          "This task has subtasks, so it can't become a subtask. Move its subtasks out first.",
        );
      }
    }
    if (requestedProjectId !== undefined && requestedProjectId !== parent.projectId) {
      throw badRequest(
        "Subtasks stay in their parent task's project. Move the parent, or make this a top-level task first.",
      );
    }
    return { parentId: parent.id, projectId: parent.projectId };
  }
  if (task.projectId !== null) {
    const project = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, task.projectId))
      .get();
    if (!project) throw badRequest("That project doesn't exist. It may have been deleted.");
  }
  return { parentId: null, projectId: task.projectId };
}

export function createTask(db: Db, input: TaskCreate, actor: string): TaskDetailJson {
  return db.transaction((tx) => {
    const place = placeTask(
      tx,
      { id: null, parentId: input.parentId ?? null, projectId: input.projectId ?? null },
      input.projectId,
    );
    const recurrence = input.recurrence ?? null;
    if (recurrence && place.parentId !== null) throw badRequest(SUBTASKS_DONT_REPEAT);
    const status = input.status ?? "todo";
    const now = new Date();
    const row = tx
      .insert(tasks)
      .values({
        ...place,
        title: input.title,
        notes: input.notes ?? "",
        status,
        priority: input.priority ?? 0,
        dueDate: input.dueDate ?? null,
        sortOrder: nextSortOrder(tx),
        completedAt: status === "done" ? now : null,
        recurrence,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (input.tags && input.tags.length > 0) setTags(tx, { type: "task", id: row.id }, input.tags);
    recordActivity(tx, {
      entity: { type: "task", id: row.id },
      action: "created",
      label: row.title,
      actor,
    });
    return getTask(tx, row.id);
  });
}

const SUBTASKS_DONT_REPEAT =
  "Subtasks can't repeat. Set the repeat on the parent task, or stop this one repeating first.";

const tracked = (row: TaskRow) => ({
  title: row.title,
  notes: row.notes,
  status: row.status,
  priority: row.priority,
  dueDate: row.dueDate,
  projectId: row.projectId,
  parentId: row.parentId,
  repeat: row.recurrence ? describeRecurrence(row.recurrence) : null,
});

/**
 * Creates the next task in a repeating series from one just completed: same title,
 * notes, priority, project, and tags, the subtasks reopened, and the next due date.
 */
function createNextInSeries(
  tx: Queryable,
  done: TaskRow,
  rule: Recurrence,
  today: string,
  actor: string,
): void {
  const from = done.dueDate ?? today;
  const dueDate = nextDueDate(rule, from, today);
  const shift = daysBetween(from, dueDate);
  const monthDay =
    rule.frequency === "monthly" ? (rule.monthDay ?? Number(from.slice(8))) : undefined;
  const now = new Date();
  const copy = (source: TaskRow, parentId: number | null) =>
    tx
      .insert(tasks)
      .values({
        projectId: done.projectId,
        parentId,
        title: source.title,
        notes: source.notes,
        status: "todo",
        priority: source.priority,
        dueDate: parentId === null ? dueDate : source.dueDate && addDays(source.dueDate, shift),
        sortOrder: nextSortOrder(tx),
        recurrence:
          parentId === null
            ? { frequency: rule.frequency, interval: rule.interval, ...(monthDay && { monthDay }) }
            : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

  const created = [copy(done, null)];
  const [parent] = created;
  if (!parent) return;
  const tagNames = (tagsFor(tx, "task", [done.id]).get(done.id) ?? []).map((tag) => tag.name);
  if (tagNames.length > 0) setTags(tx, { type: "task", id: parent.id }, tagNames);
  const subtasks = tx
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, done.id))
    .orderBy(...inOrder)
    .all();
  for (const subtask of subtasks) created.push(copy(subtask, parent.id));
  for (const task of created) {
    recordActivity(tx, {
      entity: { type: "task", id: task.id },
      action: "created",
      label: task.title,
      actor,
    });
  }
}

/**
 * Applies a change. Completing a repeating task creates the next one (see
 * createNextInSeries); `today` is the local date that "late" is measured against.
 */
export function updateTask(
  db: Db,
  id: number,
  patch: TaskUpdate,
  actor: string,
  today: string,
): TaskDetailJson {
  return db.transaction((tx) => {
    const current = requireTask(tx, id);
    const now = new Date();
    const place = placeTask(
      tx,
      {
        id,
        parentId: patch.parentId !== undefined ? patch.parentId : current.parentId,
        projectId: patch.projectId !== undefined ? patch.projectId : current.projectId,
      },
      patch.projectId,
    );
    const status = patch.status ?? current.status;
    let completedAt = current.completedAt;
    if (status !== current.status) completedAt = status === "done" ? now : null;

    let recurrence: Recurrence | null =
      patch.recurrence !== undefined ? patch.recurrence : current.recurrence;
    if (recurrence && place.parentId !== null) throw badRequest(SUBTASKS_DONT_REPEAT);
    // A new due date sets a new day of the month to repeat on.
    if (recurrence?.monthDay && patch.dueDate !== undefined && patch.dueDate !== current.dueDate) {
      const { monthDay: _dropped, ...rest } = recurrence;
      recurrence = rest;
    }

    const next: TaskRow = {
      ...current,
      ...place,
      title: patch.title ?? current.title,
      notes: patch.notes ?? current.notes,
      status,
      priority: patch.priority ?? current.priority,
      dueDate: patch.dueDate !== undefined ? patch.dueDate : current.dueDate,
      sortOrder: patch.sortOrder ?? current.sortOrder,
      completedAt,
      recurrence,
    };
    const changes = changedFields(tracked(current), tracked(next));
    if (patch.tags) {
      const tagChange = setTags(tx, { type: "task", id }, patch.tags);
      Object.assign(changes, changedFields({ tags: tagChange.before }, { tags: tagChange.after }));
    }
    const recurrenceChanged = JSON.stringify(recurrence) !== JSON.stringify(current.recurrence);
    if (
      Object.keys(changes).length === 0 &&
      next.sortOrder === current.sortOrder &&
      !recurrenceChanged
    ) {
      return getTask(tx, id);
    }

    // Completing a repeating task hands the rule on to the next one, so reopening and
    // completing this one again never creates a duplicate.
    const completesSeries = recurrence !== null && current.status !== "done" && status === "done";
    if (completesSeries && recurrence) createNextInSeries(tx, next, recurrence, today, actor);

    tx.update(tasks)
      .set({
        parentId: next.parentId,
        projectId: next.projectId,
        title: next.title,
        notes: next.notes,
        status: next.status,
        priority: next.priority,
        dueDate: next.dueDate,
        sortOrder: next.sortOrder,
        completedAt: next.completedAt,
        recurrence: completesSeries ? null : recurrence,
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .run();
    // Subtasks follow their parent to another project.
    if (next.projectId !== current.projectId) {
      tx.update(tasks)
        .set({ projectId: next.projectId, updatedAt: now })
        .where(eq(tasks.parentId, id))
        .run();
    }
    if (Object.keys(changes).length > 0) {
      recordActivity(tx, {
        entity: { type: "task", id },
        action: "updated",
        label: next.title,
        details: { changes },
        actor,
      });
    }
    return getTask(tx, id);
  });
}

/** Deletes the task and its subtasks. Their activity history stays. */
export function deleteTask(db: Db, id: number, actor: string): void {
  db.transaction((tx) => {
    const row = requireTask(tx, id);
    const doomed = [
      ...tx
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(eq(tasks.parentId, id))
        .all(),
      { id: row.id, title: row.title },
    ];
    const ids = doomed.map((task) => task.id);
    detachEntities(tx, "task", ids, actor);
    tx.delete(tasks).where(inArray(tasks.id, ids)).run();
    for (const task of doomed) {
      recordActivity(tx, {
        entity: { type: "task", id: task.id },
        action: "deleted",
        label: task.title,
        actor,
      });
    }
  });
}
