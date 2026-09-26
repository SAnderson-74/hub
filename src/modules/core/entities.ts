import { and, eq, inArray, or } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import { ENTITY_TYPE_NAMES, type EntityRef, type EntityType } from "../../shared/entities";
import { courses } from "../education/schema";
import { goals } from "../goals/schema";
import { projects, tasks } from "../tasks/schema";
import { recordActivity } from "./activity.service";
import { links, taggings } from "./schema";

type LabelLookup = (db: Queryable, ids: number[]) => Array<{ id: number; label: string }>;

/** How to find and name each entity type. A new module adds one entry. */
const lookups: Record<EntityType, LabelLookup> = {
  project: (db, ids) =>
    db
      .select({ id: projects.id, label: projects.name })
      .from(projects)
      .where(inArray(projects.id, ids))
      .all(),
  task: (db, ids) =>
    db.select({ id: tasks.id, label: tasks.title }).from(tasks).where(inArray(tasks.id, ids)).all(),
  goal: (db, ids) =>
    db.select({ id: goals.id, label: goals.title }).from(goals).where(inArray(goals.id, ids)).all(),
  // "ABC101 Introduction to Networks", or just the title without a code.
  course: (db, ids) =>
    db
      .select({ id: courses.id, code: courses.code, title: courses.title })
      .from(courses)
      .where(inArray(courses.id, ids))
      .all()
      .map((row) => ({ id: row.id, label: row.code ? `${row.code} ${row.title}` : row.title })),
};

/** Current names of the given entities. Ids that don't exist are left out. */
export function entityLabels(db: Queryable, type: EntityType, ids: number[]): Map<number, string> {
  // A type this build doesn't know (a newer build wrote it, then was rolled back)
  // reads as deleted rather than failing the request.
  const lookup = lookups[type] as LabelLookup | undefined;
  if (ids.length === 0 || !lookup) return new Map();
  return new Map(lookup(db, [...new Set(ids)]).map((row) => [row.id, row.label]));
}

/**
 * The entity's name, or an error if it doesn't exist. Use "path" when the id came
 * from the URL (404) and "body" when it came from the request body (400).
 */
export function requireEntity(db: Queryable, ref: EntityRef, from: "path" | "body"): string {
  const label = entityLabels(db, ref.type, [ref.id]).get(ref.id);
  if (label !== undefined) return label;
  const message = `That ${ENTITY_TYPE_NAMES[ref.type]} doesn't exist. It may have been deleted.`;
  throw from === "path" ? notFound(message) : badRequest(message);
}

/**
 * Removes tags and links from entities that are about to be deleted, and notes the
 * lost link on each surviving entity's timeline. Call before deleting the rows.
 */
export function detachEntities(db: Queryable, type: EntityType, ids: number[], actor: string) {
  if (ids.length === 0) return;
  const deleting = new Set(ids);
  const labels = entityLabels(db, type, ids);
  const touching = or(
    and(eq(links.fromType, type), inArray(links.fromId, ids)),
    and(eq(links.toType, type), inArray(links.toId, ids)),
  );

  for (const link of db.select().from(links).where(touching).all()) {
    const outgoing = link.fromType === type && deleting.has(link.fromId);
    const gone = outgoing ? { type, id: link.fromId } : { type, id: link.toId };
    const other = outgoing
      ? { type: link.toType, id: link.toId }
      : { type: link.fromType, id: link.fromId };
    if (other.type === type && deleting.has(other.id)) continue;
    const otherLabel = entityLabels(db, other.type, [other.id]).get(other.id);
    if (otherLabel === undefined) continue;
    recordActivity(db, {
      entity: other,
      action: "unlinked",
      label: otherLabel,
      details: {
        relation: link.relation,
        direction: outgoing ? "incoming" : "outgoing",
        other: { ...gone, label: labels.get(gone.id) ?? "" },
      },
      actor,
    });
  }

  db.delete(links).where(touching).run();
  db.delete(taggings)
    .where(and(eq(taggings.entityType, type), inArray(taggings.entityId, ids)))
    .run();
}
