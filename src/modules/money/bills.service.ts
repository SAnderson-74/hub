import { and, eq, gte, isNull } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import {
  type BillCreate,
  type BillDismiss,
  type BillFrequency,
  type BillKind,
  type BillUpdate,
  billDates,
  frequencyOf,
  MATCH_DAYS,
  nextBillDate,
  priceChanged,
  yearlyCents,
} from "../../shared/bills";
import { findRepeats } from "../../shared/categorize";
import { payeeGroup } from "../../shared/payees";
import { addDays, daysBetween } from "../../shared/recurrence";
import { readSettings } from "../core/settings.service";
import { listAccounts, requireAccount, requireBook, requireCategory } from "./money.service";
import { moneyAccounts, moneyBills, moneyCategories, moneyTransactions } from "./schema";

type BillRow = typeof moneyBills.$inferSelect;

export type BillAlert =
  | { kind: "changed"; fromCents: number; toCents: number; date: string }
  | { kind: "missing"; expected: string };

export type BillJson = {
  id: number;
  name: string;
  kind: BillKind;
  amountCents: number;
  frequency: BillFrequency;
  /** The next date it's expected, past any payments already seen. */
  nextDate: string;
  accountId: number | null;
  accountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  matchKey: string | null;
  /** The latest payment matched to it. */
  lastSeen: { date: string; amountCents: number } | null;
  alert: BillAlert | null;
};

export type BillSuggestion = {
  matchKey: string;
  name: string;
  kind: BillKind;
  amountCents: number;
  frequency: BillFrequency;
  nextDate: string;
  accountId: number | null;
  categoryId: number | null;
  /** How many payments it was found from. */
  count: number;
};

export type BillsJson = {
  bills: BillJson[];
  suggestions: BillSuggestion[];
  /** What the book's subscriptions cost in a year. */
  subscriptionsPerYearCents: number;
  /** Bills and subscriptions in a month on average, and income. */
  monthlyOutCents: number;
  monthlyInCents: number;
};

/** How far back transactions are read for finding and matching. */
const LOOKBACK_DAYS = 400;

type Payment = { date: string; amountCents: number; accountId: number; categoryId: number | null };

/** The book's recent transactions, transfers left out, by payee group. */
function paymentsByPayee(
  db: Queryable,
  bookId: number,
  since: string,
): Map<string, { name: string; rows: Payment[] }> {
  const rows = db
    .select({
      date: moneyTransactions.date,
      amountCents: moneyTransactions.amountCents,
      payee: moneyTransactions.payee,
      memo: moneyTransactions.memo,
      counterparty: moneyTransactions.counterparty,
      accountId: moneyTransactions.accountId,
      categoryId: moneyTransactions.categoryId,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        gte(moneyTransactions.date, since),
        isNull(moneyTransactions.transferPeerId),
      ),
    )
    .all();
  const groups = new Map<string, { name: string; rows: Payment[] }>();
  for (const row of rows) {
    const group = payeeGroup(row);
    const entry = groups.get(group.key) ?? { name: group.name, rows: [] };
    entry.rows.push({
      date: row.date,
      amountCents: row.amountCents,
      accountId: row.accountId,
      categoryId: row.categoryId,
    });
    groups.set(group.key, entry);
  }
  for (const entry of groups.values()) entry.rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return groups;
}

