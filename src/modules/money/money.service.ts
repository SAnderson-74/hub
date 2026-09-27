import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import {
  type AccountCreate,
  type AccountKind,
  type AccountUpdate,
  type BookCreate,
  type BookKind,
  type BookUpdate,
  CATEGORY_KINDS,
  type CategoryCreate,
  type CategoryKind,
  type CategoryUpdate,
  STARTER_CATEGORIES,
  type TransactionCreate,
  type TransactionQuery,
  type TransactionUpdate,
} from "../../shared/books";
import type { LinkRole } from "../../shared/resale";
import { goalAccounts } from "../goals/schema";
import { transactionItems } from "../resale/transactionLinks";
import {
  moneyAccounts,
  moneyBalanceSnapshots,
  moneyBooks,
  moneyBudgets,
  moneyCategories,
  moneyImports,
  moneyRules,
  moneyTransactions,
} from "./schema";

type BookRow = typeof moneyBooks.$inferSelect;
type AccountRow = typeof moneyAccounts.$inferSelect;
type CategoryRow = typeof moneyCategories.$inferSelect;
type TransactionRow = typeof moneyTransactions.$inferSelect;

export type BookJson = {
  id: number;
  name: string;
  kind: BookKind;
  archived: boolean;
  /** A book with accounts can be archived, not deleted. */
  accountCount: number;
};

export type AccountJson = {
  id: number;
  bookId: number;
  name: string;
  kind: AccountKind;
  institution: string;
  openingBalanceCents: number;
  /**
   * The latest balance snapshot plus transactions dated after it, or without
   * snapshots, the opening balance plus every transaction. Negative means money owed.
   */
  balanceCents: number;
  /** The newest balance entered from a statement, if any. */
  latestSnapshot: { date: string; balanceCents: number } | null;
  /** An account with transactions or snapshots can be archived, not deleted. */
  transactionCount: number;
  snapshotCount: number;
  notes: string;
  archived: boolean;
};

export type CategoryJson = {
  id: number;
  bookId: number;
  name: string;
  kind: CategoryKind;
  archived: boolean;
  /** A category in use can be archived, not deleted. */
  transactionCount: number;
};

export type TransactionJson = {
  id: number;
  account: { id: number; name: string };
  date: string;
  /** Positive for money in, negative for money out. */
  amountCents: number;
  payee: string;
  memo: string;
  category: { id: number; name: string; kind: CategoryKind } | null;
  /** The other side when this is a transfer between accounts. Transfers have no category. */
  transfer: { transactionId: number; account: { id: number; name: string } } | null;
  /** Resale items this paid for or came from. */
  resaleItems: Array<{ id: number; title: string; role: LinkRole }>;
  createdAt: string;
  updatedAt: string;
};

export type TransactionPage = {
  transactions: TransactionJson[];
  /** Matching transactions across all pages, and what they add up to. */
  total: number;
  /** Money in and out, not counting transfers between accounts. */
  inCents: number;
  outCents: number;
  /** Matching transfers, left out of the in and out totals. */
  transferCount: number;
};

/** Names are unique ignoring case. */
const sameName = (
  column: typeof moneyBooks.name | typeof moneyAccounts.name | typeof moneyCategories.name,
  name: string,
) => sql`lower(${column}) = lower(${name})`;

const nextSortOrder = (
  db: Queryable,
  table: typeof moneyBooks | typeof moneyAccounts | typeof moneyCategories,
) =>
  (db
    .select({ last: sql<number | null>`max(${table.sortOrder})` })
    .from(table)
    .get()?.last ?? 0) + 1;

// Books

export function listBooks(db: Queryable): BookJson[] {
  const counts = new Map(
    db
      .select({ bookId: moneyAccounts.bookId, n: count() })
      .from(moneyAccounts)
      .groupBy(moneyAccounts.bookId)
      .all()
      .map((row) => [row.bookId, row.n]),
  );
  return db
    .select()
    .from(moneyBooks)
    .orderBy(asc(moneyBooks.archived), asc(moneyBooks.sortOrder), asc(moneyBooks.id))
    .all()
    .map((row) => bookJson(row, counts.get(row.id) ?? 0));
}

function bookJson(row: BookRow, accountCount: number): BookJson {
  return { id: row.id, name: row.name, kind: row.kind, archived: row.archived, accountCount };
}

