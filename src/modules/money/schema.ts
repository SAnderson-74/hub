import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { BankColumns, BankOptions } from "../../shared/bankImport";
import { ACCOUNT_KINDS, BOOK_KINDS, CATEGORY_KINDS } from "../../shared/books";
import { RULE_DIRECTIONS } from "../../shared/moneyRules";

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
    /** The file import that added it (money_imports.id), so the import can be undone. */
    importId: integer("import_id"),
    /** The bank's own id for it (OFX FITID), for spotting it in a later file. */
    externalId: text("external_id"),
    /** The other side of a transfer between accounts. Both sides point at each other. */
    transferPeerId: integer("transfer_peer_id"),
    ...timestamps(),
  },
  (t) => [
    index("money_transactions_account_date_idx").on(t.accountId, t.date),
    index("money_transactions_category_idx").on(t.categoryId),
    index("money_transactions_date_idx").on(t.date),
    index("money_transactions_import_idx").on(t.importId),
    index("money_transactions_external_idx").on(t.accountId, t.externalId),
    index("money_transactions_transfer_idx").on(t.transferPeerId),
  ],
);

/** One file imported into an account. Undoing it removes the transactions it added. */
export const moneyImports = sqliteTable(
  "money_imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => moneyAccounts.id),
    source: text("source", { enum: ["csv", "ofx"] }).notNull(),
    fileName: text("file_name").notNull().default(""),
    created: integer("created").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    undoneAt: integer("undone_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("money_imports_account_idx").on(t.accountId)],
);

/**
 * How a CSV layout's columns map to transactions, saved by its headers so the next
 * file from the same bank maps itself, with the account it last went into.
 */
export const moneyImportLayouts = sqliteTable("money_import_layouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  headerKey: text("header_key").notNull().unique(),
  columns: text("columns", { mode: "json" }).$type<BankColumns>().notNull(),
  options: text("options", { mode: "json" }).$type<BankOptions>().notNull(),
  accountId: integer("account_id").references(() => moneyAccounts.id, { onDelete: "set null" }),
  ...timestamps(),
});

/**
 * "Payee contains X → category Y", optionally only for money in or out, optionally
 * renaming the payee. Applied in order on imports; the first that fits wins.
 */
export const moneyRules = sqliteTable(
  "money_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id")
      .notNull()
      .references(() => moneyBooks.id),
    contains: text("contains").notNull(),
    direction: text("direction", { enum: RULE_DIRECTIONS }).notNull().default("any"),
    categoryId: integer("category_id")
      .notNull()
      .references(() => moneyCategories.id),
    renameTo: text("rename_to").notNull().default(""),
    sortOrder: real("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("money_rules_book_idx").on(t.bookId)],
);
