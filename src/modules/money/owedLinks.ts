import { inArray } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { moneyReimbursements } from "./schema";

// What the rest of the app needs to know about money owed back, kept apart from the
// service so transaction deletes and tithing can use it without importing it.

/** Which of these transactions are repayments of money owed back. */
export function repaymentIds(db: Queryable, transactionIds: readonly number[]): Set<number> {
  const found = new Set<number>();
  for (let start = 0; start < transactionIds.length; start += 500) {
    const batch = transactionIds.slice(start, start + 500);
    for (const row of db
      .select({ id: moneyReimbursements.repaymentId })
      .from(moneyReimbursements)
      .where(inArray(moneyReimbursements.repaymentId, batch))
      .all()) {
      if (row.id !== null) found.add(row.id);
    }
  }
  return found;
}

/** Clears claims on transactions that are going, and unmatches repayments that are. */
export function dropReimbursements(db: Queryable, transactionIds: readonly number[]): void {
  for (let start = 0; start < transactionIds.length; start += 500) {
    const batch = transactionIds.slice(start, start + 500);
    db.delete(moneyReimbursements).where(inArray(moneyReimbursements.transactionId, batch)).run();
    db.update(moneyReimbursements)
      .set({ repaymentId: null, updatedAt: new Date() })
      .where(inArray(moneyReimbursements.repaymentId, batch))
      .run();
  }
}