/** The value seen most often, or null. */
function mostCommon(values: ReadonlyArray<number | null>): number | null {
  const counts = new Map<number, number>();
  for (const value of values) if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Where a bill stands today: its schedule steps past each date a matching payment
 * arrived for (within MATCH_DAYS). A matched bill whose next date has passed without
 * a payment is missing; one whose latest payment differs from its usual amount changed
 * price. Bills added by hand simply step past today.
 */
export function billState(
  bill: Pick<BillRow, "nextDate" | "frequency" | "amountCents" | "matchKey">,
  payments: readonly Payment[],
  today: string,
): { nextDate: string; lastSeen: BillJson["lastSeen"]; alert: BillAlert | null } {
  const monthDay = Number(bill.nextDate.slice(8, 10));
  const window = MATCH_DAYS[bill.frequency];
  let next = bill.nextDate;
  let lastSeen: BillJson["lastSeen"] = null;
  if (bill.matchKey === null) {
    for (let step = 0; step < 1000 && next < today; step += 1) {
      next = nextBillDate(next, bill.frequency, monthDay);
    }
    return { nextDate: next, lastSeen, alert: null };
  }
  const used = new Set<Payment>();
  for (let step = 0; step < 1000; step += 1) {
    const match = payments.find(
      (payment) => !used.has(payment) && Math.abs(daysBetween(next, payment.date)) <= window,
    );
    if (!match) break;
    used.add(match);
    lastSeen = { date: match.date, amountCents: match.amountCents };
    next = nextBillDate(next, bill.frequency, monthDay);
  }
  let alert: BillAlert | null = null;
  if (addDays(next, window) < today) alert = { kind: "missing", expected: next };
  else if (lastSeen && priceChanged(bill.amountCents, lastSeen.amountCents)) {
    alert = {
      kind: "changed",
      fromCents: bill.amountCents,
      toCents: Math.abs(lastSeen.amountCents),
      date: lastSeen.date,
    };
  }
  return { nextDate: next, lastSeen, alert };
}

/** A book's bills with where each stands, suggestions from repeating payments, and totals. */
export function listBills(db: Queryable, bookId: number, today: string): BillsJson {
  requireBook(db, bookId);
  const rows = db.select().from(moneyBills).where(eq(moneyBills.bookId, bookId)).all();
  const groups = paymentsByPayee(db, bookId, addDays(today, -LOOKBACK_DAYS));
  const names = (table: typeof moneyAccounts | typeof moneyCategories) =>
    new Map(
      db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(eq(table.bookId, bookId))
        .all()
        .map((row) => [row.id, row.name]),
    );
  const accountNames = names(moneyAccounts);
  const categoryNames = names(moneyCategories);

  const bills = rows
    .filter((row) => row.status === "active")
    .map((row): BillJson => {
      const state = billState(
        row,
        row.matchKey ? (groups.get(row.matchKey)?.rows ?? []) : [],
        today,
      );
      return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        amountCents: row.amountCents,
        frequency: row.frequency,
        nextDate: state.nextDate,
        accountId: row.accountId,
        accountName: row.accountId === null ? null : (accountNames.get(row.accountId) ?? null),
        categoryId: row.categoryId,
        categoryName: row.categoryId === null ? null : (categoryNames.get(row.categoryId) ?? null),
        matchKey: row.matchKey,
        lastSeen: state.lastSeen,
        alert: state.alert,
      };
    })
    .sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : a.id - b.id));

  const known = new Set(rows.map((row) => row.matchKey).filter((key) => key !== null));
  const suggestions: BillSuggestion[] = [];
  for (const [key, group] of groups) {
    if (known.has(key)) continue;
    const repeats = findRepeats(group.rows);
    const last = group.rows.at(-1);
    if (!repeats || !last) continue;
    const frequency = frequencyOf(repeats.every);
    const nextDate = nextBillDate(last.date, frequency);
    // One that stopped (its next payment is well overdue) isn't a bill any more.
    if (addDays(nextDate, MATCH_DAYS[frequency]) < today) continue;
    const incoming = group.rows.filter((row) => row.amountCents > 0).length * 2 > group.rows.length;
    suggestions.push({
      matchKey: key,
      name: group.name,
      kind: incoming ? "income" : "bill",
      amountCents: repeats.typicalCents,
      frequency,
      nextDate,
      accountId: mostCommon(group.rows.map((row) => row.accountId)),
      categoryId: mostCommon(group.rows.map((row) => row.categoryId)),
      count: group.rows.length,
    });
  }
  suggestions.sort((a, b) => b.amountCents - a.amountCents);

  const perMonth = (kinds: BillKind[]) =>
    Math.round(kinds.reduce((sum, kind) => sum + yearlyCents(bills, kind), 0) / 12);
  return {
    bills,
    suggestions,
    subscriptionsPerYearCents: yearlyCents(bills, "subscription"),
    monthlyOutCents: perMonth(["bill", "subscription"]),
    monthlyInCents: perMonth(["income"]),
  };
}

