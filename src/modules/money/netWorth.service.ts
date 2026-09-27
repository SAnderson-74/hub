import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import type { AccountKind } from "../../shared/books";
import { monthBounds, monthOf, shiftMonth } from "../../shared/budget";
import type { NetWorthPoint } from "../../shared/netWorth";
import { requireBook } from "./money.service";
import { moneyAccounts, moneyBalanceSnapshots, moneyBooks, moneyTransactions } from "./schema";

export type NetWorthAccountJson = {
  id: number;
  name: string;
  kind: AccountKind;
  bookName: string;
  archived: boolean;
  balanceCents: number;
};

export type NetWorthJson = {
  /** One per month, oldest first, ending with today. Starts with the first month that has data. */
  points: NetWorthPoint[];
  /** Accounts with a balance today, for the breakdown. */
  accounts: NetWorthAccountJson[];
  accountCount: number;
};

/** One account's history, for working out its balance on any day. */
type Ledger = {
  openingCents: number;
  /** Days with transactions, oldest first, and the running total through each. */
  days: string[];
  running: number[];
  /** Entered balances, oldest first. */
  snapshots: Array<{ date: string; balanceCents: number }>;
};

/** The sum of transactions on or before a day; every transaction for null. */
function totalThrough(ledger: Ledger, day: string | null): number {
  if (day === null) return ledger.running.at(-1) ?? 0;
  let low = 0;
  let high = ledger.days.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((ledger.days[mid] ?? "") <= day) low = mid + 1;
    else high = mid;
  }
  return low === 0 ? 0 : (ledger.running[low - 1] ?? 0);
}

/**
 * An account's balance at the end of a day, by the same rule as its current balance:
 * the latest entered balance on or before the day plus transactions after it, or the
 * opening balance plus every transaction so far. null means now, with everything.
 *
 * Before the first entered balance of an account kept only by entered balances (no
 * transactions before it), that first balance stands in. Otherwise entering a first
 * statement would look like the whole balance arrived that month.
 */
function balanceOn(ledger: Ledger, day: string | null): number {
  let snapshot: Ledger["snapshots"][number] | null = null;
  for (const entry of ledger.snapshots) {
    if (day !== null && entry.date > day) break;
    snapshot = entry;
  }
  if (!snapshot) {
    const first = ledger.snapshots[0];
    const firstDay = ledger.days[0];
    if (first && (firstDay === undefined || firstDay > first.date)) return first.balanceCents;
    return ledger.openingCents + totalThrough(ledger, day);
  }
  return snapshot.balanceCents + totalThrough(ledger, day) - totalThrough(ledger, snapshot.date);
}

/**
 * Net worth at the end of each month up to today, across every open book or one book.
 * Archived accounts count, since their past balances were real.
 */
export function netWorth(
  db: Queryable,
  { to, months, bookId }: { to: string; months: number; bookId?: number | undefined },
): NetWorthJson {
  if (bookId !== undefined) requireBook(db, bookId);
  const accounts = db
    .select({
      id: moneyAccounts.id,
      name: moneyAccounts.name,
      kind: moneyAccounts.kind,
      archived: moneyAccounts.archived,
      openingBalanceCents: moneyAccounts.openingBalanceCents,
      bookName: moneyBooks.name,
    })
    .from(moneyAccounts)
    .innerJoin(moneyBooks, eq(moneyAccounts.bookId, moneyBooks.id))
    .where(bookId === undefined ? eq(moneyBooks.archived, false) : eq(moneyAccounts.bookId, bookId))
    .orderBy(
      asc(moneyBooks.sortOrder),
      asc(moneyBooks.id),
      asc(moneyAccounts.archived),
      asc(moneyAccounts.sortOrder),
      asc(moneyAccounts.id),
    )
    .all();

  const ledgers = new Map<number, Ledger>(
    accounts.map((account) => [
      account.id,
      { openingCents: account.openingBalanceCents, days: [], running: [], snapshots: [] },
    ]),
  );
  const ids = [...ledgers.keys()];
  // The first day with a transaction or an entered balance.
  let earliest: string | null = null;

  if (ids.length > 0) {
    const days = db
      .select({
        accountId: moneyTransactions.accountId,
        date: moneyTransactions.date,
        total: sql<number>`sum(${moneyTransactions.amountCents})`,
      })
      .from(moneyTransactions)
      .where(inArray(moneyTransactions.accountId, ids))
      .groupBy(moneyTransactions.accountId, moneyTransactions.date)
      .orderBy(asc(moneyTransactions.accountId), asc(moneyTransactions.date))
      .all();
    for (const row of days) {
      const ledger = ledgers.get(row.accountId);
      if (!ledger) continue;
      ledger.days.push(row.date);
      ledger.running.push((ledger.running.at(-1) ?? 0) + row.total);
      if (earliest === null || row.date < earliest) earliest = row.date;
    }
    const snapshots = db
      .select({
        accountId: moneyBalanceSnapshots.accountId,
        date: moneyBalanceSnapshots.date,
        balanceCents: moneyBalanceSnapshots.balanceCents,
      })
      .from(moneyBalanceSnapshots)
      .where(inArray(moneyBalanceSnapshots.accountId, ids))
      .orderBy(asc(moneyBalanceSnapshots.date))
      .all();
    for (const row of snapshots) {
      ledgers.get(row.accountId)?.snapshots.push(row);
      if (earliest === null || row.date < earliest) earliest = row.date;
    }
  }

  // Start at the range's first month, or the first month with any data if later.
  const current = monthOf(to);
  const rangeStart = shiftMonth(current, -(months - 1));
  const dataStart = earliest === null ? current : monthOf(earliest);
  let month = dataStart > rangeStart ? dataStart : rangeStart;
  if (month > current) month = current;

  const points: NetWorthPoint[] = [];
  for (; month <= current; month = shiftMonth(month, 1)) {
    // Today's point counts every transaction, so it matches the balances on the Money page.
    const day = month === current ? null : monthBounds(month).to;
    let assetsCents = 0;
    let debtsCents = 0;
    for (const ledger of ledgers.values()) {
      const balance = balanceOn(ledger, day);
      if (balance >= 0) assetsCents += balance;
      else debtsCents -= balance;
    }
    points.push({
      month,
      date: day ?? to,
      assetsCents,
      debtsCents,
      netCents: assetsCents - debtsCents,
    });
  }

  return {
    points,
    accounts: accounts
      .map((account) => {
        const ledger = ledgers.get(account.id);
        return {
          id: account.id,
          name: account.name,
          kind: account.kind,
          bookName: account.bookName,
          archived: account.archived,
          balanceCents: ledger ? balanceOn(ledger, null) : 0,
        };
      })
      .filter((account) => account.balanceCents !== 0),
    accountCount: accounts.length,
  };
}
