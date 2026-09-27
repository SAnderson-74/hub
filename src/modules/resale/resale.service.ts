import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import { formatCents } from "../../shared/money";
import type {
  ItemCreate,
  ItemStatus,
  ItemUpdate,
  PlatformCreate,
  PlatformUpdate,
} from "../../shared/resale";
import { changedFields, recordActivity } from "../core/activity.service";
import { detachEntities } from "../core/entities";
import { resaleItems, resalePlatforms } from "./schema";

type PlatformRow = typeof resalePlatforms.$inferSelect;
type ItemRow = typeof resaleItems.$inferSelect;

export type PlatformJson = {
  id: number;
  name: string;
  notes: string;
  archived: boolean;
  /** Items bought there. A platform in use can be archived but not deleted. */
  itemCount: number;
};

export type ItemJson = {
  id: number;
  title: string;
  status: ItemStatus;
  category: string;
  condition: string;
  purchasedOn: string | null;
  purchaseCents: number | null;
  purchasePlatform: { id: number; name: string } | null;
  purchaseFrom: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

// Platforms

/** Active platforms first, then archived ones, each in the order they were added. */
export function listPlatforms(db: Queryable): PlatformJson[] {
  const counts = new Map(
    db
      .select({ id: resaleItems.purchasePlatformId, total: count() })
      .from(resaleItems)
      .groupBy(resaleItems.purchasePlatformId)
      .all()
      .map((row) => [row.id, row.total]),
  );
  return db
    .select()
    .from(resalePlatforms)
    .orderBy(asc(resalePlatforms.archived), asc(resalePlatforms.sortOrder), asc(resalePlatforms.id))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      notes: row.notes,
      archived: row.archived,
      itemCount: counts.get(row.id) ?? 0,
    }));
}

function requirePlatform(db: Queryable, id: number, from: "path" | "body" = "path"): PlatformRow {
  const row = db.select().from(resalePlatforms).where(eq(resalePlatforms.id, id)).get();
  if (row) return row;
  const message = "That platform doesn't exist. It may have been deleted.";
  throw from === "path" ? notFound(message) : badRequest(message);
}

function checkNameFree(db: Queryable, name: string, exceptId?: number) {
  const taken = db
    .select({ id: resalePlatforms.id })
    .from(resalePlatforms)
    .where(
      and(
        sql`lower(${resalePlatforms.name}) = lower(${name})`,
        exceptId === undefined ? undefined : ne(resalePlatforms.id, exceptId),
      ),
    )
    .get();
  if (taken) throw conflict(`There's already a platform called "${name}". Use that one instead.`);
}

export function createPlatform(db: Db, input: PlatformCreate): PlatformJson[] {
  db.transaction((tx) => {
    checkNameFree(tx, input.name);
    const last = tx
      .select({ last: sql<number | null>`max(${resalePlatforms.sortOrder})` })
      .from(resalePlatforms)
      .get();
    tx.insert(resalePlatforms)
      .values({ name: input.name, notes: input.notes ?? "", sortOrder: (last?.last ?? 0) + 1 })
      .run();
  });
  return listPlatforms(db);
}

export function updatePlatform(db: Db, id: number, patch: PlatformUpdate): PlatformJson[] {
  db.transaction((tx) => {
    requirePlatform(tx, id);
    if (patch.name !== undefined) checkNameFree(tx, patch.name, id);
    tx.update(resalePlatforms)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(resalePlatforms.id, id))
      .run();
  });
  return listPlatforms(db);
}

export function deletePlatform(db: Db, id: number): PlatformJson[] {
  db.transaction((tx) => {
    requirePlatform(tx, id);
    const used = tx
      .select({ total: count() })
      .from(resaleItems)
      .where(eq(resaleItems.purchasePlatformId, id))
      .get();
    if ((used?.total ?? 0) > 0) {
      throw conflict(
        "Items were bought on this platform. Archive it instead to keep their history.",
      );
    }
    tx.delete(resalePlatforms).where(eq(resalePlatforms.id, id)).run();
  });
  return listPlatforms(db);
}

// Items

