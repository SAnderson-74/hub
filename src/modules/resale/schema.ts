import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ITEM_STATUSES } from "../../shared/resale";

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
    ...timestamps(),
  },
  (t) => [
    index("resale_items_status_idx").on(t.status),
    index("resale_items_platform_idx").on(t.purchasePlatformId),
  ],
);
