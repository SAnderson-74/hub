import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { FUNDS } from "../../shared/tithing";

// Tithing is kept beside the money transactions, not inside them, so an older build
// ignores it. No foreign keys: a rollback to a build without tithing can still delete
// transactions, and deleting one clears its rows here (see transactionLinks.ts).

const timestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A choice made about one money-in transaction: tithing doesn't apply, or it's figured
 * on `base_cents` instead of the whole amount. Without a row, money in is tithed on
 * the whole amount (or a sale's profit), except transfers and refunds.
 */
export const tithingIncome = sqliteTable(
  "tithing_income",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id").notNull(),
    applies: integer("applies", { mode: "boolean" }).notNull().default(true),
    /** The amount tithing is figured on. Null means the default for the transaction. */
    baseCents: integer("base_cents"),
    /**
     * Marked as paid without a payment in Hub, for tithing paid before Hub tracked it
     * (or somewhere it doesn't see). It counts as paid, and no payment links to it.
     */
    settled: integer("settled", { mode: "boolean" }).notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("tithing_income_transaction_unique").on(t.transactionId)],
);

/** A money-out transaction that was a donation, and which fund it went to. */
export const tithingPayments = sqliteTable(
  "tithing_payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id").notNull(),
    fund: text("fund", { enum: FUNDS }).notNull().default("tithing"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("tithing_payments_transaction_unique").on(t.transactionId)],
);

/** How much of a tithing payment pays for one income transaction. */
export const tithingLinks = sqliteTable(
  "tithing_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentTransactionId: integer("payment_transaction_id").notNull(),
    incomeTransactionId: integer("income_transaction_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("tithing_links_pair_unique").on(t.paymentTransactionId, t.incomeTransactionId),
    index("tithing_links_income_idx").on(t.incomeTransactionId),
  ],
);
