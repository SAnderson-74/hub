import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { notFound } from "../../server/errors";
import {
  computeProgress,
  type GoalCreate,
  type GoalStatus,
  type GoalUpdate,
  type MilestoneCreate,
  type MilestoneUpdate,
  type ProgressMode,
} from "../../shared/goals";
import { formatCents } from "../../shared/money";
import type { TaskStatus } from "../../shared/tasks";
import { changedFields, recordActivity } from "../core/activity.service";
import { detachEntities } from "../core/entities";
import { links } from "../core/schema";
import { tasks } from "../tasks/schema";
import { goals, milestones } from "./schema";

type GoalRow = typeof goals.$inferSelect;
type MilestoneRow = typeof milestones.$inferSelect;

export type MilestoneJson = {
  id: number;
  goalId: number;
  title: string;
  targetDate: string | null;
  done: boolean;
  doneAt: string | null;
  sortOrder: number;
};

export type GoalJson = {
  id: number;
  title: string;
  notes: string;
  targetDate: string | null;
  status: GoalStatus;
  closedAt: string | null;
  progressMode: ProgressMode;
  manualPercent: number;
  targetCents: number | null;
  currentCents: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  progress: { percent: number; summary: string };
  /** In order: by target date (undated last), then sort order. */
  milestones: MilestoneJson[];
  linkedTaskCount: number;
};

export type GoalDetailJson = GoalJson & {
  /** Tasks linked to the goal; `linkId` removes the link through /api/links. */
  tasks: Array<{
    linkId: number;
    id: number;
    title: string;
    status: TaskStatus;
    dueDate: string | null;
  }>;
};

const milestoneOrder = [
  sql`${milestones.targetDate} is null`,
  asc(milestones.targetDate),
  asc(milestones.sortOrder),
  asc(milestones.id),
];

function toMilestoneJson(row: MilestoneRow): MilestoneJson {
  return {
    id: row.id,
    goalId: row.goalId,
    title: row.title,
    targetDate: row.targetDate,
    done: row.doneAt !== null,
    doneAt: row.doneAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
  };
}

