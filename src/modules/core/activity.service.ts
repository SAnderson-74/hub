import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import type {
  ActivityAction,
  ActivityDetails,
  ActivityQuery,
  ActivityValue,
  EntityRef,
} from "../../shared/entities";
import { activityLog } from "./schema";

type NewActivity = {
  entity: EntityRef;
  action: ActivityAction;
  /** The entity's name right now, so the entry still reads well after it's deleted. */
  label: string;
  details?: ActivityDetails;
  actor: string;
};

export function recordActivity(db: Queryable, entry: NewActivity): void {
  db.insert(activityLog)
    .values({
      entityType: entry.entity.type,
      entityId: entry.entity.id,
      action: entry.action,
      label: entry.label,
      details: entry.details ?? null,
      actor: entry.actor,
    })
    .run();
}

type Changes = Record<string, { from: ActivityValue; to: ActivityValue }>;

/** The fields that differ between two snapshots, for an "updated" entry. */
export function changedFields<T extends Record<string, ActivityValue>>(
  before: T,
  after: T,
): Changes {
  const changes: Changes = {};
  for (const key of Object.keys(after)) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return changes;
}

/** Newest first. Pass `nextBefore` back as `before` for the next page. */
export function listActivity(db: Queryable, query: ActivityQuery) {
  const conditions: SQL[] = [];
  if (query.type) conditions.push(eq(activityLog.entityType, query.type));
  if (query.id !== undefined) conditions.push(eq(activityLog.entityId, query.id));
  if (query.before !== undefined) conditions.push(lt(activityLog.id, query.before));
  const rows = db
    .select()
    .from(activityLog)
    .where(and(...conditions))
    .orderBy(desc(activityLog.id))
    .limit(query.limit + 1)
    .all();
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    entries: page.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      label: row.label,
      details: row.details,
      actor: row.actor,
      createdAt: row.createdAt.toISOString(),
    })),
    nextBefore: rows.length > query.limit && last ? last.id : null,
  };
}
