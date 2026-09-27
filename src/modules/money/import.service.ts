import { and, count, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { conflict, notFound } from "../../server/errors";
import type { BankImportResult, BankLayout, BankTransaction } from "../../shared/bankImport";
import { requireAccount } from "./money.service";
import {
  moneyAccounts,
  moneyCategories,
  moneyImportLayouts,
  moneyImports,
  moneyTransactions,
} from "./schema";

type ImportRow = typeof moneyImports.$inferSelect;

export type ImportJson = {
  id: number;
  account: { id: number; name: string };
  source: "csv" | "ofx";
  fileName: string;
  created: number;
  duplicates: number;
  /** Transactions from this import still in Hub. Deleting one by hand lowers it. */
  remaining: number;
  createdAt: string;
  undoneAt: string | null;
};

export type LayoutJson = BankLayout & { accountId: number | null };

export type ImportInput = {
  accountId: number;
  source: "csv" | "ofx";
  fileName: string;
  transactions: BankTransaction[];
  layout?: BankLayout;
};

/** Same day, same amount, and the same payee ignoring case and spacing. */
const matchKey = (row: { date: string; amountCents: number; payee: string }) =>
  `${row.date}|${row.amountCents}|${row.payee.trim().toLowerCase().replace(/\s+/g, " ")}`;

const take = (counts: Map<string, number>, key: string): boolean => {
  const left = counts.get(key) ?? 0;
  if (left === 0) return false;
  counts.set(key, left - 1);
  return true;
};

const tally = (keys: string[]) => {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
};

/**
 * Adds a file's transactions to an account, skipping ones already there. A
 * transaction with the bank's id is a duplicate when the account has that id, or
 * matches one entered without an id. Without an id, it's a duplicate when the
 * account has a match (same day, amount, and payee) not already claimed by another
 * row, so two identical coffees on one day both import once. A dry run says what
 * would happen and changes nothing.
 */
export function importBankFile(db: Db, input: ImportInput, dryRun: boolean): BankImportResult {
  return db.transaction((tx) => {
    const account = requireAccount(tx, input.accountId, "body");
    const dates = input.transactions.map((row) => row.date).sort();
    const first = dates[0] ?? "";
    const last = dates.at(-1) ?? "";
    const nearby = tx
      .select({
        date: moneyTransactions.date,
        amountCents: moneyTransactions.amountCents,
        payee: moneyTransactions.payee,
        externalId: moneyTransactions.externalId,
      })
      .from(moneyTransactions)
      .where(
        and(
          eq(moneyTransactions.accountId, account.id),
          gte(moneyTransactions.date, first),
          lte(moneyTransactions.date, last),
        ),
      )
      .all();
    const knownIds = new Set(
      tx
        .select({ externalId: moneyTransactions.externalId })
        .from(moneyTransactions)
        .where(
          and(eq(moneyTransactions.accountId, account.id), isNotNull(moneyTransactions.externalId)),
        )
        .all()
        .map((row) => row.externalId),
    );
    const anyMatch = tally(nearby.map(matchKey));
    const matchWithoutId = tally(nearby.filter((row) => row.externalId === null).map(matchKey));

    const categories = new Map(
      tx
        .select({ id: moneyCategories.id, name: moneyCategories.name })
        .from(moneyCategories)
        .where(eq(moneyCategories.bookId, account.bookId))
        .all()
        .map((row) => [row.name.trim().toLowerCase(), row.id]),
    );
    const unknownCategories = new Map<string, string>();

    const rows: BankImportResult["rows"] = [];
    const toCreate: Array<typeof moneyTransactions.$inferInsert> = [];
    input.transactions.forEach((row, index) => {
      const key = matchKey(row);
      const duplicate = row.externalId
        ? knownIds.has(row.externalId) || take(matchWithoutId, key)
        : take(anyMatch, key);
      if (row.externalId) knownIds.add(row.externalId);
      rows.push({
        row: index + 1,
        date: row.date,
        amountCents: row.amountCents,
        payee: row.payee,
        outcome: duplicate ? "duplicate" : "create",
      });
      if (duplicate) return;

      const categoryName = row.category?.trim() ?? "";
      const categoryId = categoryName ? (categories.get(categoryName.toLowerCase()) ?? null) : null;
      if (categoryName && categoryId === null) {
        unknownCategories.set(categoryName.toLowerCase(), categoryName);
      }
      toCreate.push({
        accountId: account.id,
        date: row.date,
        amountCents: row.amountCents,
        payee: row.payee.trim(),
        memo: row.memo,
        categoryId,
        externalId: row.externalId ?? null,
      });
    });

    const result: BankImportResult = {
      importId: null,
      created: toCreate.length,
      duplicates: rows.length - toCreate.length,
      unknownCategories: [...unknownCategories.values()].sort(),
      rows,
    };
    if (dryRun) return result;

    const record = tx
      .insert(moneyImports)
      .values({
        accountId: account.id,
        source: input.source,
        fileName: input.fileName,
        created: result.created,
        duplicates: result.duplicates,
      })
      .returning()
      .get();
    // In batches, to stay under SQLite's limit on values in one statement.
    for (let start = 0; start < toCreate.length; start += 500) {
      tx.insert(moneyTransactions)
        .values(toCreate.slice(start, start + 500).map((row) => ({ ...row, importId: record.id })))
        .run();
    }
    if (input.layout) {
      const { headerKey, columns, options } = input.layout;
      tx.insert(moneyImportLayouts)
        .values({ headerKey, columns, options, accountId: account.id })
        .onConflictDoUpdate({
          target: moneyImportLayouts.headerKey,
          set: { columns, options, accountId: account.id, updatedAt: new Date() },
        })
        .run();
    }
    return { ...result, importId: record.id };
  });
}

function importsJson(db: Queryable, rows: ImportRow[]): ImportJson[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const remaining = new Map(
    db
      .select({ importId: moneyTransactions.importId, n: count() })
      .from(moneyTransactions)
      .where(inArray(moneyTransactions.importId, ids))
      .groupBy(moneyTransactions.importId)
      .all()
      .map((row) => [row.importId, row.n]),
  );
  const names = new Map(
    db
      .select({ id: moneyAccounts.id, name: moneyAccounts.name })
      .from(moneyAccounts)
      .where(
        inArray(
          moneyAccounts.id,
          rows.map((row) => row.accountId),
        ),
      )
      .all()
      .map((row) => [row.id, row.name]),
  );
  return rows.map((row) => ({
    id: row.id,
    account: { id: row.accountId, name: names.get(row.accountId) ?? "" },
    source: row.source,
    fileName: row.fileName,
    created: row.created,
    duplicates: row.duplicates,
    remaining: remaining.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
    undoneAt: row.undoneAt?.toISOString() ?? null,
  }));
}

/** A book's most recent imports, newest first. */
export function listImports(db: Queryable, bookId: number, limit = 20): ImportJson[] {
  const rows = db
    .select({ row: moneyImports })
    .from(moneyImports)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyImports.accountId))
    .where(eq(moneyAccounts.bookId, bookId))
    .orderBy(desc(moneyImports.createdAt), desc(moneyImports.id))
    .limit(limit)
    .all()
    .map((entry) => entry.row);
  return importsJson(db, rows);
}

/** Removes the transactions an import added, including any edited since. */
export function undoImport(db: Db, id: number): ImportJson {
  return db.transaction((tx) => {
    const row = tx.select().from(moneyImports).where(eq(moneyImports.id, id)).get();
    if (!row) throw notFound("That import doesn't exist.");
    if (row.undoneAt) throw conflict("That import was already undone.");
    tx.delete(moneyTransactions).where(eq(moneyTransactions.importId, id)).run();
    const undone = tx
      .update(moneyImports)
      .set({ undoneAt: new Date() })
      .where(eq(moneyImports.id, id))
      .returning()
      .get();
    const [json] = importsJson(tx, [undone]);
    if (!json) throw new Error("Expected the import");
    return json;
  });
}

/** Every saved CSV layout. There are only as many as the banks the person uses. */
export function listLayouts(db: Queryable): LayoutJson[] {
  return db
    .select()
    .from(moneyImportLayouts)
    .all()
    .map((row) => ({
      headerKey: row.headerKey,
      columns: row.columns,
      options: row.options,
      accountId: row.accountId,
    }));
}