function toItemJson(row: ItemRow, platformNames: Map<number, string>): ItemJson {
  const platformName =
    row.purchasePlatformId === null ? undefined : platformNames.get(row.purchasePlatformId);
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    category: row.category,
    condition: row.condition,
    purchasedOn: row.purchasedOn,
    purchaseCents: row.purchaseCents,
    purchasePlatform:
      row.purchasePlatformId !== null && platformName !== undefined
        ? { id: row.purchasePlatformId, name: platformName }
        : null,
    purchaseFrom: row.purchaseFrom,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function platformNames(db: Queryable): Map<number, string> {
  return new Map(
    db
      .select({ id: resalePlatforms.id, name: resalePlatforms.name })
      .from(resalePlatforms)
      .all()
      .map((row) => [row.id, row.name]),
  );
}

/** Items, most recently added first, optionally only some statuses. */
export function listItems(db: Queryable, query: { status?: ItemStatus[] }): ItemJson[] {
  const rows = db
    .select()
    .from(resaleItems)
    .where(query.status ? inArray(resaleItems.status, query.status) : undefined)
    .orderBy(desc(resaleItems.createdAt), desc(resaleItems.id))
    .all();
  const names = platformNames(db);
  return rows.map((row) => toItemJson(row, names));
}

function requireItem(db: Queryable, id: number): ItemRow {
  const row = db.select().from(resaleItems).where(eq(resaleItems.id, id)).get();
  if (!row) throw notFound("That item doesn't exist. It may have been deleted.");
  return row;
}

export function getItem(db: Queryable, id: number): ItemJson {
  return toItemJson(requireItem(db, id), platformNames(db));
}

/** What the activity log records about an item. Money shows as dollars. */
function tracked(row: ItemRow, names: Map<number, string>) {
  return {
    title: row.title,
    status: row.status,
    category: row.category,
    condition: row.condition,
    purchasedOn: row.purchasedOn,
    paid: row.purchaseCents === null ? null : formatCents(row.purchaseCents),
    boughtOn: row.purchasePlatformId === null ? null : (names.get(row.purchasePlatformId) ?? null),
    boughtFrom: row.purchaseFrom,
    notes: row.notes,
  };
}

export function createItem(db: Db, input: ItemCreate, actor: string): ItemJson {
  return db.transaction((tx) => {
    if (input.purchasePlatformId != null) requirePlatform(tx, input.purchasePlatformId, "body");
    const row = tx
      .insert(resaleItems)
      .values({
        title: input.title,
        status: input.status ?? "acquired",
        category: input.category ?? "",
        condition: input.condition ?? "",
        purchasedOn: input.purchasedOn ?? null,
        purchaseCents: input.purchaseCents ?? null,
        purchasePlatformId: input.purchasePlatformId ?? null,
        purchaseFrom: input.purchaseFrom ?? "",
        notes: input.notes ?? "",
      })
      .returning()
      .get();
    recordActivity(tx, {
      entity: { type: "resale_item", id: row.id },
      action: "created",
      label: row.title,
      actor,
    });
    return toItemJson(row, platformNames(tx));
  });
}

export function updateItem(db: Db, id: number, patch: ItemUpdate, actor: string): ItemJson {
  return db.transaction((tx) => {
    const current = requireItem(tx, id);
    if (
      patch.purchasePlatformId != null &&
      patch.purchasePlatformId !== current.purchasePlatformId
    ) {
      requirePlatform(tx, patch.purchasePlatformId, "body");
    }
    const names = platformNames(tx);
    // null clears a nullable field; a field left out stays as it is.
    const keep = <T>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value);
    const next: ItemRow = {
      ...current,
      title: keep(patch.title, current.title),
      status: keep(patch.status, current.status),
      category: keep(patch.category, current.category),
      condition: keep(patch.condition, current.condition),
      purchasedOn: keep(patch.purchasedOn, current.purchasedOn),
      purchaseCents: keep(patch.purchaseCents, current.purchaseCents),
      purchasePlatformId: keep(patch.purchasePlatformId, current.purchasePlatformId),
      purchaseFrom: keep(patch.purchaseFrom, current.purchaseFrom),
      notes: keep(patch.notes, current.notes),
    };
    const changes = changedFields(tracked(current, names), tracked(next, names));
    if (Object.keys(changes).length === 0) return toItemJson(current, names);
    const { id: _id, createdAt: _createdAt, ...values } = next;
    const row = tx
      .update(resaleItems)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(resaleItems.id, id))
      .returning()
      .get();
    recordActivity(tx, {
      entity: { type: "resale_item", id },
      action: "updated",
      label: row.title,
      details: { changes },
      actor,
    });
    return toItemJson(row, names);
  });
}

export function deleteItem(db: Db, id: number, actor: string): void {
  db.transaction((tx) => {
    const row = requireItem(tx, id);
    detachEntities(tx, "resale_item", [id], actor);
    tx.delete(resaleItems).where(eq(resaleItems.id, id)).run();
    recordActivity(tx, {
      entity: { type: "resale_item", id },
      action: "deleted",
      label: row.title,
      actor,
    });
  });
}
