import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import type { ActivityValue } from "../../shared/entities";
import { formatCents } from "../../shared/money";
import type {
  CostCreate,
  CostKind,
  CostUpdate,
  ItemCreate,
  ItemStatus,
  ItemUpdate,
  ListingCreate,
  ListingUpdate,
  PlatformCreate,
  PlatformUpdate,
  PriceChange,
} from "../../shared/resale";
import { type ImportResult, type ImportRow, readImportRow } from "../../shared/resaleImport";
import {
  type ListingImport,
  type ListingImportResult,
  readListingImport,
} from "../../shared/resaleListing";
import { changedFields, recordActivity } from "../core/activity.service";
import { detachEntities } from "../core/entities";
import { timeEntries } from "../time/schema";
import {
  resaleCosts,
  resaleItems,
  resaleListingPrices,
  resaleListings,
  resalePlatforms,
} from "./schema";
import { type ItemTransactionJson, itemTransactions } from "./transactionLinks";

type PlatformRow = typeof resalePlatforms.$inferSelect;
type ItemRow = typeof resaleItems.$inferSelect;
type CostRow = typeof resaleCosts.$inferSelect;
type ListingRow = typeof resaleListings.$inferSelect;
type PriceRow = typeof resaleListingPrices.$inferSelect;

export type ListingJson = {
  id: number;
  platform: { id: number; name: string } | null;
  url: string;
  /** The listing's own title and text, as posted. */
  title: string;
  description: string;
  listedOn: string;
  /** null while the listing is up. */
  endedOn: string | null;
  /** The newest asking price. */
  priceCents: number;
  /** Every asking price, oldest first. */
  prices: Array<{ id: number; priceCents: number; changedOn: string }>;
};

export type CostJson = {
  id: number;
  kind: CostKind;
  label: string;
  amountCents: number;
  spentOn: string | null;
};

export type PlatformJson = {
  id: number;
  name: string;
  notes: string;
  archived: boolean;
  /** Items bought, listed, or sold there. A platform in use can be archived, not deleted. */
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
  /** Oldest first. */
  costs: CostJson[];
  costsCents: number;
  /** Time logged on the item, with a running timer counted up to now. */
  timeMinutes: number;
  /** Newest first. */
  listings: ListingJson[];
  soldOn: string | null;
  saleCents: number | null;
  salePlatform: { id: number; name: string } | null;
  buyerNotes: string;
  /** Money transactions that paid for it or brought in its sale, oldest first. */
  transactions: ItemTransactionJson[];
  /** Imported with missing or unreadable values; `reviewNote` says what. */
  needsReview: boolean;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
};

// Platforms

/** Active platforms first, then archived ones, each in the order they were added. */
export function listPlatforms(db: Queryable): PlatformJson[] {
  const counts = new Map([...platformUse(db)].map(([id, items]) => [id, items.size]));
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

/** Which items use each platform, whether they were bought, listed, or sold there. */
function platformUse(db: Queryable): Map<number, Set<number>> {
  const pairs = [
    ...db
      .select({ platformId: resaleItems.purchasePlatformId, itemId: resaleItems.id })
      .from(resaleItems)
      .all(),
    ...db
      .select({ platformId: resaleItems.salePlatformId, itemId: resaleItems.id })
      .from(resaleItems)
      .all(),
    ...db
      .select({ platformId: resaleListings.platformId, itemId: resaleListings.itemId })
      .from(resaleListings)
      .all(),
  ];
  const use = new Map<number, Set<number>>();
  for (const { platformId, itemId } of pairs) {
    if (platformId === null) continue;
    use.set(platformId, (use.get(platformId) ?? new Set()).add(itemId));
  }
  return use;
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
    if ((platformUse(tx).get(id)?.size ?? 0) > 0) {
      throw conflict(
        "Items were bought, listed, or sold on this platform. Archive it instead to keep their history.",
      );
    }
    tx.delete(resalePlatforms).where(eq(resalePlatforms.id, id)).run();
  });
  return listPlatforms(db);
}

// Items

