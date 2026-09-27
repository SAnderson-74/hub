import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ACCOUNT_KINDS, BOOK_KINDS, CATEGORY_KINDS } from "../../shared/books";

const timestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A separate set of books, like personal money or a small business. */
export const moneyBooks = sqliteTable("money_books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: BOOK_KINDS }).notNull().default("personal"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: real("sort_order").notNull().default(0),
  ...timestamps(),
});

/**
 * A bank account, card, loan, or cash. Its balance is the opening balance plus its
 * transactions. One with transactions is archived rather than deleted.
 */
export const moneyAccounts = sqliteTable(
  "money_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id")
      .notNull()
      .references(() => moneyBooks.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: ACCOUNT_KINDS }).notNull().default("checking"),
    institution: text("institution").notNull().default(""),
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
    notes: text("notes").notNull().default(""),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    sortOrder: real("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("money_accounts_book_idx").on(t.bookId)],
);

/** What money was for, per book. Income and spending are kept apart for budgets. */
export const moneyCategories = sqliteTable(
  "money_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id")
      .notNull()
      .references(() => moneyBooks.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull().default("expense"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    sortOrder: real("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("money_categories_book_idx").on(t.bookId)],
);

/** Money into (positive) or out of (negative) an account on a day. */
export const moneyTransactions = sqliteTable(
  "money_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => moneyAccounts.id),
    date: text("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    payee: text("payee").notNull().default(""),
    memo: text("memo").notNull().default(""),
    categoryId: integer("category_id").references(() => moneyCategories.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    index("money_transactions_account_date_idx").on(t.accountId, t.date),
    index("money_transactions_category_idx").on(t.categoryId),
    index("money_transactions_date_idx").on(t.date),
  ],
);
