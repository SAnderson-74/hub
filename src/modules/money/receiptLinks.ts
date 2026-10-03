import { and, eq, inArray } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { addDays } from "../../shared/recurrence";
import { moneyReceipts, moneyTransactions } from "./schema";

// Receipts as the rest of Money sees them: shown with their transactions, gone with
// them, and waiting for a bank file to find the transactions they added.

/** How far a bank's date can be from the receipt's: it posts a few days after. */
export const DAYS_BEFORE = 2;
export const DAYS_AFTER = 7;

export type ReceiptJson = {
  id: number;
  store: string;
  date: string;
  totalCents: number;
  type: "purchase" | "return";
  items: Array<{ name: string; amountCents: number; category: string }>;
  note: string;
  /** The receipt came first and added the transaction. */
  createdTransaction: boolean;
  /** A bank file has since found the transaction the receipt added. */
  bankMatched: boolean;
};

/** Receipts by transaction id, for showing with transactions. */
export function receiptsOf(db: Queryable, transactionIds: number[]): Map<number, ReceiptJson> {
  if (transactionIds.length === 0) return new Map();
  return new Map(
    db
      .select()
      .from(moneyReceipts)
      .where(inArray(moneyReceipts.transactionId, transactionIds))
      .all()
      .map((row) => [
        row.transactionId,
        {
          id: row.id,
          store: row.store,
          date: row.date,
          totalCents: row.totalCents,
          type: row.type,
          items: row.items,
          note: row.note,
          createdTransaction: row.createdTransaction,
          bankMatched: row.bankMatched,
        },
      ]),
  );
}

/** Removes receipts attached to transactions that are going. */
export function dropReceipts(db: Queryable, transactionIds: number[]): void {
  for (let start = 0; start < transactionIds.length; start += 500) {
    db.delete(moneyReceipts)
      .where(inArray(moneyReceipts.transactionId, transactionIds.slice(start, start + 500)))
      .run();
  }
}

/**
 * Receipts that added their own transaction and haven't been found in a bank file yet,
 * for one account: what a bank file's rows are checked against before adding them.
 */
export function waitingReceipts(db: Queryable, accountId: number) {
  return db
    .select({
      receiptId: moneyReceipts.id,
      transactionId: moneyTransactions.id,
      date: moneyTransactions.date,
      amountCents: moneyTransactions.amountCents,
    })
    .from(moneyReceipts)
    .innerJoin(moneyTransactions, eq(moneyTransactions.id, moneyReceipts.transactionId))
    .where(
      and(
        eq(moneyTransactions.accountId, accountId),
        eq(moneyReceipts.createdTransaction, true),
        eq(moneyReceipts.bankMatched, false),
      ),
    )
    .all();
}

/** Whether a bank row is the one a waiting receipt stands in for: same amount, posted a few days after. */
export function fitsReceipt(
  row: { date: string; amountCents: number },
  receipt: { date: string; amountCents: number },
): boolean {
  return (
    row.amountCents === receipt.amountCents &&
    row.date >= addDays(receipt.date, -DAYS_BEFORE) &&
    row.date <= addDays(receipt.date, DAYS_AFTER)
  );
}