export function requireBook(db: Queryable, id: number, from: "path" | "body" = "path"): BookRow {
  const row = db.select().from(moneyBooks).where(eq(moneyBooks.id, id)).get();
  if (row) return row;
  const message = "That book doesn't exist. It may have been deleted.";
  throw from === "path" ? notFound(message) : badRequest(message);
}

function checkBookNameFree(db: Queryable, name: string, exceptId?: number) {
  const taken = db
    .select({ id: moneyBooks.id })
    .from(moneyBooks)
    .where(
      and(
        sameName(moneyBooks.name, name),
        exceptId === undefined ? undefined : ne(moneyBooks.id, exceptId),
      ),
    )
    .get();
  if (taken) throw conflict(`There's already a book called "${name}". Pick another name.`);
}

function oneBook(db: Queryable, id: number): BookJson {
  const book = listBooks(db).find((item) => item.id === id);
  if (!book) throw new Error("Expected the book to exist");
  return book;
}

export function createBook(db: Db, input: BookCreate): BookJson {
  return db.transaction((tx) => {
    checkBookNameFree(tx, input.name);
    const book = tx
      .insert(moneyBooks)
      .values({ name: input.name, kind: input.kind, sortOrder: nextSortOrder(tx, moneyBooks) })
      .returning()
      .get();
    if (input.starterCategories) {
      let sortOrder = 1;
      for (const kind of CATEGORY_KINDS) {
        for (const name of STARTER_CATEGORIES[input.kind][kind]) {
          tx.insert(moneyCategories)
            .values({ bookId: book.id, name, kind, sortOrder: sortOrder++ })
            .run();
        }
      }
    }
    return bookJson(book, 0);
  });
}

export function updateBook(db: Db, id: number, patch: BookUpdate): BookJson {
  return db.transaction((tx) => {
    requireBook(tx, id);
    if (patch.name !== undefined) checkBookNameFree(tx, patch.name, id);
    tx.update(moneyBooks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(moneyBooks.id, id))
      .run();
    return oneBook(tx, id);
  });
}

export function deleteBook(db: Db, id: number): void {
  db.transaction((tx) => {
    requireBook(tx, id);
    const accounts = tx
      .select({ n: count() })
      .from(moneyAccounts)
      .where(eq(moneyAccounts.bookId, id))
      .get();
    if ((accounts?.n ?? 0) > 0) {
      throw conflict("This book has accounts. Archive it instead to keep their history.");
    }
    // Without accounts there are no transactions, so its rules and categories are unused.
    tx.delete(moneyRules).where(eq(moneyRules.bookId, id)).run();
    const categoryIds = tx
      .select({ id: moneyCategories.id })
      .from(moneyCategories)
      .where(eq(moneyCategories.bookId, id))
      .all()
      .map((row) => row.id);
    if (categoryIds.length > 0) {
      tx.delete(moneyBudgets).where(inArray(moneyBudgets.categoryId, categoryIds)).run();
    }
    tx.delete(moneyCategories).where(eq(moneyCategories.bookId, id)).run();
    tx.delete(moneyBooks).where(eq(moneyBooks.id, id)).run();
  });
}

// Accounts

/** A book's accounts with their balances: active first, then archived. */
export function listAccounts(db: Queryable, bookId: number): AccountJson[] {
  requireBook(db, bookId);
  const rows = db
    .select()
    .from(moneyAccounts)
    .where(eq(moneyAccounts.bookId, bookId))
    .orderBy(asc(moneyAccounts.archived), asc(moneyAccounts.sortOrder), asc(moneyAccounts.id))
    .all();
  return accountsJson(db, rows);
}

