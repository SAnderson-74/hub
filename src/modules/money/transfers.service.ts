import { and, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict } from "../../server/errors";
import type { TransferCreate } from "../../shared/books";
import { findTransferPairs, TRANSFER_WINDOW_DAYS } from "../../shared/moneyRules";
import {
  oneTransaction,
  requireAccount,
  requireBook,
  requireTransaction,
  type TransactionJson,
  transactionsJson,
} from "./money.service";
import { moneyAccounts, moneyTransactions } from "./schema";

export type TransferJson = { from: TransactionJson; to: TransactionJson };

function pairJson(db: Queryable, outId: number, inId: number): TransferJson {
  return {
    from: oneTransaction(db, requireTransaction(db, outId)),
    to: oneTransaction(db, requireTransaction(db, inId)),
  };
}

/** Moves money between two accounts: one transaction leaving, one arriving, linked. */
export function createTransfer(db: Db, input: TransferCreate): TransferJson {
  return db.transaction((tx) => {
    const from = requireAccount(tx, input.fromAccountId, "body");
    const to = requireAccount(tx, input.toAccountId, "body");
    const memo = input.memo ?? "";
    const out = tx
      .insert(moneyTransactions)
      .values({
        accountId: from.id,
        date: input.date,
        amountCents: -input.amountCents,
        payee: `Transfer to ${to.name}`,
        memo,
      })
      .returning()
      .get();
    const into = tx
      .insert(moneyTransactions)
      .values({
        accountId: to.id,
        date: input.date,
        amountCents: input.amountCents,
        payee: `Transfer from ${from.name}`,
        memo,
        transferPeerId: out.id,
      })
      .returning()
      .get();
    tx.update(moneyTransactions)
      .set({ transferPeerId: into.id })
      .where(eq(moneyTransactions.id, out.id))
      .run();
    return pairJson(tx, out.id, into.id);
  });
}

/**
 * Joins two existing transactions (usually both imported) as the sides of one
 * transfer: the same amount leaving one account and arriving in another. Their
 * categories and cards are cleared, since a transfer is neither spending nor income.
 */
export function linkTransfer(db: Db, ids: [number, number]): TransferJson {
  return db.transaction((tx) => {
    const [a, b] = ids.map((id) => requireTransaction(tx, id)) as [
      ReturnType<typeof requireTransaction>,
      ReturnType<typeof requireTransaction>,
    ];
    if (a.id === b.id || a.accountId === b.accountId) {
      throw badRequest("A transfer needs one transaction in each of two different accounts.");
    }
    if (a.amountCents !== -b.amountCents) {
      throw badRequest("The two sides of a transfer need the same amount, one out and one in.");
    }
    if (a.transferPeerId !== null || b.transferPeerId !== null) {
      throw conflict("One of these is already part of a transfer. Unlink it first.");
    }
    const now = new Date();
    for (const [row, peer] of [
      [a, b],
      [b, a],
    ] as const) {
      tx.update(moneyTransactions)
        .set({ transferPeerId: peer.id, categoryId: null, cardId: null, updatedAt: now })
        .where(eq(moneyTransactions.id, row.id))
        .run();
    }
    const [out, into] = a.amountCents < 0 ? [a, b] : [b, a];
    return pairJson(tx, out.id, into.id);
  });
}

/** Turns a transfer back into two ordinary transactions, both kept. */
export function unlinkTransfer(db: Db, id: number): TransactionJson {
  return db.transaction((tx) => {
    const row = requireTransaction(tx, id);
    if (row.transferPeerId === null) throw badRequest("That transaction isn't a transfer.");
    tx.update(moneyTransactions)
      .set({ transferPeerId: null, updatedAt: new Date() })
      .where(inArray(moneyTransactions.id, [row.id, row.transferPeerId]))
      .run();
    return oneTransaction(tx, requireTransaction(tx, id));
  });
}

/**
 * Pairs in a book that look like transfers: uncategorized, not yet linked, the same
 * amount out of one account and into another within a few days. Giving either one
 * a category takes the pair off the list.
 */
export function transferSuggestions(db: Queryable, bookId: number): TransferJson[] {
  requireBook(db, bookId);
  const rows = db
    .select({ transaction: moneyTransactions })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        isNull(moneyTransactions.categoryId),
        isNull(moneyTransactions.transferPeerId),
      ),
    )
    .all()
    .map((row) => row.transaction);
  const pairs = findTransferPairs(rows);
  const json = new Map(
    transactionsJson(db, pairs.flat()).map((transaction) => [transaction.id, transaction]),
  );
  return pairs.flatMap(([out, into]) => {
    const from = json.get(out.id);
    const to = json.get(into.id);
    return from && to ? [{ from, to }] : [];
  });
}

const shiftDate = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

/**
 * Transactions that could be the other side of this one: the opposite amount in
 * another account (any book), not already a transfer, within a few days.
 */
export function transferMatches(db: Queryable, id: number): TransactionJson[] {
  const row = requireTransaction(db, id);
  if (row.transferPeerId !== null) return [];
  const rows = db
    .select()
    .from(moneyTransactions)
    .where(
      and(
        ne(moneyTransactions.accountId, row.accountId),
        eq(moneyTransactions.amountCents, -row.amountCents),
        isNull(moneyTransactions.transferPeerId),
        gte(moneyTransactions.date, shiftDate(row.date, -TRANSFER_WINDOW_DAYS)),
        lte(moneyTransactions.date, shiftDate(row.date, TRANSFER_WINDOW_DAYS)),
      ),
    )
    .orderBy(desc(moneyTransactions.date))
    .limit(10)
    .all();
  return transactionsJson(db, rows);
}
