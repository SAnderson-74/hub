import { eq, inArray, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { moneyTransactionSplits, moneyTransactions } from "./schema";

// A transaction's category lines: its parts when it's split, otherwise itself. Queries
// that add up money by category left-join the parts with `splitJoin` and read the
// category and amount through these, so a split charge counts in each part's category.

export const splitJoin = eq(moneyTransactionSplits.transactionId, moneyTransactions.id);

export const lineCategoryId = sql<
  number | null
>`case when ${moneyTransactionSplits.id} is null then ${moneyTransactions.categoryId} else ${moneyTransactionSplits.categoryId} end`;

export const lineAmountCents = sql<number>`case when ${moneyTransactionSplits.id} is null then ${moneyTransactions.amountCents} else ${moneyTransactionSplits.amountCents} end`;

export type SplitRow = typeof moneyTransactionSplits.$inferSelect;

/** Transactions' parts by transaction id, in order. */
export function splitsOf(db: Queryable, transactionIds: number[]): Map<number, SplitRow[]> {
  const parts = new Map<number, SplitRow[]>();
  if (transactionIds.length === 0) return parts;
  const rows = db
    .select()
    .from(moneyTransactionSplits)
    .where(inArray(moneyTransactionSplits.transactionId, transactionIds))
    .orderBy(moneyTransactionSplits.sortOrder, moneyTransactionSplits.id)
    .all();
  for (const row of rows) {
    parts.set(row.transactionId, [...(parts.get(row.transactionId) ?? []), row]);
  }
  return parts;
}

/** Removes transactions' parts, for when they stop being split or are deleted. */
export function dropSplits(db: Queryable, transactionIds: number[]): void {
  if (transactionIds.length === 0) return;
  for (let start = 0; start < transactionIds.length; start += 500) {
    db.delete(moneyTransactionSplits)
      .where(
        inArray(moneyTransactionSplits.transactionId, transactionIds.slice(start, start + 500)),
      )
      .run();
  }
}

/** The category a split transaction shows as: its largest part's. */
export function primaryCategory(parts: ReadonlyArray<{ categoryId: number; amountCents: number }>) {
  const largest = [...parts].sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))[0];
  return largest?.categoryId ?? null;
}