function requireBill(db: Queryable, id: number): BillRow {
  const row = db.select().from(moneyBills).where(eq(moneyBills.id, id)).get();
  if (row?.status !== "active") {
    throw notFound("That bill doesn't exist. It may have been deleted.");
  }
  return row;
}

/** The account and category have to be in the bill's book. */
function checkLinks(
  db: Queryable,
  bookId: number,
  accountId?: number | null,
  categoryId?: number | null,
) {
  if (accountId != null && requireAccount(db, accountId, "body").bookId !== bookId) {
    throw badRequest("That account is in another book. Pick one from this book.");
  }
  if (categoryId != null && requireCategory(db, categoryId, "body").bookId !== bookId) {
    throw badRequest("That category is in another book. Pick one from this book.");
  }
}

export function createBill(db: Queryable, input: BillCreate, today: string): BillJson {
  requireBook(db, input.bookId, "body");
  checkLinks(db, input.bookId, input.accountId, input.categoryId);
  const now = new Date();
  // Confirming a suggestion replaces an earlier "not a bill" for the same payee.
  if (input.matchKey) {
    db.delete(moneyBills)
      .where(
        and(
          eq(moneyBills.bookId, input.bookId),
          eq(moneyBills.matchKey, input.matchKey),
          eq(moneyBills.status, "dismissed"),
        ),
      )
      .run();
  }
  const row = db
    .insert(moneyBills)
    .values({
      bookId: input.bookId,
      name: input.name,
      kind: input.kind,
      amountCents: input.amountCents,
      frequency: input.frequency,
      nextDate: input.nextDate,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      matchKey: input.matchKey ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return oneBill(db, row.bookId, row.id, today);
}

function oneBill(db: Queryable, bookId: number, id: number, today: string): BillJson {
  const bill = listBills(db, bookId, today).bills.find((item) => item.id === id);
  if (!bill) throw notFound("That bill doesn't exist. It may have been deleted.");
  return bill;
}

export function updateBill(db: Queryable, id: number, patch: BillUpdate, today: string): BillJson {
  const current = requireBill(db, id);
  checkLinks(db, current.bookId, patch.accountId, patch.categoryId);
  db.update(moneyBills)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(moneyBills.id, id))
    .run();
  return oneBill(db, current.bookId, id, today);
}

export function deleteBill(db: Queryable, id: number): void {
  requireBill(db, id);
  db.delete(moneyBills).where(eq(moneyBills.id, id)).run();
}

/** Remembers "not a bill" for a suggestion, so it doesn't come back. */
export function dismissBill(db: Queryable, input: BillDismiss, today: string): void {
  requireBook(db, input.bookId, "body");
  const now = new Date();
  db.insert(moneyBills)
    .values({
      bookId: input.bookId,
      name: input.name,
      status: "dismissed",
      nextDate: today,
      matchKey: input.matchKey,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

/** Every bill's dates from `from` through `to`, across books, for reminders and the calendar feed. */
export function billOccurrences(
  db: Queryable,
  from: string,
  to: string,
): Array<{
  id: number;
  bookId: number;
  name: string;
  kind: BillKind;
  amountCents: number;
  date: string;
}> {
  return db
    .select()
    .from(moneyBills)
    .where(eq(moneyBills.status, "active"))
    .all()
    .flatMap((bill) =>
      billDates(bill.nextDate, bill.frequency, from, to).map((date) => ({
        id: bill.id,
        bookId: bill.bookId,
        name: bill.name,
        kind: bill.kind,
        amountCents: bill.amountCents,
        date,
      })),
    );
}

// Forecast

export type ForecastAccount = {
  id: number;
  name: string;
  startCents: number;
  endCents: number;
  lowest: { date: string; balanceCents: number };
  /** The first day it's expected below the low balance, and the next income after it. */
  warning: {
    date: string;
    balanceCents: number;
    nextIncome: { name: string; date: string } | null;
  } | null;
};

export type ForecastJson = {
  days: number;
  lowCents: number;
  accounts: ForecastAccount[];
  /** One row a day: the date and each account's expected balance by id. */
  series: Array<{ date: string; balances: Record<number, number> }>;
  events: Array<{ date: string; accountId: number; name: string; amountCents: number }>;
  /** Bills without an account, so left out. */
  unassigned: Array<{ id: number; name: string }>;
};

/** Accounts a forecast covers: everyday money, not loans or investments. */
const FORECAST_KINDS = new Set(["checking", "savings", "cash", "credit_card", "other"]);
/** Kinds warned about when low. A card's balance is already money owed. */
const WARN_KINDS = new Set(["checking", "savings", "cash"]);

/**
 * Each account's expected balance for the next `days` days: today's balance plus each
 * bill and income on its schedule. Worked out on the fly, not stored.
 */
export function forecast(db: Queryable, bookId: number, days: number, today: string): ForecastJson {
  const { bills } = listBills(db, bookId, today);
  const lowCents = readSettings(db).moneyForecast.lowCents;
  const accounts = listAccounts(db, bookId).filter(
    (account) => !account.archived && FORECAST_KINDS.has(account.kind),
  );
  const end = addDays(today, days);
  const ids = new Set(accounts.map((account) => account.id));
  const events = bills
    .filter((bill) => bill.accountId !== null && ids.has(bill.accountId))
    .flatMap((bill) =>
      // Today's payments are usually in the balance already, so from tomorrow on.
      billDates(bill.nextDate, bill.frequency, addDays(today, 1), end).map((date) => ({
        date,
        accountId: bill.accountId as number,
        name: bill.name,
        amountCents: bill.kind === "income" ? bill.amountCents : -bill.amountCents,
      })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const running = new Map(accounts.map((account) => [account.id, account.balanceCents]));
  const series: ForecastJson["series"] = [];
  for (let day = 0; day <= days; day += 1) {
    const date = addDays(today, day);
    for (const event of events) {
      if (event.date === date) {
        running.set(event.accountId, (running.get(event.accountId) ?? 0) + event.amountCents);
      }
    }
    series.push({ date, balances: Object.fromEntries(running) });
  }

  return {
    days,
    lowCents,
    accounts: accounts.map((account) => {
      const points = series.map((row) => ({
        date: row.date,
        balanceCents: row.balances[account.id] ?? 0,
      }));
      const lowest = points.reduce((low, point) =>
        point.balanceCents < low.balanceCents ? point : low,
      );
      const low = WARN_KINDS.has(account.kind)
        ? points.find((point) => point.balanceCents < lowCents)
        : undefined;
      const income = low
        ? events.find(
            (event) =>
              event.accountId === account.id && event.amountCents > 0 && event.date > low.date,
          )
        : undefined;
      return {
        id: account.id,
        name: account.name,
        startCents: account.balanceCents,
        endCents: points.at(-1)?.balanceCents ?? account.balanceCents,
        lowest,
        warning: low
          ? {
              date: low.date,
              balanceCents: low.balanceCents,
              nextIncome: income ? { name: income.name, date: income.date } : null,
            }
          : null,
      };
    }),
    series,
    events,
    unassigned: bills
      .filter((bill) => bill.accountId === null || !ids.has(bill.accountId))
      .map((bill) => ({ id: bill.id, name: bill.name })),
  };
}
