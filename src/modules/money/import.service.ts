import { and, count, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { conflict, notFound } from "../../server/errors";
import type {
  BankImportResult,
  BankLayout,
  BankTransaction,
  StatementBalance,
} from "../../shared/bankImport";
import { guessCard } from "../../shared/cards";
import { matchRule } from "../../shared/moneyRules";
import { findPerson, memoWithPerson } from "../../shared/payees";
import { cardsOfAccount } from "./cards.service";
import { dropSplits } from "./lines";
import { requireAccount } from "./money.service";
import { rulesForBook } from "./rules.service";
import {
  moneyAccounts,
  moneyBalanceSnapshots,
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
  statementBalance?: StatementBalance | undefined;
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

/** The bank's id with the amount: some banks reuse ids, but not for the same amount. */
const idKey = (externalId: string, amountCents: number) => `${externalId}|${amountCents}`;

/**
 * Adds a file's transactions to an account, skipping ones already there. A
 * transaction with the bank's id is a duplicate when the account has one with that
 * id and amount not already claimed by another row, or matches one entered without
 * an id. Without an id, it's a duplicate when the account has a match (same day,
 * amount, and payee) not already claimed. Either way, two identical rows in one file
 * both import the first time and are both skipped the next. Some banks give
 * different transactions the same id, so an id alone never makes a duplicate. A dry
 * run says what would happen and changes nothing.
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
        bankPayee: moneyTransactions.bankPayee,
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
    const knownIds = tally(
      tx
        .select({
          externalId: moneyTransactions.externalId,
          amountCents: moneyTransactions.amountCents,
        })
        .from(moneyTransactions)
        .where(
          and(eq(moneyTransactions.accountId, account.id), isNotNull(moneyTransactions.externalId)),
        )
        .all()
        .map((row) => idKey(row.externalId ?? "", row.amountCents)),
    );
    // A stored transaction matches by the bank's own payee when it has one, so renaming
    // it since doesn't make the same row import again.
    const storedKey = (row: (typeof nearby)[number]) =>
      matchKey({ ...row, payee: row.bankPayee ?? row.payee });
    const anyMatch = tally(nearby.map(storedKey));
    const matchWithoutId = tally(nearby.filter((row) => row.externalId === null).map(storedKey));

    const categories = new Map(
      tx
        .select({ id: moneyCategories.id, name: moneyCategories.name })
        .from(moneyCategories)
        .where(eq(moneyCategories.bookId, account.bookId))
        .all()
        .map((row) => [row.name.trim().toLowerCase(), row.id]),
    );
    const unknownCategories = new Map<string, string>();
    const rules = rulesForBook(tx, account.bookId);
    const cards = cardsOfAccount(tx, account.id);
    let categorizedByRules = 0;

    const rows: BankImportResult["rows"] = [];
    const toCreate: Array<typeof moneyTransactions.$inferInsert> = [];
    input.transactions.forEach((row, index) => {
      // Payment apps: who it was with goes in the memo, and rules can look for them.
      const person = findPerson(row.payee, row.memo, row.amountCents);
      const rule = matchRule(rules, { ...row, counterparty: person?.name ?? null });
      // An earlier import may have stored the rule's cleaner payee, so match either.
      const keys = [matchKey(row)];
      if (rule?.renameTo) keys.push(matchKey({ ...row, payee: rule.renameTo }));
      const duplicate = row.externalId
        ? take(knownIds, idKey(row.externalId, row.amountCents)) ||
          keys.some((key) => take(matchWithoutId, key))
        : keys.some((key) => take(anyMatch, key));
      const categoryName = row.category?.trim() ?? "";
      const fileCategory = categoryName
        ? (categories.get(categoryName.toLowerCase()) ?? null)
        : null;
      // The file's own category wins; rules fill in the rest.
      const byRule = fileCategory === null && rule !== null && !duplicate;
      const payee = (byRule && rule?.renameTo ? rule.renameTo : row.payee).trim();
      rows.push({
        row: index + 1,
        date: row.date,
        amountCents: row.amountCents,
        payee,
        outcome: duplicate ? "duplicate" : "create",
      });
      if (duplicate) return;

      if (categoryName && fileCategory === null) {
        unknownCategories.set(categoryName.toLowerCase(), categoryName);
      }
      if (byRule) categorizedByRules += 1;
      const categoryId = fileCategory ?? (byRule ? (rule?.categoryId ?? null) : null);
      toCreate.push({
        accountId: account.id,
        date: row.date,
        amountCents: row.amountCents,
        payee,
        memo: person ? memoWithPerson(row.memo, person) : row.memo,
        categoryId,
        externalId: row.externalId ?? null,
        bankPayee: row.payee.trim(),
        counterparty: person?.name ?? null,
        cardId: guessCard(account.kind, cards, row),
      });
    });

    const statement = input.statementBalance;
    const result: BankImportResult = {
      importId: null,
      created: toCreate.length,
      duplicates: rows.length - toCreate.length,
      unknownCategories: [...unknownCategories.values()].sort(),
      categorizedByRules,
      rows,
      balanceCheck: statement
        ? {
            date: statement.date,
            bankCents: statement.balanceCents,
            hubCents: balanceThrough(tx, account, statement.date, toCreate),
          }
        : null,
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

/**
 * The account's balance at the end of a day, by the usual rule: the latest entered
 * balance on or before it plus later transactions, or the opening balance plus
 * transactions so far. `adding` counts rows about to be imported.
 */
function balanceThrough(
  tx: Queryable,
  account: { id: number; openingBalanceCents: number },
  date: string,
  adding: ReadonlyArray<{ date: string; amountCents: number }>,
): number {
  const snapshot = tx
    .select({ date: moneyBalanceSnapshots.date, balanceCents: moneyBalanceSnapshots.balanceCents })
    .from(moneyBalanceSnapshots)
    .where(
      and(eq(moneyBalanceSnapshots.accountId, account.id), lte(moneyBalanceSnapshots.date, date)),
    )
    .orderBy(desc(moneyBalanceSnapshots.date))
    .get();
  const counts = (day: string) => day <= date && (!snapshot || day > snapshot.date);
  const stored = tx
    .select({ date: moneyTransactions.date, amountCents: moneyTransactions.amountCents })
    .from(moneyTransactions)
    .where(and(eq(moneyTransactions.accountId, account.id), lte(moneyTransactions.date, date)))
    .all();
  const sum = [...stored, ...adding]
    .filter((row) => counts(row.date))
    .reduce((total, row) => total + row.amountCents, 0);
  return (snapshot ? snapshot.balanceCents : account.openingBalanceCents) + sum;
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
    // A transfer linked to one of these keeps its other side, as an ordinary transaction.
    const removing = tx
      .select({ id: moneyTransactions.id })
      .from(moneyTransactions)
      .where(eq(moneyTransactions.importId, id))
      .all()
      .map((entry) => entry.id);
    if (removing.length > 0) {
      tx.update(moneyTransactions)
        .set({ transferPeerId: null })
        .where(inArray(moneyTransactions.transferPeerId, removing))
        .run();
    }
    dropSplits(tx, removing);
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