/** A link between a goal and a task, in either direction. */
function goalTaskLinks(db: Queryable, goalIds: number[]) {
  if (goalIds.length === 0) return [];
  const rows = db
    .select()
    .from(links)
    .where(
      or(
        and(eq(links.fromType, "task"), eq(links.toType, "goal"), inArray(links.toId, goalIds)),
        and(eq(links.fromType, "goal"), eq(links.toType, "task"), inArray(links.fromId, goalIds)),
      ),
    )
    .orderBy(asc(links.id))
    .all();
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const goalId = row.toType === "goal" ? row.toId : row.fromId;
    const taskId = row.toType === "goal" ? row.fromId : row.toId;
    // Two links (say, different relations) to the same task count once.
    const key = `${goalId}:${taskId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ linkId: row.id, goalId, taskId }];
  });
}

function withExtras(db: Queryable, rows: GoalRow[]): GoalJson[] {
  const ids = rows.map((row) => row.id);
  const milestoneRows =
    ids.length === 0
      ? []
      : db
          .select()
          .from(milestones)
          .where(inArray(milestones.goalId, ids))
          .orderBy(...milestoneOrder)
          .all();
  const byGoal = new Map<number, MilestoneJson[]>();
  for (const row of milestoneRows) {
    byGoal.set(row.goalId, [...(byGoal.get(row.goalId) ?? []), toMilestoneJson(row)]);
  }

  const taskLinks = goalTaskLinks(db, ids);
  const taskIds = [...new Set(taskLinks.map((link) => link.taskId))];
  const statuses = new Map(
    taskIds.length === 0
      ? []
      : db
          .select({ id: tasks.id, status: tasks.status })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
          .all()
          .map((row) => [row.id, row.status]),
  );
  const taskCounts = new Map<number, { done: number; total: number }>();
  for (const link of taskLinks) {
    const status = statuses.get(link.taskId);
    if (!status) continue;
    const counts = taskCounts.get(link.goalId) ?? { done: 0, total: 0 };
    counts.total += 1;
    if (status === "done") counts.done += 1;
    taskCounts.set(link.goalId, counts);
  }

  return rows.map((row) => {
    const goalMilestones = byGoal.get(row.id) ?? [];
    const taskCount = taskCounts.get(row.id) ?? { done: 0, total: 0 };
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      targetDate: row.targetDate,
      status: row.status,
      closedAt: row.closedAt?.toISOString() ?? null,
      progressMode: row.progressMode,
      manualPercent: row.manualPercent,
      targetCents: row.targetCents,
      currentCents: row.currentCents,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      progress: computeProgress({
        mode: row.progressMode,
        milestones: {
          done: goalMilestones.filter((milestone) => milestone.done).length,
          total: goalMilestones.length,
        },
        tasks: taskCount,
        manualPercent: row.manualPercent,
        currentCents: row.currentCents,
        targetCents: row.targetCents,
      }),
      milestones: goalMilestones,
      linkedTaskCount: taskCount.total,
    };
  });
}

/** Every goal, in sort order. The page groups them by status. */
export function listGoals(db: Queryable): GoalJson[] {
  const rows = db.select().from(goals).orderBy(asc(goals.sortOrder), asc(goals.id)).all();
  return withExtras(db, rows);
}

function requireGoal(db: Queryable, id: number): GoalRow {
  const row = db.select().from(goals).where(eq(goals.id, id)).get();
  if (!row) throw notFound("That goal doesn't exist. It may have been deleted.");
  return row;
}

export function getGoal(db: Queryable, id: number): GoalDetailJson {
  const [goal] = withExtras(db, [requireGoal(db, id)]);
  if (!goal) throw notFound("That goal doesn't exist. It may have been deleted.");
  const taskLinks = goalTaskLinks(db, [id]);
  const taskRows = new Map(
    taskLinks.length === 0
      ? []
      : db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(
            inArray(
              tasks.id,
              taskLinks.map((link) => link.taskId),
            ),
          )
          .all()
          .map((row) => [row.id, row]),
  );
  return {
    ...goal,
    tasks: taskLinks.flatMap((link) => {
      const task = taskRows.get(link.taskId);
      return task ? [{ linkId: link.linkId, ...task }] : [];
    }),
  };
}

function lastSortOrder(db: Queryable, table: typeof goals | typeof milestones): number {
  const row = db
    .select({ last: sql<number | null>`max(${table.sortOrder})` })
    .from(table)
    .get();
  return row?.last ?? 0;
}

export function createGoal(db: Db, input: GoalCreate, actor: string): GoalDetailJson {
  return db.transaction((tx) => {
    const row = tx
      .insert(goals)
      .values({
        title: input.title,
        notes: input.notes ?? "",
        targetDate: input.targetDate ?? null,
        progressMode: input.progressMode ?? "milestones",
        manualPercent: input.manualPercent ?? 0,
        targetCents: input.targetCents ?? null,
        currentCents: input.currentCents ?? 0,
        sortOrder: lastSortOrder(tx, goals) + 1,
      })
      .returning()
      .get();
    recordActivity(tx, {
      entity: { type: "goal", id: row.id },
      action: "created",
      label: row.title,
      actor,
    });
    return getGoal(tx, row.id);
  });
}

const tracked = (row: GoalRow) => ({
  title: row.title,
  notes: row.notes,
  targetDate: row.targetDate,
  status: row.status,
  progressMode: row.progressMode,
  manualPercent: row.manualPercent,
  target: row.targetCents === null ? null : formatCents(row.targetCents),
  current: formatCents(row.currentCents),
});

export function updateGoal(db: Db, id: number, patch: GoalUpdate, actor: string): GoalDetailJson {
  return db.transaction((tx) => {
    const current = requireGoal(tx, id);
    const now = new Date();
    const status = patch.status ?? current.status;
    let closedAt = current.closedAt;
    if (status !== current.status) closedAt = status === "active" ? null : now;
    const next: GoalRow = {
      ...current,
      title: patch.title ?? current.title,
      notes: patch.notes ?? current.notes,
      targetDate: patch.targetDate !== undefined ? patch.targetDate : current.targetDate,
      status,
      closedAt,
      progressMode: patch.progressMode ?? current.progressMode,
      manualPercent: patch.manualPercent ?? current.manualPercent,
      targetCents: patch.targetCents !== undefined ? patch.targetCents : current.targetCents,
      currentCents: patch.currentCents ?? current.currentCents,
      sortOrder: patch.sortOrder ?? current.sortOrder,
    };
    const changes = changedFields(tracked(current), tracked(next));
    if (Object.keys(changes).length === 0 && next.sortOrder === current.sortOrder) {
      return getGoal(tx, id);
    }
    tx.update(goals)
      .set({
        title: next.title,
        notes: next.notes,
        targetDate: next.targetDate,
        status: next.status,
        closedAt: next.closedAt,
        progressMode: next.progressMode,
        manualPercent: next.manualPercent,
        targetCents: next.targetCents,
        currentCents: next.currentCents,
        sortOrder: next.sortOrder,
        updatedAt: now,
      })
      .where(eq(goals.id, id))
      .run();
    if (Object.keys(changes).length > 0) {
      recordActivity(tx, {
        entity: { type: "goal", id },
        action: "updated",
        label: next.title,
        details: { changes },
        actor,
      });
    }
    return getGoal(tx, id);
  });
}

/** Deletes the goal and its milestones. Linked tasks stay; only the links go. */
export function deleteGoal(db: Db, id: number, actor: string): void {
  db.transaction((tx) => {
    const row = requireGoal(tx, id);
    detachEntities(tx, "goal", [id], actor);
    tx.delete(goals).where(eq(goals.id, id)).run();
    recordActivity(tx, {
      entity: { type: "goal", id },
      action: "deleted",
      label: row.title,
      actor,
    });
  });
}

// Milestones

function milestoneSummary(db: Queryable, goalId: number): string {
  const row = db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      done: sql<number>`count(${milestones.doneAt})`.mapWith(Number),
    })
    .from(milestones)
    .where(eq(milestones.goalId, goalId))
    .get();
  return `${row?.done ?? 0} of ${row?.total ?? 0} done`;
}

/** Notes a change in the goal's milestones on its timeline, like "2 of 5 done" → "3 of 5 done". */
function logMilestones(db: Queryable, goal: GoalRow, before: string, actor: string) {
  const after = milestoneSummary(db, goal.id);
  if (after === before) return;
  db.update(goals).set({ updatedAt: new Date() }).where(eq(goals.id, goal.id)).run();
  recordActivity(db, {
    entity: { type: "goal", id: goal.id },
    action: "updated",
    label: goal.title,
    details: { changes: { milestones: { from: before, to: after } } },
    actor,
  });
}

function requireMilestone(db: Queryable, goalId: number, milestoneId: number): MilestoneRow {
  const row = db
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.goalId, goalId)))
    .get();
  if (!row) throw notFound("That milestone doesn't exist. It may have been deleted.");
  return row;
}

export function createMilestone(
  db: Db,
  goalId: number,
  input: MilestoneCreate,
  actor: string,
): GoalDetailJson {
  return db.transaction((tx) => {
    const goal = requireGoal(tx, goalId);
    const before = milestoneSummary(tx, goalId);
    tx.insert(milestones)
      .values({
        goalId,
        title: input.title,
        targetDate: input.targetDate ?? null,
        sortOrder: lastSortOrder(tx, milestones) + 1,
      })
      .run();
    logMilestones(tx, goal, before, actor);
    return getGoal(tx, goalId);
  });
}

export function updateMilestone(
  db: Db,
  goalId: number,
  milestoneId: number,
  patch: MilestoneUpdate,
  actor: string,
): GoalDetailJson {
  return db.transaction((tx) => {
    const goal = requireGoal(tx, goalId);
    const current = requireMilestone(tx, goalId, milestoneId);
    const before = milestoneSummary(tx, goalId);
    const now = new Date();
    let doneAt = current.doneAt;
    if (patch.done !== undefined && patch.done !== (current.doneAt !== null)) {
      doneAt = patch.done ? now : null;
    }
    tx.update(milestones)
      .set({
        title: patch.title ?? current.title,
        targetDate: patch.targetDate !== undefined ? patch.targetDate : current.targetDate,
        doneAt,
        sortOrder: patch.sortOrder ?? current.sortOrder,
        updatedAt: now,
      })
      .where(eq(milestones.id, milestoneId))
      .run();
    logMilestones(tx, goal, before, actor);
    return getGoal(tx, goalId);
  });
}

export function deleteMilestone(
  db: Db,
  goalId: number,
  milestoneId: number,
  actor: string,
): GoalDetailJson {
  return db.transaction((tx) => {
    const goal = requireGoal(tx, goalId);
    requireMilestone(tx, goalId, milestoneId);
    const before = milestoneSummary(tx, goalId);
    tx.delete(milestones).where(eq(milestones.id, milestoneId)).run();
    logMilestones(tx, goal, before, actor);
    return getGoal(tx, goalId);
  });
}
