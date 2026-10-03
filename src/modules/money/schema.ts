import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { BankColumns, BankOptions } from "../../shared/bankImport";
import { ACCOUNT_KINDS, BOOK_KINDS, CATEGORY_KINDS } from "../../shared/books";
import { RULE_DIRECTIONS } from "../../shared/moneyRules";
import { REWARD_KINDS } from "../../shared/rewards";

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

/**
 * A payment card on the account it spends from: a credit card on its credit card
 * account, a debit card on checking. Only the last 4 digits are kept.
 */
export const moneyCards = sqliteTable(
  "money_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => moneyAccounts.id),
    name: text("name").notNull(),
    last4: text("last4"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("money_cards_account_idx").on(t.accountId)],
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
    /**
     * The payee as the bank wrote it, kept when an import adds it, so a later file still
     * matches after the payee is renamed. Null for transactions entered by hand.
     */
    bankPayee: text("bank_payee"),
    /** Who was paid or paid, for payment apps like Venmo: "John Smith". */
    counterparty: text("counterparty"),
    /** The card it was paid with (or refunded to), when known. */
    cardId: integer("card_id").references(() => moneyCards.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("money_transactions_account_date_idx").on(t.accountId, t.date),
    index("money_transactions_category_idx").on(t.categoryId),
    index("money_transactions_date_idx").on(t.date),
    index("money_transactions_import_idx").on(t.importId),
    index("money_transactions_external_idx").on(t.accountId, t.externalId),
    index("money_transactions_transfer_idx").on(t.transferPeerId),
    index("money_transactions_card_idx").on(t.cardId),
  ],
);

/**
 * A part of a split transaction: one charge in several categories, like a store run
 * that was half groceries and half household things. The parts add up to the
 * transaction, which keeps its largest part's category, so anything that reads only
 * the transaction (or an older build) still sees a sensible one. No foreign key, so a
 * rollback to a build without splits can still delete transactions.
 */
export const moneyTransactionSplits = sqliteTable(
  "money_transaction_splits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id").notNull(),
    categoryId: integer("category_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    memo: text("memo").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("money_transaction_splits_transaction_idx").on(t.transactionId),
    index("money_transaction_splits_category_idx").on(t.categoryId),
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
    source: text("source", { enum: ["csv", "ofx", "statement"] }).notNull(),
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

/**
 * A spending category's monthly budget from `month` (YYYY-MM) on, until a later
 * month sets another amount. 0 ends the budget from that month.
 */
export const moneyBudgets = sqliteTable(
  "money_budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => moneyCategories.id),
    month: text("month").notNull(),
    amountCents: integer("amount_cents").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("money_budgets_category_month_unique").on(t.categoryId, t.month)],
);

/**
 * An account's balance on a day, entered from a statement, for accounts that aren't
 * imported (a retirement account, a loan). The balance is the latest snapshot plus
 * any transactions dated after it.
 */
export const moneyBalanceSnapshots = sqliteTable(
  "money_balance_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => moneyAccounts.id),
    date: text("date").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    note: text("note").notNull().default(""),
    ...timestamps(),
  },
  (t) => [uniqueIndex("money_balance_snapshots_account_date_unique").on(t.accountId, t.date)],
);

/**
 * A card's rewards program: cash back or points, what everything earns, and what a
 * point is worth. One per card. No foreign keys here or in its rates, so a rollback to
 * a build without rewards can still delete cards and categories; Hub removes a card's
 * rewards with it.
 */
export const moneyCardRewards = sqliteTable("money_card_rewards", {
  cardId: integer("card_id").primaryKey(),
  kind: text("kind", { enum: REWARD_KINDS }).notNull().default("cash_back"),
  /** Hundredths of a percent (cash back) or of a point per dollar. */
  baseRate: integer("base_rate").notNull().default(0),
  /** Hundredths of a cent per point. */
  pointValue: integer("point_value").notNull().default(100),
  /** What the card costs a year, for whether it's worth it. */
  annualFeeCents: integer("annual_fee_cents").notNull().default(0),
  ...timestamps(),
});

/** A bonus rate on a card: for a store or a category, maybe between dates, maybe capped. */
export const moneyRewardRates = sqliteTable(
  "money_reward_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id").notNull(),
    categoryId: integer("category_id"),
    contains: text("contains"),
    rate: integer("rate").notNull(),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    capCents: integer("cap_cents"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("money_reward_rates_card_idx").on(t.cardId)],
);

/** A card's points balance on a day, from its statement. One per card per day. */
export const moneyPointBalances = sqliteTable(
  "money_point_balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id").notNull(),
    date: text("date").notNull(),
    points: integer("points").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("money_point_balances_card_date_unique").on(t.cardId, t.date)],
);

/** Points used, and what they were worth: a statement credit, a gift card, travel. */
export const moneyPointRedemptions = sqliteTable(
  "money_point_redemptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id").notNull(),
    date: text("date").notNull(),
    points: integer("points").notNull(),
    valueCents: integer("value_cents").notNull(),
    note: text("note").notNull().default(""),
    ...timestamps(),
  },
  (t) => [index("money_point_redemptions_card_idx").on(t.cardId)],
);

/** What a transaction looked like before a receipt changed it, so removing the receipt puts it back. */
export type ReceiptBefore = {
  payee: string;
  memo: string;
  categoryId: number | null;
  cardId: number | null;
  splits: Array<{ categoryId: number; amountCents: number; memo: string }>;
};

/**
 * A receipt, attached to the transaction it's for: the store, the lines, and how it
 * got there. `createdTransaction` is set when the receipt came before the bank's
 * record and Hub added the transaction; `bankMatched` once a bank file found it, so
 * the file doesn't add it again. No foreign key, like the other newer tables.
 */
export const moneyReceipts = sqliteTable(
  "money_receipts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id").notNull(),
    store: text("store").notNull(),
    date: text("date").notNull(),
    /** Positive: what was charged, or for a return, what came back. */
    totalCents: integer("total_cents").notNull(),
    type: text("type", { enum: ["purchase", "return"] })
      .notNull()
      .default("purchase"),
    items: text("items", { mode: "json" })
      .$type<Array<{ name: string; amountCents: number; category: string }>>()
      .notNull(),
    note: text("note").notNull().default(""),
    createdTransaction: integer("created_transaction", { mode: "boolean" }).notNull(),
    bankMatched: integer("bank_matched", { mode: "boolean" }).notNull().default(false),
    before: text("before", { mode: "json" }).$type<ReceiptBefore>(),
    ...timestamps(),
  },
  (t) => [
    index("money_receipts_transaction_idx").on(t.transactionId),
    index("money_receipts_date_idx").on(t.date),
  ],
);
