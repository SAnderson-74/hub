import { asc, eq, inArray } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import type { LinkRole } from "../../shared/resale";
import { moneyAccounts, moneyBooks, moneyTransactions } from "../money/schema";
import { resaleItems, resaleItemTransactions } from "./schema";

/** A money transaction as the resale side shows it. */
export type LinkedTransactionJson = {
  id: number;
  date: string;
  /** Negative for money out, as in the books. */
  amountCents: number;
  payee: string;
  memo: string;
  account: { id: number; name: string; bookId: number; bookName: string };
};

export type ItemTransactionJson = LinkedTransactionJson & { role: LinkRole };

export const transactionColumns = {
  id: moneyTransactions.id,
  date: moneyTransactions.date,
  amountCents: moneyTransactions.amountCents,
  payee: moneyTransactions.payee,
  memo: moneyTransactions.memo,
  accountId: moneyAccounts.id,
  accountName: moneyAccounts.name,
  bookId: moneyBooks.id,
  bookName: moneyBooks.name,
};

type TransactionColumns = {
  id: number;
  date: string;
  amountCents: number;
  payee: string;
  memo: string;
  accountId: number;
  accountName: string;
  bookId: number;
  bookName: string;
};

export const linkedTransactionJson = (row: TransactionColumns): LinkedTransactionJson => ({
  id: row.id,
  date: row.date,
  amountCents: row.amountCents,
  payee: row.payee,
  memo: row.memo,
  account: { id: row.accountId, name: row.accountName, bookId: row.bookId, bookName: row.bookName },
});

/** Each item's linked transactions, oldest first. */
export function itemTransactions(
  db: Queryable,
  itemIds: number[],
): Map<number, ItemTransactionJson[]> {
  const byItem = new Map<number, ItemTransactionJson[]>();
  if (itemIds.length === 0) return byItem;
  const rows = db
    .select({
      ...transactionColumns,
      itemId: resaleItemTransactions.itemId,
      role: resaleItemTransactions.role,
    })
    .from(resaleItemTransactions)
    .innerJoin(moneyTransactions, eq(moneyTransactions.id, resaleItemTransactions.transactionId))
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .innerJoin(moneyBooks, eq(moneyBooks.id, moneyAccounts.bookId))
    .where(inArray(resaleItemTransactions.itemId, itemIds))
    .orderBy(asc(moneyTransactions.date), asc(moneyTransactions.id))
    .all();
  for (const row of rows) {
    byItem.set(row.itemId, [
      ...(byItem.get(row.itemId) ?? []),
      { ...linkedTransactionJson(row), role: row.role },
    ]);
  }
  return byItem;
}

/** The resale items each transaction is linked to, for the money side. */
export function transactionItems(
  db: Queryable,
  transactionIds: number[],
): Map<number, Array<{ id: number; title: string; role: LinkRole }>> {
  const byTransaction = new Map<number, Array<{ id: number; title: string; role: LinkRole }>>();
  if (transactionIds.length === 0) return byTransaction;
  const rows = db
    .select({
      transactionId: resaleItemTransactions.transactionId,
      id: resaleItems.id,
      title: resaleItems.title,
      role: resaleItemTransactions.role,
    })
    .from(resaleItemTransactions)
    .innerJoin(resaleItems, eq(resaleItems.id, resaleItemTransactions.itemId))
    .where(inArray(resaleItemTransactions.transactionId, transactionIds))
    .orderBy(asc(resaleItemTransactions.id))
    .all();
  for (const { transactionId, ...item } of rows) {
    byTransaction.set(transactionId, [...(byTransaction.get(transactionId) ?? []), item]);
  }
  return byTransaction;
}
