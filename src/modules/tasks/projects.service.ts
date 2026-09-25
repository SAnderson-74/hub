import { asc, eq, isNull, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { conflict, notFound } from "../../server/errors";
import type { ProjectCreate, ProjectKind, ProjectUpdate } from "../../shared/tasks";
import { changedFields, recordActivity } from "../core/activity.service";
import { detachEntities } from "../core/entities";
import { projects, tasks } from "./schema";

type ProjectRow = typeof projects.$inferSelect;

export type ProjectJson = {
  id: number;
  name: string;
  kind: ProjectKind;
  notes: string;
  sortOrder: number;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Top-level tasks that aren't done. */
  openTaskCount: number;
  doneTaskCount: number;
};

type TaskCounts = { open: number; done: number };

function toProjectJson(row: ProjectRow, counts: TaskCounts | undefined): ProjectJson {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    notes: row.notes,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    openTaskCount: counts?.open ?? 0,
    doneTaskCount: counts?.done ?? 0,
  };
}

function taskCounts(db: Queryable): Map<number, TaskCounts> {
  const rows = db
    .select({
      projectId: tasks.projectId,
      open: sql<number>`sum(${tasks.status} != 'done')`.mapWith(Number),
      done: sql<number>`sum(${tasks.status} = 'done')`.mapWith(Number),
    })
    .from(tasks)
    .where(isNull(tasks.parentId))
    .groupBy(tasks.projectId)
    .all();
  const counts = new Map<number, TaskCounts>();
  for (const row of rows) {
    if (row.projectId !== null) counts.set(row.projectId, { open: row.open, done: row.done });
  }
  return counts;
}

/** Every project, archived ones included, in sort order. */
export function listProjects(db: Queryable): ProjectJson[] {
  const counts = taskCounts(db);
  return db
    .select()
    .from(projects)
    .orderBy(asc(projects.sortOrder), asc(projects.id))
    .all()
    .map((row) => toProjectJson(row, counts.get(row.id)));
}

function requireProject(db: Queryable, id: number): ProjectRow {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!row) throw notFound("That project doesn't exist. It may have been deleted.");
  return row;
}

export function getProject(db: Queryable, id: number): ProjectJson {
  return toProjectJson(requireProject(db, id), taskCounts(db).get(id));
}

function nextSortOrder(db: Queryable): number {
  const row = db
    .select({ last: sql<number | null>`max(${projects.sortOrder})` })
    .from(projects)
    .get();
  return (row?.last ?? 0) + 1;
}

export function createProject(db: Db, input: ProjectCreate, actor: string): ProjectJson {
  return db.transaction((tx) => {
    const row = tx
      .insert(projects)
      .values({
        name: input.name,
        kind: input.kind ?? "general",
        notes: input.notes ?? "",
        sortOrder: nextSortOrder(tx),
      })
      .returning()
      .get();
    recordActivity(tx, {
      entity: { type: "project", id: row.id },
      action: "created",
      label: row.name,
      actor,
    });
    return getProject(tx, row.id);
  });
}

const tracked = (row: ProjectRow) => ({
  name: row.name,
  kind: row.kind,
  notes: row.notes,
  archived: row.archivedAt !== null,
});

export function updateProject(
  db: Db,
  id: number,
  patch: ProjectUpdate,
  actor: string,
): ProjectJson {
  return db.transaction((tx) => {
    const current = requireProject(tx, id);
    const now = new Date();
    let archivedAt = current.archivedAt;
    if (patch.archived !== undefined && patch.archived !== (current.archivedAt !== null)) {
      archivedAt = patch.archived ? now : null;
    }
    const next: ProjectRow = {
      ...current,
      name: patch.name ?? current.name,
      kind: patch.kind ?? current.kind,
      notes: patch.notes ?? current.notes,
      sortOrder: patch.sortOrder ?? current.sortOrder,
      archivedAt,
    };
    const changes = changedFields(tracked(current), tracked(next));
    if (Object.keys(changes).length === 0 && next.sortOrder === current.sortOrder) {
      return getProject(tx, id);
    }
    tx.update(projects)
      .set({
        name: next.name,
        kind: next.kind,
        notes: next.notes,
        sortOrder: next.sortOrder,
        archivedAt: next.archivedAt,
        updatedAt: now,
      })
      .where(eq(projects.id, id))
      .run();
    if (Object.keys(changes).length > 0) {
      recordActivity(tx, {
        entity: { type: "project", id },
        action: "updated",
        label: next.name,
        details: { changes },
        actor,
      });
    }
    return getProject(tx, id);
  });
}

/** Only empty projects can be deleted, so tasks are never lost by accident. */
export function deleteProject(db: Db, id: number, actor: string): void {
  db.transaction((tx) => {
    const row = requireProject(tx, id);
    const task = tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id)).get();
    if (task) {
      throw conflict(
        "This project still has tasks. Move or delete them first, or archive the project instead.",
      );
    }
    detachEntities(tx, "project", [id], actor);
    tx.delete(projects).where(eq(projects.id, id)).run();
    recordActivity(tx, {
      entity: { type: "project", id },
      action: "deleted",
      label: row.name,
      actor,
    });
  });
}