function accountsJson(db: Queryable, rows: AccountRow[]): AccountJson[] {
  if (rows.length === 0) return [];
  const totals = new Map(
    db
      .select({
        accountId: moneyTransactions.accountId,
        sum: sql<number>`sum(${moneyTransactions.amountCents})`,
        n: count(),
      })
      .from(moneyTransactions)
      .where(
        inArray(
          moneyTransactions.accountId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(moneyTransactions.accountId)
      .all()
      .map((row) => [row.accountId, row]),
  );
  const snapshots = new Map<number, { date: string; balanceCents: number; count: number }>();
  for (const snapshot of db
    .select({
      accountId: moneyBalanceSnapshots.accountId,
      date: moneyBalanceSnapshots.date,
      balanceCents: moneyBalanceSnapshots.balanceCents,
    })
    .from(moneyBalanceSnapshots)
    .where(
      inArray(
        moneyBalanceSnapshots.accountId,
        rows.map((row) => row.id),
      ),
    )
    .all()) {
    const latest = snapshots.get(snapshot.accountId);
    snapshots.set(snapshot.accountId, {
      ...(latest && latest.date > snapshot.date ? latest : snapshot),
      count: (latest?.count ?? 0) + 1,
    });
  }
  // Transactions after each account's latest snapshot, which the snapshot doesn't include.
  const since = new Map(
    [...snapshots].map(([accountId, snapshot]) => [
      accountId,
      db
        .select({ sum: sql<number | null>`sum(${moneyTransactions.amountCents})` })
        .from(moneyTransactions)
        .where(
          and(
            eq(moneyTransactions.accountId, accountId),
            gt(moneyTransactions.date, snapshot.date),
          ),
        )
        .get()?.sum ?? 0,
    ]),
  );
  return rows.map((row) => {
    const total = totals.get(row.id);
    const snapshot = snapshots.get(row.id);
    return {
      id: row.id,
      bookId: row.bookId,
      name: row.name,
      kind: row.kind,
      institution: row.institution,
      openingBalanceCents: row.openingBalanceCents,
      balanceCents: snapshot
        ? snapshot.balanceCents + (since.get(row.id) ?? 0)
        : row.openingBalanceCents + (total?.sum ?? 0),
      latestSnapshot: snapshot
        ? { date: snapshot.date, balanceCents: snapshot.balanceCents }
        : null,
      transactionCount: total?.n ?? 0,
      snapshotCount: snapshot?.count ?? 0,
      notes: row.notes,
      archived: row.archived,
    };
  });
}

/** Accounts by id, with their balances, for other modules (savings goals). */
export function accountsById(db: Queryable, ids: number[]): Map<number, AccountJson> {
  if (ids.length === 0) return new Map();
  const rows = db.select().from(moneyAccounts).where(inArray(moneyAccounts.id, ids)).all();
  return new Map(accountsJson(db, rows).map((account) => [account.id, account]));
}

/** Every account in every book, for pickers outside Money (goals). Active books first. */
export function allAccounts(db: Queryable): Array<AccountJson & { bookName: string }> {
  const books = new Map(listBooks(db).map((book) => [book.id, book]));
  const rows = db
    .select()
    .from(moneyAccounts)
    .orderBy(asc(moneyAccounts.archived), asc(moneyAccounts.sortOrder), asc(moneyAccounts.id))
    .all();
  const order = [...books.keys()];
  return accountsJson(db, rows)
    .map((account) => ({ ...account, bookName: books.get(account.bookId)?.name ?? "" }))
    .sort((a, b) => order.indexOf(a.bookId) - order.indexOf(b.bookId));
}

function oneAccount(db: Queryable, row: AccountRow): AccountJson {
  const [account] = accountsJson(db, [row]);
  if (!account) throw new Error("Expected one account");
  return account;
}

export function requireAccount(
  db: Queryable,
  id: number,
  from: "path" | "body" = "path",
): AccountRow {
  const row = db.select().from(moneyAccounts).where(eq(moneyAccounts.id, id)).get();
  if (row) return row;
  const message = "That account doesn't exist. It may have been deleted.";
  throw from === "path" ? notFound(message) : badRequest(message);
}

function checkAccountNameFree(db: Queryable, bookId: number, name: string, exceptId?: number) {
  const taken = db
    .select({ id: moneyAccounts.id })
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        sameName(moneyAccounts.name, name),
        exceptId === undefined ? undefined : ne(moneyAccounts.id, exceptId),
      ),
    )
    .get();
  if (taken) throw conflict(`This book already has an account called "${name}".`);
}

export function createAccount(db: Db, input: AccountCreate): AccountJson {
  return db.transaction((tx) => {
    requireBook(tx, input.bookId, "body");
    checkAccountNameFree(tx, input.bookId, input.name);
    const row = tx
      .insert(moneyAccounts)
      .values({
        bookId: input.bookId,
        name: input.name,
        kind: input.kind,
        institution: input.institution ?? "",
        openingBalanceCents: input.openingBalanceCents ?? 0,
        notes: input.notes ?? "",
        archived: input.archived ?? false,
        sortOrder: nextSortOrder(tx, moneyAccounts),
      })
      .returning()
      .get();
    return oneAccount(tx, row);
  });
}

