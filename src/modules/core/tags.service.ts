import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { conflict, notFound } from "../../server/errors";
import type { EntityRef, EntityType, TagUpdate } from "../../shared/entities";
import { taggings, tags } from "./schema";

export type TagJson = { id: number; name: string };

// SQLite's lower() only folds ASCII letters, so name comparisons happen in SQL to
// match the unique index on lower(name).
const sameName = (name: string) => sql`lower(${tags.name}) = lower(${name})`;
const byName = sql`lower(${tags.name})`;

/** Tags on each of the given entities, sorted by name. */
export function tagsFor(db: Queryable, type: EntityType, ids: number[]): Map<number, TagJson[]> {
  const result = new Map<number, TagJson[]>();
  if (ids.length === 0) return result;
  const rows = db
    .select({ entityId: taggings.entityId, id: tags.id, name: tags.name })
    .from(taggings)
    .innerJoin(tags, eq(taggings.tagId, tags.id))
    .where(and(eq(taggings.entityType, type), inArray(taggings.entityId, ids)))
    .orderBy(byName)
    .all();
  for (const { entityId, id, name } of rows) {
    const list = result.get(entityId) ?? [];
    list.push({ id, name });
    result.set(entityId, list);
  }
  return result;
}

/** Drops repeats that differ only in letter case, keeping the first spelling. */
function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findOrCreateTag(db: Queryable, name: string): number {
  const existing = db.select({ id: tags.id }).from(tags).where(sameName(name)).get();
  if (existing) return existing.id;
  return db.insert(tags).values({ name }).returning({ id: tags.id }).get().id;
}

/**
 * Replaces an entity's tags, creating tags that don't exist yet. Names are matched
 * regardless of letter case. Returns the tag names before and after.
 */
export function setTags(db: Queryable, entity: EntityRef, names: string[]) {
  const namesOf = () =>
    (tagsFor(db, entity.type, [entity.id]).get(entity.id) ?? []).map((t) => t.name);
  const before = namesOf();
  const tagIds = uniqueNames(names).map((name) => findOrCreateTag(db, name));
  db.delete(taggings)
    .where(and(eq(taggings.entityType, entity.type), eq(taggings.entityId, entity.id)))
    .run();
  if (tagIds.length > 0) {
    db.insert(taggings)
      .values(tagIds.map((tagId) => ({ tagId, entityType: entity.type, entityId: entity.id })))
      .run();
  }
  return { before, after: namesOf() };
}

/** Every tag with how many things carry it, sorted by name. */
export function listTags(db: Queryable) {
  return db
    .select({ id: tags.id, name: tags.name, count: count(taggings.tagId) })
    .from(tags)
    .leftJoin(taggings, eq(taggings.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(byName)
    .all();
}

function requireTag(db: Queryable, id: number) {
  const tag = db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.id, id)).get();
  if (!tag) throw notFound("That tag doesn't exist. It may have been deleted.");
  return tag;
}

export function renameTag(db: Queryable, id: number, update: TagUpdate): TagJson {
  requireTag(db, id);
  const clash = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(sameName(update.name), ne(tags.id, id)))
    .get();
  if (clash) throw conflict("A tag with that name already exists. Pick another name.");
  db.update(tags).set({ name: update.name }).where(eq(tags.id, id)).run();
  return requireTag(db, id);
}

/** Deletes the tag and takes it off everything that carried it. */
export function deleteTag(db: Queryable, id: number): void {
  requireTag(db, id);
  db.delete(tags).where(eq(tags.id, id)).run();
}
