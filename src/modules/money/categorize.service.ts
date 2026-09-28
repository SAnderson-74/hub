import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest } from "../../server/errors";
import { buildGroups, type CategorizeApply, type TransactionGroup } from "../../shared/categorize";
import { findPerson, memoWithPerson } from "../../shared/payees";
import { requireBook, requireCategory } from "./money.service";
import { insertRule, rulesForBook } from "./rules.service";
import { moneyAccounts, moneyCategories, moneyTransactions } from "./schema";

/** How many uncategorized transactions are grouped at once, newest first. */
const PENDING_LIMIT = 3_000;
/** How much categorized history suggestions learn from, newest first. */
const HISTORY_LIMIT = 20_000;

export type CategorizeOverview = {
  /** Uncategorized transactions, transfers aside. */
  uncategorized: number;
  groups: TransactionGroup[];
  /** Payment-app transactions whose person could be filled in. */
  peopleToFill: number;
};

const inBook = (bookId: number) =>
  and(eq(moneyAccounts.bookId, bookId), isNull(moneyTransactions.transferPeerId));

const fields = {
  id: moneyTransactions.id,
  date: moneyTransactions.date,
  amountCents: moneyTransactions.amountCents,
  payee: moneyTransactions.payee,
  memo: moneyTransactions.memo,
  counterparty: moneyTransactions.counterparty,
};

/** Payment-app transactions with no one saved yet, and who they were with. */
function peopleMissing(db: Queryable, bookId: number) {
  return db
    .select(fields)
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        inBook(bookId),
        isNull(moneyTransactions.counterparty),
        sql`(lower(${moneyTransactions.payee}) like '%venmo%' or lower(${moneyTransactions.payee}) like '%zelle%' or lower(${moneyTransactions.payee}) like '%cash%app%' or lower(${moneyTransactions.payee}) like '%apple%cash%')`,
      ),
    )
    .all()
    .flatMap((row) => {
      const person = findPerson(row.payee, row.memo, row.amountCents);
      return person ? [{ row, person }] : [];
    });
}

/** A book's uncategorized transactions in groups, with suggestions. */
export function categorizeOverview(db: Queryable, bookId: number): CategorizeOverview {
  requireBook(db, bookId);
  const pending = db
    .select(fields)
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(and(inBook(bookId), isNull(moneyTransactions.categoryId)))
    .orderBy(desc(moneyTransactions.date), desc(moneyTransactions.id))
    .all();
  const history = db
    .select({ ...fields, categoryId: moneyTransactions.categoryId })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(and(inBook(bookId), isNotNull(moneyTransactions.categoryId)))
    .orderBy(desc(moneyTransactions.date), desc(moneyTransactions.id))
    .limit(HISTORY_LIMIT)
    .all()
    .flatMap((row) => (row.categoryId === null ? [] : [{ ...row, categoryId: row.categoryId }]));
  const categories = db
    .select({
      id: moneyCategories.id,
      name: moneyCategories.name,
      kind: moneyCategories.kind,
      archived: moneyCategories.archived,
    })
    .from(moneyCategories)
    .where(eq(moneyCategories.bookId, bookId))
    .all();
  return {
    uncategorized: pending.length,
    groups: buildGroups(
      pending.slice(0, PENDING_LIMIT),
      history,
      categories,
      rulesForBook(db, bookId),
    ),
    peopleToFill: peopleMissing(db, bookId).length,
  };
}

/**
 * Puts a group of transactions in a category, maybe with a cleaner payee, and maybe
 * makes a rule so later imports do the same. Only the book's uncategorized-or-not
 * transactions that aren't transfers change; the rest are skipped.
 */
export function applyCategory(db: Db, input: CategorizeApply): { categorized: number } {
  return db.transaction((tx) => {
    requireBook(tx, input.bookId, "body");
    const category = requireCategory(tx, input.categoryId, "body");
    if (category.bookId !== input.bookId) {
      throw badRequest("That category belongs to another book. Pick one from this book.");
    }
    const rows = tx
      .select({
        id: moneyTransactions.id,
        payee: moneyTransactions.payee,
        bankPayee: moneyTransactions.bankPayee,
      })
      .from(moneyTransactions)
      .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
      .where(and(inBook(input.bookId), inArray(moneyTransactions.id, input.transactionIds)))
      .all();
    const renameTo = input.renameTo?.trim() ?? "";
    const now = new Date();
    for (const row of rows) {
      tx.update(moneyTransactions)
        .set({
          categoryId: category.id,
          ...(renameTo
            ? {
                payee: renameTo,
                // What the bank wrote, so a later import still recognizes it.
                bankPayee: row.bankPayee ?? row.payee,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(moneyTransactions.id, row.id))
        .run();
    }
    if (input.rule) {
      insertRule(tx, {
        bookId: input.bookId,
        contains: input.rule.contains,
        direction: input.rule.direction,
        categoryId: category.id,
        renameTo,
      });
    }
    return { categorized: rows.length };
  });
}

/**
 * Saves who each payment-app transaction was with, and puts it in the memo, for ones
 * imported before Hub read names or entered by hand.
 */
export function fillPeople(db: Db, bookId: number): { filled: number } {
  return db.transaction((tx) => {
    requireBook(tx, bookId, "body");
    const missing = peopleMissing(tx, bookId);
    const now = new Date();
    for (const { row, person } of missing) {
      tx.update(moneyTransactions)
        .set({
          counterparty: person.name,
          memo: memoWithPerson(row.memo, person),
          updatedAt: now,
        })
        .where(eq(moneyTransactions.id, row.id))
        .run();
    }
    return { filled: missing.length };
  });
}