export function updateAccount(db: Db, id: number, patch: AccountUpdate): AccountJson {
  return db.transaction((tx) => {
    const current = requireAccount(tx, id);
    if (patch.name !== undefined) checkAccountNameFree(tx, current.bookId, patch.name, id);
    const row = tx
      .update(moneyAccounts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(moneyAccounts.id, id))
      .returning()
      .get();
    return oneAccount(tx, row);
  });
}

export function deleteAccount(db: Db, id: number): void {
  db.transaction((tx) => {
    const account = oneAccount(tx, requireAccount(tx, id));
    if (account.transactionCount > 0 || account.snapshotCount > 0) {
      throw conflict(
        "This account has transactions or balance history. Archive it instead to keep them.",
      );
    }
    // Imports whose transactions are all gone (undone) go with it, and so do goal links.
    tx.delete(moneyImports).where(eq(moneyImports.accountId, id)).run();
    tx.delete(goalAccounts).where(eq(goalAccounts.accountId, id)).run();
    tx.delete(moneyAccounts).where(eq(moneyAccounts.id, id)).run();
  });
}

// Categories

/** A book's categories: spending first, then income, archived ones last in each. */
export function listCategories(db: Queryable, bookId: number): CategoryJson[] {
  requireBook(db, bookId);
  const counts = new Map(
    db
      .select({ categoryId: moneyTransactions.categoryId, n: count() })
      .from(moneyTransactions)
      .innerJoin(moneyCategories, eq(moneyCategories.id, moneyTransactions.categoryId))
      .where(eq(moneyCategories.bookId, bookId))
      .groupBy(moneyTransactions.categoryId)
      .all()
      .map((row) => [row.categoryId, row.n]),
  );
  return db
    .select()
    .from(moneyCategories)
    .where(eq(moneyCategories.bookId, bookId))
    .all()
    .sort(
      (a, b) =>
        CATEGORY_KINDS.indexOf(a.kind) - CATEGORY_KINDS.indexOf(b.kind) ||
        Number(a.archived) - Number(b.archived) ||
        a.sortOrder - b.sortOrder ||
        a.id - b.id,
    )
    .map((row) => categoryJson(row, counts.get(row.id) ?? 0));
}

function categoryJson(row: CategoryRow, transactionCount: number): CategoryJson {
  return {
    id: row.id,
    bookId: row.bookId,
    name: row.name,
    kind: row.kind,
    archived: row.archived,
    transactionCount,
  };
}

export function requireCategory(
  db: Queryable,
  id: number,
  from: "path" | "body" = "path",
): CategoryRow {
  const row = db.select().from(moneyCategories).where(eq(moneyCategories.id, id)).get();
  if (row) return row;
  const message = "That category doesn't exist. It may have been deleted.";
  throw from === "path" ? notFound(message) : badRequest(message);
}

function checkCategoryNameFree(db: Queryable, bookId: number, name: string, exceptId?: number) {
  const taken = db
    .select({ id: moneyCategories.id })
    .from(moneyCategories)
    .where(
      and(
        eq(moneyCategories.bookId, bookId),
        sameName(moneyCategories.name, name),
        exceptId === undefined ? undefined : ne(moneyCategories.id, exceptId),
      ),
    )
    .get();
  if (taken) throw conflict(`This book already has a category called "${name}".`);
}

function oneCategory(db: Queryable, row: CategoryRow): CategoryJson {
  const used = db
    .select({ n: count() })
    .from(moneyTransactions)
    .where(eq(moneyTransactions.categoryId, row.id))
    .get();
  return categoryJson(row, used?.n ?? 0);
}

export function createCategory(db: Db, input: CategoryCreate): CategoryJson {
  return db.transaction((tx) => {
    requireBook(tx, input.bookId, "body");
    checkCategoryNameFree(tx, input.bookId, input.name);
    const row = tx
      .insert(moneyCategories)
      .values({ ...input, sortOrder: nextSortOrder(tx, moneyCategories) })
      .returning()
      .get();
    return categoryJson(row, 0);
  });
}

