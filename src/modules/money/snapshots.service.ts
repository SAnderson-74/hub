import { desc, eq } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { notFound } from "../../server/errors";
import type { SnapshotSave } from "../../shared/books";
import { type AccountJson, accountsById, requireAccount } from "./money.service";
import { moneyBalanceSnapshots } from "./schema";

export type SnapshotJson = { id: number; date: string; balanceCents: number; note: string };

export type AccountHistoryJson = { account: AccountJson; snapshots: SnapshotJson[] };

/** An account's balance snapshots, newest first, with the account's current balance. */
export function accountHistory(db: Queryable, accountId: number): AccountHistoryJson {
  requireAccount(db, accountId);
  const account = accountsById(db, [accountId]).get(accountId);
  if (!account) throw new Error("Expected the account");
  const snapshots = db
    .select()
    .from(moneyBalanceSnapshots)
    .where(eq(moneyBalanceSnapshots.accountId, accountId))
    .orderBy(desc(moneyBalanceSnapshots.date))
    .all()
    .map((row) => ({
      id: row.id,
      date: row.date,
      balanceCents: row.balanceCents,
      note: row.note,
    }));
  return { account, snapshots };
}

/** Records an account's balance on a day, replacing one already entered for that day. */
export function saveSnapshot(db: Db, accountId: number, input: SnapshotSave): AccountHistoryJson {
  return db.transaction((tx) => {
    requireAccount(tx, accountId);
    tx.insert(moneyBalanceSnapshots)
      .values({
        accountId,
        date: input.date,
        balanceCents: input.balanceCents,
        note: input.note ?? "",
      })
      .onConflictDoUpdate({
        target: [moneyBalanceSnapshots.accountId, moneyBalanceSnapshots.date],
        set: { balanceCents: input.balanceCents, note: input.note ?? "", updatedAt: new Date() },
      })
      .run();
    return accountHistory(tx, accountId);
  });
}

export function deleteSnapshot(db: Db, id: number): AccountHistoryJson {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(moneyBalanceSnapshots)
      .where(eq(moneyBalanceSnapshots.id, id))
      .get();
    if (!row) throw notFound("That balance entry doesn't exist. It may have been deleted.");
    tx.delete(moneyBalanceSnapshots).where(eq(moneyBalanceSnapshots.id, id)).run();
    return accountHistory(tx, row.accountId);
  });
}
