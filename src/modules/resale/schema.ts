import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { COST_KINDS, ITEM_STATUSES } from "../../shared/resale";

const timestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Places to buy and sell, entered by the owner (names never live in code). A
 * platform that items use is archived rather than deleted, so history keeps it.
 */
export const resalePlatforms = sqliteTable("resale_platforms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: real("sort_order").notNull().default(0),
  ...timestamps(),
});

/** Something bought to resell (or kept), with what was paid and where. */
export const resaleItems = sqliteTable(
  "resale_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("acquired"),
    category: text("category").notNull().default(""),
    condition: text("condition").notNull().default(""),
    purchasedOn: text("purchased_on"),
    purchaseCents: integer("purchase_cents"),
    purchasePlatformId: integer("purchase_platform_id").references(() => resalePlatforms.id, {
      onDelete: "set null",
    }),
    purchaseFrom: text("purchase_from").notNull().default(""),
    notes: text("notes").notNull().default(""),
    soldOn: text("sold_on"),
    saleCents: integer("sale_cents"),
    salePlatformId: integer("sale_platform_id").references(() => resalePlatforms.id, {
      onDelete: "set null",
    }),
    buyerNotes: text("buyer_notes").notNull().default(""),
    /** Set by imports with missing or unreadable values; `review_note` says what. */
    needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(false),
    reviewNote: text("review_note").notNull().default(""),
    ...timestamps(),
  },
  (t) => [
    index("resale_items_status_idx").on(t.status),
    index("resale_items_platform_idx").on(t.purchasePlatformId),
  ],
);

/** Money spent on an item besides its price: parts, fees, shipping, supplies. */
export const resaleCosts = sqliteTable(
  "resale_costs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => resaleItems.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: COST_KINDS }).notNull().default("other"),
    label: text("label").notNull().default(""),
    amountCents: integer("amount_cents").notNull(),
    spentOn: text("spent_on"),
    ...timestamps(),
  },
  (t) => [index("resale_costs_item_idx").on(t.itemId)],
);

/** Where and when an item was put up for sale. Open until `ended_on` is set. */
export const resaleListings = sqliteTable(
  "resale_listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => resaleItems.id, { onDelete: "cascade" }),
    platformId: integer("platform_id").references(() => resalePlatforms.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull().default(""),
    listedOn: text("listed_on").notNull(),
    endedOn: text("ended_on"),
    ...timestamps(),
  },
  (t) => [
    index("resale_listings_item_idx").on(t.itemId),
    index("resale_listings_platform_idx").on(t.platformId),
  ],
);

/** Every asking price a listing has had. The newest is the current price. */
export const resaleListingPrices = sqliteTable(
  "resale_listing_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => resaleListings.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    changedOn: text("changed_on").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("resale_listing_prices_listing_idx").on(t.listingId)],
);