export function updateCategory(db: Db, id: number, patch: CategoryUpdate): CategoryJson {
  return db.transaction((tx) => {
    const current = requireCategory(tx, id);
    if (patch.name !== undefined) checkCategoryNameFree(tx, current.bookId, patch.name, id);
    const row = tx
      .update(moneyCategories)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(moneyCategories.id, id))
      .returning()
      .get();
    return oneCategory(tx, row);
  });
}

export function deleteCategory(db: Db, id: number): void {
  db.transaction((tx) => {
    const row = requireCategory(tx, id);
    if (oneCategory(tx, row).transactionCount > 0) {
      throw conflict("Transactions use this category. Archive it instead to keep them sorted.");
    }
    const rules = tx
      .select({ n: count() })
      .from(moneyRules)
      .where(eq(moneyRules.categoryId, id))
      .get();
    if ((rules?.n ?? 0) > 0) {
      throw conflict("A rule uses this category. Delete the rule first, or archive the category.");
    }
    // An unused category's budgets mean nothing without it.
    tx.delete(moneyBudgets).where(eq(moneyBudgets.categoryId, id)).run();
    tx.delete(moneyCategories).where(eq(moneyCategories.id, id)).run();
  });
}

// Transactions

export function transactionsJson(db: Queryable, rows: TransactionRow[]): TransactionJson[] {
  if (rows.length === 0) return [];
  const peerIds = rows.flatMap((row) => (row.transferPeerId === null ? [] : [row.transferPeerId]));
  const peers = new Map(
    peerIds.length === 0
      ? []
      : db
          .select({ id: moneyTransactions.id, accountId: moneyTransactions.accountId })
          .from(moneyTransactions)
          .where(inArray(moneyTransactions.id, peerIds))
          .all()
          .map((row) => [row.id, row.accountId]),
  );
  const accountIds = [...new Set([...rows.map((row) => row.accountId), ...peers.values()])];
  const categoryIds = [
    ...new Set(rows.flatMap((row) => (row.categoryId === null ? [] : [row.categoryId]))),
  ];
  const accounts = new Map(
    db
      .select({ id: moneyAccounts.id, name: moneyAccounts.name })
      .from(moneyAccounts)
      .where(inArray(moneyAccounts.id, accountIds))
      .all()
      .map((row) => [row.id, row]),
  );
  const categories = new Map(
    categoryIds.length === 0
      ? []
      : db
          .select({
            id: moneyCategories.id,
            name: moneyCategories.name,
            kind: moneyCategories.kind,
          })
          .from(moneyCategories)
          .where(inArray(moneyCategories.id, categoryIds))
          .all()
          .map((row) => [row.id, row]),
  );
  const items = transactionItems(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    account: accounts.get(row.accountId) ?? { id: row.accountId, name: "" },
    date: row.date,
    amountCents: row.amountCents,
    payee: row.payee,
    memo: row.memo,
    category: row.categoryId === null ? null : (categories.get(row.categoryId) ?? null),
    transfer: transferJson(row.transferPeerId, peers, accounts),
    resaleItems: items.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function transferJson(
  peerId: number | null,
  peers: Map<number, number>,
  accounts: Map<number, { id: number; name: string }>,
): TransactionJson["transfer"] {
  if (peerId === null) return null;
  const accountId = peers.get(peerId);
  if (accountId === undefined) return null;
  return {
    transactionId: peerId,
    account: accounts.get(accountId) ?? { id: accountId, name: "" },
  };
}

export function oneTransaction(db: Queryable, row: TransactionRow): TransactionJson {
  const [transaction] = transactionsJson(db, [row]);
  if (!transaction) throw new Error("Expected one transaction");
  return transaction;
}

/** Escapes LIKE wildcards so a search for "50%" finds "50%", not everything. */
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** A book's transactions, newest first, with totals across every page. */
export function listTransactions(db: Queryable, query: TransactionQuery): TransactionPage {
  requireBook(db, query.bookId);
  const conditions: SQL[] = [eq(moneyAccounts.bookId, query.bookId)];
  if (query.accountId !== undefined) {
    conditions.push(eq(moneyTransactions.accountId, query.accountId));
  }
  if (query.categoryId === "none") {
    conditions.push(isNull(moneyTransactions.categoryId), isNull(moneyTransactions.transferPeerId));
  } else if (query.categoryId === "transfer") {
    conditions.push(isNotNull(moneyTransactions.transferPeerId));
  } else if (query.categoryId !== undefined) {
    conditions.push(eq(moneyTransactions.categoryId, query.categoryId));
  }
  if (query.from) conditions.push(gte(moneyTransactions.date, query.from));
  if (query.to) conditions.push(lte(moneyTransactions.date, query.to));
  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(
      sql`(${moneyTransactions.payee} like ${pattern} escape '\\' or ${moneyTransactions.memo} like ${pattern} escape '\\')`,
    );
  }
  const where = and(...conditions);

  const totals = db
    .select({
      n: count(),
      inCents: sql<number>`coalesce(sum(case when ${moneyTransactions.transferPeerId} is null and ${moneyTransactions.amountCents} > 0 then ${moneyTransactions.amountCents} end), 0)`,
      outCents: sql<number>`coalesce(sum(case when ${moneyTransactions.transferPeerId} is null and ${moneyTransactions.amountCents} < 0 then ${moneyTransactions.amountCents} end), 0)`,
      transfers: sql<number>`count(${moneyTransactions.transferPeerId})`,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(where)
    .get();
  const rows = db
    .select({ transaction: moneyTransactions })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(where)
    .orderBy(desc(moneyTransactions.date), desc(moneyTransactions.id))
    .limit(query.limit)
    .offset(query.offset)
    .all()
    .map((row) => row.transaction);

  return {
    transactions: transactionsJson(db, rows),
    total: totals?.n ?? 0,
    inCents: totals?.inCents ?? 0,
    outCents: totals?.outCents ?? 0,
    transferCount: totals?.transfers ?? 0,
  };
}

export function requireTransaction(db: Queryable, id: number): TransactionRow {
  const row = db.select().from(moneyTransactions).where(eq(moneyTransactions.id, id)).get();
  if (!row) throw notFound("That transaction doesn't exist. It may have been deleted.");
  return row;
}

/** A transaction's category must belong to the same book as its account. */
export function checkCategoryFits(db: Queryable, account: AccountRow, categoryId: number | null) {
  if (categoryId === null) return;
  const category = requireCategory(db, categoryId, "body");
  if (category.bookId !== account.bookId) {
    throw badRequest("That category belongs to another book. Pick one from this account's book.");
  }
}

export function createTransaction(db: Db, input: TransactionCreate): TransactionJson {
  return db.transaction((tx) => {
    const account = requireAccount(tx, input.accountId, "body");
    checkCategoryFits(tx, account, input.categoryId ?? null);
    const row = tx
      .insert(moneyTransactions)
      .values({
        accountId: input.accountId,
        date: input.date,
        amountCents: input.amountCents,
        payee: input.payee ?? "",
        memo: input.memo ?? "",
        categoryId: input.categoryId ?? null,
      })
      .returning()
      .get();
    return oneTransaction(tx, row);
  });
}

export function updateTransaction(db: Db, id: number, patch: TransactionUpdate): TransactionJson {
  return db.transaction((tx) => {
    const current = requireTransaction(tx, id);
    if (
      current.transferPeerId !== null &&
      ((patch.amountCents !== undefined && patch.amountCents !== current.amountCents) ||
        (patch.accountId !== undefined && patch.accountId !== current.accountId) ||
        (patch.categoryId !== undefined && patch.categoryId !== null))
    ) {
      throw conflict(
        "This is one side of a transfer. Unlink the transfer to change its amount, account, or category.",
      );
    }
    const accountId = patch.accountId ?? current.accountId;
    const account = requireAccount(tx, accountId, "body");
    const categoryId = patch.categoryId === undefined ? current.categoryId : patch.categoryId;
    checkCategoryFits(tx, account, categoryId);
    const row = tx
      .update(moneyTransactions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(moneyTransactions.id, id))
      .returning()
      .get();
    return oneTransaction(tx, row);
  });
}

/** Deletes a transaction. A transfer is one movement of money, so both sides go. */
export function deleteTransaction(db: Db, id: number): void {
  db.transaction((tx) => {
    const row = requireTransaction(tx, id);
    const ids = row.transferPeerId === null ? [id] : [id, row.transferPeerId];
    tx.delete(moneyTransactions).where(inArray(moneyTransactions.id, ids)).run();
  });
}