function platformNames(db: Queryable): Map<number, string> {
  return new Map(
    db
      .select({ id: resalePlatforms.id, name: resalePlatforms.name })
      .from(resalePlatforms)
      .all()
      .map((row) => [row.id, row.name]),
  );
}

/** Items as the API returns them, with their platform, costs, and logged time. */
function itemsJson(db: Queryable, rows: ItemRow[], now = new Date()): ItemJson[] {
  const ids = rows.map((row) => row.id);
  const names = platformNames(db);
  const costsByItem = new Map<number, CostRow[]>();
  const minutesByItem = new Map<number, number>();
  const listingsByItem = new Map<number, ListingJson[]>();
  const platformRef = (id: number | null) => {
    const name = id === null ? undefined : names.get(id);
    return id !== null && name !== undefined ? { id, name } : null;
  };
  if (ids.length > 0) {
    const listingRows: ListingRow[] = db
      .select()
      .from(resaleListings)
      .where(inArray(resaleListings.itemId, ids))
      .orderBy(desc(resaleListings.listedOn), desc(resaleListings.id))
      .all();
    const priceRows: PriceRow[] =
      listingRows.length === 0
        ? []
        : db
            .select()
            .from(resaleListingPrices)
            .where(
              inArray(
                resaleListingPrices.listingId,
                listingRows.map((listing) => listing.id),
              ),
            )
            .orderBy(asc(resaleListingPrices.changedOn), asc(resaleListingPrices.id))
            .all();
    for (const listing of listingRows) {
      const prices = priceRows
        .filter((price) => price.listingId === listing.id)
        .map((price) => ({
          id: price.id,
          priceCents: price.priceCents,
          changedOn: price.changedOn,
        }));
      listingsByItem.set(listing.itemId, [
        ...(listingsByItem.get(listing.itemId) ?? []),
        {
          id: listing.id,
          platform: platformRef(listing.platformId),
          url: listing.url,
          title: listing.title,
          description: listing.description,
          listedOn: listing.listedOn,
          endedOn: listing.endedOn,
          priceCents: prices.at(-1)?.priceCents ?? 0,
          prices,
        },
      ]);
    }
    const costRows = db
      .select()
      .from(resaleCosts)
      .where(inArray(resaleCosts.itemId, ids))
      .orderBy(asc(resaleCosts.id))
      .all();
    for (const cost of costRows) {
      costsByItem.set(cost.itemId, [...(costsByItem.get(cost.itemId) ?? []), cost]);
    }
    const entries = db
      .select({
        itemId: timeEntries.subjectId,
        startedAt: timeEntries.startedAt,
        minutes: timeEntries.minutes,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.subjectType, "resale_item"), inArray(timeEntries.subjectId, ids)))
      .all();
    for (const entry of entries) {
      if (entry.itemId === null) continue;
      const minutes =
        entry.minutes ??
        Math.max(0, Math.floor((now.getTime() - entry.startedAt.getTime()) / 60_000));
      minutesByItem.set(entry.itemId, (minutesByItem.get(entry.itemId) ?? 0) + minutes);
    }
  }
  const transactionsByItem = itemTransactions(db, ids);
  return rows.map((row) => {
    const costs = (costsByItem.get(row.id) ?? []).map((cost) => ({
      id: cost.id,
      kind: cost.kind,
      label: cost.label,
      amountCents: cost.amountCents,
      spentOn: cost.spentOn,
    }));
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      category: row.category,
      condition: row.condition,
      purchasedOn: row.purchasedOn,
      purchaseCents: row.purchaseCents,
      purchasePlatform: platformRef(row.purchasePlatformId),
      purchaseFrom: row.purchaseFrom,
      notes: row.notes,
      costs,
      costsCents: costs.reduce((sum, cost) => sum + cost.amountCents, 0),
      timeMinutes: minutesByItem.get(row.id) ?? 0,
      listings: listingsByItem.get(row.id) ?? [],
      soldOn: row.soldOn,
      saleCents: row.saleCents,
      salePlatform: platformRef(row.salePlatformId),
      buyerNotes: row.buyerNotes,
      transactions: transactionsByItem.get(row.id) ?? [],
      needsReview: row.needsReview,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

const oneItem = (db: Queryable, row: ItemRow): ItemJson => {
  const [item] = itemsJson(db, [row]);
  if (!item) throw new Error("Expected one item");
  return item;
};

/** Items, most recently added first, optionally only some statuses. */
export function listItems(db: Queryable, query: { status?: ItemStatus[] }): ItemJson[] {
  const rows = db
    .select()
    .from(resaleItems)
    .where(query.status ? inArray(resaleItems.status, query.status) : undefined)
    .orderBy(desc(resaleItems.createdAt), desc(resaleItems.id))
    .all();
  return itemsJson(db, rows);
}

export function requireItem(db: Queryable, id: number): ItemRow {
  const row = db.select().from(resaleItems).where(eq(resaleItems.id, id)).get();
  if (!row) throw notFound("That item doesn't exist. It may have been deleted.");
  return row;
}

export function getItem(db: Queryable, id: number): ItemJson {
  return oneItem(db, requireItem(db, id));
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
    soldOn: row.soldOn,
    soldFor: row.saleCents === null ? null : formatCents(row.saleCents),
    soldVia: row.salePlatformId === null ? null : (names.get(row.salePlatformId) ?? null),
    buyerNotes: row.buyerNotes,
    needsReview: row.needsReview,
  };
}

/** Records changes on the item's timeline. */
export function logItem(
  tx: Queryable,
  item: { id: number; title: string },
  changes: Record<string, { from: ActivityValue; to: ActivityValue }>,
  actor: string,
) {
  if (Object.keys(changes).length === 0) return;
  recordActivity(tx, {
    entity: { type: "resale_item", id: item.id },
    action: "updated",
    label: item.title,
    details: { changes },
    actor,
  });
}

/** Takes down an item's open listings, as of the day it sold. */
function endOpenListings(tx: Queryable, itemId: number, endedOn: string) {
  tx.update(resaleListings)
    .set({ endedOn, updatedAt: new Date() })
    .where(and(eq(resaleListings.itemId, itemId), isNull(resaleListings.endedOn)))
    .run();
}

export function createItem(db: Db, input: ItemCreate, actor: string, today: string): ItemJson {
  return db.transaction((tx) => {
    if (input.purchasePlatformId != null) requirePlatform(tx, input.purchasePlatformId, "body");
    if (input.salePlatformId != null) requirePlatform(tx, input.salePlatformId, "body");
    const status = input.status ?? "acquired";
    const row = tx
      .insert(resaleItems)
      .values({
        title: input.title,
        status,
        category: input.category ?? "",
        condition: input.condition ?? "",
        purchasedOn: input.purchasedOn ?? null,
        purchaseCents: input.purchaseCents ?? null,
        purchasePlatformId: input.purchasePlatformId ?? null,
        purchaseFrom: input.purchaseFrom ?? "",
        notes: input.notes ?? "",
        soldOn: input.soldOn ?? (status === "sold" ? today : null),
        saleCents: input.saleCents ?? null,
        salePlatformId: input.salePlatformId ?? null,
        buyerNotes: input.buyerNotes ?? "",
      })
      .returning()
      .get();
    recordActivity(tx, {
      entity: { type: "resale_item", id: row.id },
      action: "created",
      label: row.title,
      actor,
    });
    return oneItem(tx, row);
  });
}

export function updateItem(
  db: Db,
  id: number,
  patch: ItemUpdate,
  actor: string,
  today: string,
): ItemJson {
  return db.transaction((tx) => {
    const current = requireItem(tx, id);
    for (const [next, was] of [
      [patch.purchasePlatformId, current.purchasePlatformId],
      [patch.salePlatformId, current.salePlatformId],
    ] as const) {
      if (next != null && next !== was) requirePlatform(tx, next, "body");
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
      soldOn: keep(patch.soldOn, current.soldOn),
      saleCents: keep(patch.saleCents, current.saleCents),
      salePlatformId: keep(patch.salePlatformId, current.salePlatformId),
      buyerNotes: keep(patch.buyerNotes, current.buyerNotes),
      needsReview: keep(patch.needsReview, current.needsReview),
    };
    // Marking an item reviewed clears the note that explained why.
    if (!next.needsReview) next.reviewNote = "";
    // Selling an item dates the sale today unless a date is given, and takes down
    // its open listings. Sale details stay if it's moved back, in case that was a slip.
    const selling = next.status === "sold" && current.status !== "sold";
    if (selling && next.soldOn === null) next.soldOn = today;
    if (selling) endOpenListings(tx, id, next.soldOn ?? today);
    const changes = changedFields(tracked(current, names), tracked(next, names));
    if (Object.keys(changes).length === 0) return oneItem(tx, current);
    const { id: _id, createdAt: _createdAt, ...values } = next;
    const row = tx
      .update(resaleItems)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(resaleItems.id, id))
      .returning()
      .get();
    logItem(tx, row, changes, actor);
    return oneItem(tx, row);
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

// Costs

function requireCost(db: Queryable, id: number): CostRow {
  const row = db.select().from(resaleCosts).where(eq(resaleCosts.id, id)).get();
  if (!row) throw notFound("That cost doesn't exist. It may have been deleted.");
  return row;
}

function costTotal(db: Queryable, itemId: number): number {
  const row = db
    .select({ total: sql<number | null>`sum(${resaleCosts.amountCents})` })
    .from(resaleCosts)
    .where(eq(resaleCosts.itemId, itemId))
    .get();
  return row?.total ?? 0;
}

/**
 * Runs a change to an item's costs and logs the new total on the item's timeline,
 * like "costs: $10 → $22". Answers with the item.
 */
function changeCosts(db: Db, itemId: number, actor: string, change: (tx: Queryable) => void) {
  return db.transaction((tx) => {
    const item = requireItem(tx, itemId);
    const before = costTotal(tx, itemId);
    change(tx);
    const after = costTotal(tx, itemId);
    if (after !== before) {
      recordActivity(tx, {
        entity: { type: "resale_item", id: itemId },
        action: "updated",
        label: item.title,
        details: { changes: { costs: { from: formatCents(before), to: formatCents(after) } } },
        actor,
      });
    }
    return oneItem(tx, requireItem(tx, itemId));
  });
}

export function createCost(db: Db, itemId: number, input: CostCreate, actor: string): ItemJson {
  return changeCosts(db, itemId, actor, (tx) => {
    tx.insert(resaleCosts)
      .values({
        itemId,
        kind: input.kind,
        label: input.label ?? "",
        amountCents: input.amountCents,
        spentOn: input.spentOn ?? null,
      })
      .run();
  });
}

export function updateCost(db: Db, id: number, patch: CostUpdate, actor: string): ItemJson {
  const cost = requireCost(db, id);
  return changeCosts(db, cost.itemId, actor, (tx) => {
    tx.update(resaleCosts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(resaleCosts.id, id))
      .run();
  });
}

export function deleteCost(db: Db, id: number, actor: string): ItemJson {
  const cost = requireCost(db, id);
  return changeCosts(db, cost.itemId, actor, (tx) => {
    tx.delete(resaleCosts).where(eq(resaleCosts.id, id)).run();
  });
}

// Listings

function requireListing(db: Queryable, id: number): ListingRow {
  const row = db.select().from(resaleListings).where(eq(resaleListings.id, id)).get();
  if (!row) throw notFound("That listing doesn't exist. It may have been deleted.");
  return row;
}

function currentPrice(db: Queryable, listingId: number): number | null {
  const row = db
    .select({ priceCents: resaleListingPrices.priceCents })
    .from(resaleListingPrices)
    .where(eq(resaleListingPrices.listingId, listingId))
    .orderBy(desc(resaleListingPrices.changedOn), desc(resaleListingPrices.id))
    .get();
  return row?.priceCents ?? null;
}

/** "$40 on Local classifieds", for the timeline. */
function listingLabel(db: Queryable, priceCents: number, platformId: number | null): string {
  const name = platformId === null ? undefined : platformNames(db).get(platformId);
  return name ? `${formatCents(priceCents)} on ${name}` : formatCents(priceCents);
}

function checkListingDates(listedOn: string, endedOn: string | null) {
  if (endedOn !== null && endedOn < listedOn) {
    throw badRequest("A listing can't end before it was listed. Check the dates.");
  }
}

/**
 * Puts an item up for sale at a price. An item that wasn't listed, sold, or kept
 * yet becomes listed.
 */
/**
 * Adds a listing with its first price inside a transaction. An item that was
 * sourcing, acquired, or repairing becomes listed. Logs both on the timeline.
 */
function insertListing(
  tx: Queryable,
  item: ItemRow,
  input: ListingCreate,
  actor: string,
  today: string,
) {
  const listedOn = input.listedOn ?? today;
  const listing = tx
    .insert(resaleListings)
    .values({
      itemId: item.id,
      platformId: input.platformId ?? null,
      url: input.url ?? "",
      title: input.title ?? "",
      description: input.description ?? "",
      listedOn,
    })
    .returning()
    .get();
  tx.insert(resaleListingPrices)
    .values({ listingId: listing.id, priceCents: input.priceCents, changedOn: listedOn })
    .run();
  const changes: Record<string, { from: ActivityValue; to: ActivityValue }> = {
    listed: { from: null, to: listingLabel(tx, input.priceCents, listing.platformId) },
  };
  if (item.status === "sourcing" || item.status === "acquired" || item.status === "repairing") {
    tx.update(resaleItems)
      .set({ status: "listed", updatedAt: new Date() })
      .where(eq(resaleItems.id, item.id))
      .run();
    changes.status = { from: item.status, to: "listed" };
  }
  logItem(tx, item, changes, actor);
}

/** Puts an item up for sale at a price. */
export function createListing(
  db: Db,
  itemId: number,
  input: ListingCreate,
  actor: string,
  today: string,
): ItemJson {
  return db.transaction((tx) => {
    const item = requireItem(tx, itemId);
    if (input.platformId != null) requirePlatform(tx, input.platformId, "body");
    insertListing(tx, item, input, actor, today);
    return oneItem(tx, requireItem(tx, itemId));
  });
}

export function updateListing(db: Db, id: number, patch: ListingUpdate, actor: string): ItemJson {
  return db.transaction((tx) => {
    const current = requireListing(tx, id);
    if (patch.platformId != null && patch.platformId !== current.platformId) {
      requirePlatform(tx, patch.platformId, "body");
    }
    const listedOn = patch.listedOn ?? current.listedOn;
    const endedOn = patch.endedOn !== undefined ? patch.endedOn : current.endedOn;
    checkListingDates(listedOn, endedOn);
    tx.update(resaleListings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(resaleListings.id, id))
      .run();
    const item = requireItem(tx, current.itemId);
    if (endedOn !== current.endedOn) {
      const label = listingLabel(
        tx,
        currentPrice(tx, id) ?? 0,
        patch.platformId ?? current.platformId,
      );
      logItem(
        tx,
        item,
        {
          listing: endedOn
            ? { from: label, to: `Ended ${endedOn}` }
            : { from: `Ended ${current.endedOn}`, to: label },
        },
        actor,
      );
    }
    return oneItem(tx, item);
  });
}

/** A new asking price. The old one stays in the listing's price history. */
export function changePrice(
  db: Db,
  listingId: number,
  input: PriceChange,
  actor: string,
  today: string,
): ItemJson {
  return db.transaction((tx) => {
    const listing = requireListing(tx, listingId);
    const changedOn = input.changedOn ?? today;
    if (changedOn < listing.listedOn) {
      throw badRequest("A price can't change before the item was listed. Check the date.");
    }
    const before = currentPrice(tx, listingId);
    tx.insert(resaleListingPrices)
      .values({ listingId, priceCents: input.priceCents, changedOn })
      .run();
    const item = requireItem(tx, listing.itemId);
    logItem(
      tx,
      item,
      {
        askingPrice: {
          from: before === null ? null : formatCents(before),
          to: formatCents(input.priceCents),
        },
      },
      actor,
    );
    return oneItem(tx, item);
  });
}

export function deleteListing(db: Db, id: number, actor: string): ItemJson {
  return db.transaction((tx) => {
    const listing = requireListing(tx, id);
    const label = listingLabel(tx, currentPrice(tx, id) ?? 0, listing.platformId);
    tx.delete(resaleListings).where(eq(resaleListings.id, id)).run();
    const item = requireItem(tx, listing.itemId);
    logItem(tx, item, { listed: { from: label, to: null } }, actor);
    return oneItem(tx, item);
  });
}

// Import

class DryRun<T> extends Error {
  constructor(readonly result: T) {
    super("dry run");
  }
}

/**
 * Finds platforms by name (ignoring case), creating ones that don't exist yet.
 * `onCreate` hears about each new one. An empty name is no platform.
 */
function platformFinder(tx: Queryable, onCreate: (name: string) => void) {
  const platforms = new Map(
    tx
      .select({ id: resalePlatforms.id, name: resalePlatforms.name })
      .from(resalePlatforms)
      .all()
      .map((platform) => [platform.name.toLowerCase(), platform.id]),
  );
  return (name: string): number | null => {
    if (!name) return null;
    const known = platforms.get(name.toLowerCase());
    if (known !== undefined) return known;
    const last = tx
      .select({ last: sql<number | null>`max(${resalePlatforms.sortOrder})` })
      .from(resalePlatforms)
      .get();
    const created = tx
      .insert(resalePlatforms)
      .values({ name, sortOrder: (last?.last ?? 0) + 1 })
      .returning()
      .get();
    platforms.set(name.toLowerCase(), created.id);
    onCreate(name);
    return created.id;
  };
}

/**
 * Imports mapped CSV rows as items. Rows without a title are skipped, and rows that
 * match an item already in Hub (same title, purchase date, and price) are skipped
 * as duplicates, so importing a file twice is safe. Rows with missing or unreadable
 * values are imported and flagged for review. Platforms are matched by name
 * (ignoring case) and created when new. Fees and shipping become costs.
 * With `dryRun`, nothing is saved and the result says what would happen.
 */
export function importResale(
  db: Db,
  rows: ImportRow[],
  actor: string,
  dryRun: boolean,
): ImportResult {
  try {
    return db.transaction((tx) => {
      const result: ImportResult = {
        created: 0,
        needsReview: 0,
        duplicates: 0,
        skipped: 0,
        platformsCreated: [],
        rows: [],
      };
      const platformId = platformFinder(tx, (name) => result.platformsCreated.push(name));

      rows.forEach((raw, index) => {
        const read = readImportRow(raw);
        if (!read) {
          result.skipped += 1;
          result.rows.push({
            row: index + 1,
            title: "",
            outcome: "skip",
            problems: ["No title, so this row can't be imported."],
          });
          return;
        }
        const { item, problems } = read;
        const duplicate = tx
          .select({ id: resaleItems.id })
          .from(resaleItems)
          .where(
            and(
              sql`lower(${resaleItems.title}) = lower(${item.title})`,
              sql`${resaleItems.purchasedOn} is ${item.purchasedOn}`,
              sql`${resaleItems.purchaseCents} is ${item.purchaseCents}`,
            ),
          )
          .get();
        if (duplicate) {
          result.duplicates += 1;
          result.rows.push({
            row: index + 1,
            title: item.title,
            outcome: "duplicate",
            problems: ["Already in Hub with the same purchase date and price."],
          });
          return;
        }

        const row = tx
          .insert(resaleItems)
          .values({
            title: item.title,
            status: item.status,
            category: item.category,
            condition: item.condition,
            purchasedOn: item.purchasedOn,
            purchaseCents: item.purchaseCents,
            purchasePlatformId: platformId(item.purchasePlatform),
            purchaseFrom: item.purchaseFrom,
            notes: item.notes,
            soldOn: item.soldOn,
            saleCents: item.saleCents,
            salePlatformId: platformId(item.salePlatform),
            needsReview: problems.length > 0,
            reviewNote: problems.join(" "),
          })
          .returning()
          .get();
        for (const [kind, amountCents] of [
          ["fees", item.feesCents],
          ["shipping", item.shippingCents],
        ] as const) {
          if (amountCents !== null && amountCents > 0) {
            tx.insert(resaleCosts)
              .values({ itemId: row.id, kind, amountCents, spentOn: item.soldOn })
              .run();
          }
        }
        recordActivity(tx, {
          entity: { type: "resale_item", id: row.id },
          action: "created",
          label: row.title,
          actor,
        });
        result.created += 1;
        if (problems.length > 0) result.needsReview += 1;
        result.rows.push({ row: index + 1, title: item.title, outcome: "create", problems });
      });

      if (dryRun) throw new DryRun<ImportResult>(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result as ImportResult;
    throw error;
  }
}

/**
 * Adds a hub-listing/v1 listing, pasted in or sent by a Shortcut. When exactly one
 * unsold item has the same title (ignoring case), the listing goes on it; otherwise
 * a new item is made, flagged for review if details are missing. The listing's
 * platform is found by name or created. With `dryRun`, nothing is saved.
 */
export function importListing(
  db: Db,
  data: ListingImport,
  actor: string,
  today: string,
  dryRun: boolean,
): ListingImportResult {
  const read = readListingImport(data);
  if (!read) throw badRequest("Give the item a title, in item.title or listing.title.");
  try {
    return db.transaction((tx) => {
      let platformCreated: string | null = null;
      const findPlatform = platformFinder(tx, (name) => {
        platformCreated = name;
      });
      const matches = tx
        .select()
        .from(resaleItems)
        .where(
          and(
            sql`lower(${resaleItems.title}) = lower(${read.title})`,
            notInArray(resaleItems.status, ["sold", "kept"]),
          ),
        )
        .all();
      const existing = matches.length === 1 ? matches[0] : undefined;
      // Purchase details only matter for a new item; an existing one keeps its own.
      const problems = existing
        ? read.problems.filter((problem) => /listing/i.test(problem))
        : read.problems;

      let item: ItemRow;
      if (existing) {
        item = existing;
      } else {
        item = tx
          .insert(resaleItems)
          .values({
            title: read.title,
            status: "acquired",
            category: read.category,
            condition: read.condition,
            purchasedOn: read.purchasedOn,
            purchaseCents: read.purchaseCents,
            purchaseFrom: read.purchaseFrom,
            notes: read.notes,
            needsReview: problems.length > 0,
            reviewNote: problems.join(" "),
          })
          .returning()
          .get();
        recordActivity(tx, {
          entity: { type: "resale_item", id: item.id },
          action: "created",
          label: item.title,
          actor,
        });
      }

      const listing = read.listing;
      const listed = listing !== null && listing.priceCents !== null;
      if (listing && listing.priceCents !== null) {
        insertListing(
          tx,
          item,
          {
            platformId: findPlatform(listing.platform),
            priceCents: listing.priceCents,
            url: listing.url,
            title: listing.title,
            description: listing.description,
          },
          actor,
          today,
        );
      }

      const where =
        listing?.platform && listing.priceCents !== null
          ? ` on ${listing.platform} for ${formatCents(listing.priceCents)}`
          : listing?.priceCents != null
            ? ` for ${formatCents(listing.priceCents)}`
            : "";
      const outcome: ListingImportResult["outcome"] = !existing
        ? "created"
        : listed
          ? "listed"
          : "unchanged";
      const message =
        outcome === "created"
          ? `Added ${item.title}${listed ? ` and listed it${where}` : ""}.${problems.length > 0 ? " It's flagged to review." : ""}`
          : outcome === "listed"
            ? `Listed ${item.title}${where}.`
            : `${item.title} is already in Hub, and there was no listing with a price to add.`;
      const result: ListingImportResult = {
        outcome,
        itemId: dryRun ? null : item.id,
        title: item.title,
        platformCreated,
        needsReview: !existing && problems.length > 0,
        problems,
        message,
      };
      if (dryRun) throw new DryRun<ListingImportResult>(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result as ListingImportResult;
    throw error;
  }
}
