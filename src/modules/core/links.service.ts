import { and, asc, eq, or } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import type { EntityRef, EntityType, LinkCreate } from "../../shared/entities";
import { recordActivity } from "./activity.service";
import { entityLabels, requireEntity } from "./entities";
import { links } from "./schema";

type LinkRow = typeof links.$inferSelect;

export type LinkJson = {
  id: number;
  relation: string;
  /** "outgoing" when the entity you asked about is the link's `from` end. */
  direction: "outgoing" | "incoming";
  entity: { type: EntityType; id: number; label: string };
  createdAt: string;
};

function otherEnd(row: LinkRow, from: EntityRef) {
  const outgoing = row.fromType === from.type && row.fromId === from.id;
  return {
    outgoing,
    other: outgoing ? { type: row.toType, id: row.toId } : { type: row.fromType, id: row.fromId },
  };
}

/** Links in both directions for one entity, oldest first, with the other end's name. */
export function listLinks(db: Queryable, entity: EntityRef): LinkJson[] {
  requireEntity(db, entity, "path");
  const rows = db
    .select()
    .from(links)
    .where(
      or(
        and(eq(links.fromType, entity.type), eq(links.fromId, entity.id)),
        and(eq(links.toType, entity.type), eq(links.toId, entity.id)),
      ),
    )
    .orderBy(asc(links.id))
    .all();

  const ends = rows.map((row) => ({ row, ...otherEnd(row, entity) }));
  const idsByType = new Map<EntityType, number[]>();
  for (const { other } of ends)
    idsByType.set(other.type, [...(idsByType.get(other.type) ?? []), other.id]);
  const labels = new Map<string, string>();
  for (const [type, ids] of idsByType) {
    for (const [id, label] of entityLabels(db, type, ids)) labels.set(`${type}:${id}`, label);
  }

  return ends.flatMap(({ row, outgoing, other }) => {
    const label = labels.get(`${other.type}:${other.id}`);
    if (label === undefined) return [];
    return [
      {
        id: row.id,
        relation: row.relation,
        direction: outgoing ? "outgoing" : "incoming",
        entity: { ...other, label },
        createdAt: row.createdAt.toISOString(),
      } satisfies LinkJson,
    ];
  });
}

/** Records the link (or its removal) on both ends' timelines. */
function logLink(
  db: Queryable,
  action: "linked" | "unlinked",
  row: LinkRow,
  labels: { from: string; to: string },
  actor: string,
) {
  const from = { type: row.fromType, id: row.fromId };
  const to = { type: row.toType, id: row.toId };
  recordActivity(db, {
    entity: from,
    action,
    label: labels.from,
    details: {
      relation: row.relation,
      direction: "outgoing",
      other: { ...to, label: labels.to },
    },
    actor,
  });
  recordActivity(db, {
    entity: to,
    action,
    label: labels.to,
    details: {
      relation: row.relation,
      direction: "incoming",
      other: { ...from, label: labels.from },
    },
    actor,
  });
}

export function createLink(db: Db, input: LinkCreate, actor: string): LinkJson {
  if (input.from.type === input.to.type && input.from.id === input.to.id) {
    throw badRequest("Something can't be linked to itself. Pick a different item.");
  }
  return db.transaction((tx) => {
    const labels = {
      from: requireEntity(tx, input.from, "body"),
      to: requireEntity(tx, input.to, "body"),
    };
    const row = tx
      .insert(links)
      .values({
        fromType: input.from.type,
        fromId: input.from.id,
        toType: input.to.type,
        toId: input.to.id,
        relation: input.relation,
      })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!row) throw conflict(`Those are already linked as "${input.relation}".`);
    logLink(tx, "linked", row, labels, actor);
    return {
      id: row.id,
      relation: row.relation,
      direction: "outgoing",
      entity: { ...input.to, label: labels.to },
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export function deleteLink(db: Db, id: number, actor: string): void {
  db.transaction((tx) => {
    const row = tx.select().from(links).where(eq(links.id, id)).get();
    if (!row) throw notFound("That link doesn't exist. It may have been removed already.");
    tx.delete(links).where(eq(links.id, id)).run();
    const from = entityLabels(tx, row.fromType, [row.fromId]).get(row.fromId);
    const to = entityLabels(tx, row.toType, [row.toId]).get(row.toId);
    if (from !== undefined && to !== undefined) logLink(tx, "unlinked", row, { from, to }, actor);
  });
}
