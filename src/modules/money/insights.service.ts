import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { monthBounds, shiftMonth } from "../../shared/budget";
import { median, USUAL_MONTHS, wellAbove } from "../../shared/insights";
import { payeeGroup } from "../../shared/payees";
import { lineAmountCents, lineCategoryId, splitJoin } from "./lines";
import { requireBook } from "./money.service";
import {
  moneyAccounts,
  moneyCategories,
  moneyTransactionSplits,
  moneyTransactions,
} from "./schema";

// Where spending is going: month over month, year over year, by category and by store.
// Spending is money out less refunds, in spending categories and uncategorized; income
// and transfers are left out. Split transactions count in each part's category.

export type InsightsJson = {
  month: string;
  /** The twelve months ending with this one, and the same months a year earlier. */
  months: Array<{ month: string; spentCents: number; lastYearCents: number }>;
  categories: Array<{
    id: number;
    name: string;
    thisCents: number;
    lastMonthCents: number;
    lastYearCents: number;
    /** The middle of the six months before this one. */
    usualCents: number;
  }>;
  /** The places most spent at this month. */
  stores: Array<{
    key: string;
    name: string;
    thisCents: number;
    lastMonthCents: number;
    lastYearCents: number;
  }>;
  /** Categories well above their usual this month. */
  alerts: Array<{ id: number; name: string; spentCents: number; usualCents: number }>;
};

export type YearReviewJson = {
  year: number;
  inCents: number;
  outCents: number;
  /** In less out. */
  savedCents: number;
  /** Saved as a share of what came in, rounded; null when nothing came in. */
  savingsRatePercent: number | null;
  lastYearOutCents: number;
  categories: Array<{ name: string; cents: number }>;
  stores: Array<{ name: string; cents: number; count: number }>;
  /** The month with the most spending. */
  biggestMonth: { month: string; spentCents: number } | null;
  transactionCount: number;
};

const STORES = 8;
const TOP = 5;

type Line = { categoryId: number | null; month: string; inCents: number; outCents: number };

/** Money in and out by category and month, transfers aside, over `from`..`to`. */
function lines(db: Queryable, bookId: number, from: string, to: string): Line[] {
  const amount = lineAmountCents;
  const monthExpr = sql<string>`substr(${moneyTransactions.date}, 1, 7)`;
  return db
    .select({
      categoryId: lineCategoryId,
      month: monthExpr,
      inCents: sql<number>`coalesce(sum(case when ${amount} > 0 then ${amount} else 0 end), 0)`,
      outCents: sql<number>`coalesce(sum(case when ${amount} < 0 then -${amount} else 0 end), 0)`,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .leftJoin(moneyTransactionSplits, splitJoin)
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        isNull(moneyTransactions.transferPeerId),
        gte(moneyTransactions.date, from),
        lte(moneyTransactions.date, to),
      ),
    )
    .groupBy(lineCategoryId, monthExpr)
    .all();
}

function categoriesOf(db: Queryable, bookId: number) {
  return db
    .select({
      id: moneyCategories.id,
      name: moneyCategories.name,
      kind: moneyCategories.kind,
      archived: moneyCategories.archived,
    })
    .from(moneyCategories)
    .where(eq(moneyCategories.bookId, bookId))
    .orderBy(moneyCategories.sortOrder, moneyCategories.id)
    .all();
}

/** Spending by the place it was spent: money out less refunds, by payee group. */
function byStore(
  db: Queryable,
  bookId: number,
  from: string,
  to: string,
  expense: ReadonlySet<number>,
): Map<string, { name: string; byMonth: Map<string, number>; count: number }> {
  const rows = db
    .select({
      date: moneyTransactions.date,
      amountCents: moneyTransactions.amountCents,
      payee: moneyTransactions.payee,
      memo: moneyTransactions.memo,
      counterparty: moneyTransactions.counterparty,
      categoryId: moneyTransactions.categoryId,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        isNull(moneyTransactions.transferPeerId),
        gte(moneyTransactions.date, from),
        lte(moneyTransactions.date, to),
      ),
    )
    .all();
  const stores = new Map<string, { name: string; byMonth: Map<string, number>; count: number }>();
  for (const row of rows) {
    // Money in counts only as a refund: back into a spending category.
    const refund = row.amountCents > 0 && row.categoryId !== null && expense.has(row.categoryId);
    if (row.amountCents >= 0 && !refund) continue;
    const group = payeeGroup(row);
    const store = stores.get(group.key) ?? { name: group.name, byMonth: new Map(), count: 0 };
    const month = row.date.slice(0, 7);
    store.byMonth.set(month, (store.byMonth.get(month) ?? 0) - row.amountCents);
    if (row.amountCents < 0) store.count += 1;
    stores.set(group.key, store);
  }
  return stores;
}

/** A book's spending this month against last month, last year, and each category's usual. */
export function insights(db: Queryable, bookId: number, month: string): InsightsJson {
  requireBook(db, bookId);
  const categories = categoriesOf(db, bookId);
  const expense = new Set(categories.filter((row) => row.kind === "expense").map((row) => row.id));
  const first = shiftMonth(month, -23);
  const all = lines(db, bookId, monthBounds(first).from, monthBounds(month).to);

  /** Spending in a category (or uncategorized, for null) in a month. */
  const spent = (categoryId: number | null, inMonth: string) =>
    all
      .filter((row) => row.categoryId === categoryId && row.month === inMonth)
      .reduce(
        (sum, row) => sum + (categoryId === null ? row.outCents : row.outCents - row.inCents),
        0,
      );
  const total = (inMonth: string) =>
    [...expense, null].reduce<number>((sum, id) => sum + spent(id, inMonth), 0);

  const lastMonth = shiftMonth(month, -1);
  const lastYear = shiftMonth(month, -12);
  const earlier = Array.from({ length: USUAL_MONTHS }, (_, index) =>
    shiftMonth(month, -(index + 1)),
  );

  const rows = categories
    .filter((row) => row.kind === "expense")
    .map((category) => {
      const history = earlier.map((inMonth) => spent(category.id, inMonth));
      return {
        id: category.id,
        name: category.name,
        archived: category.archived,
        thisCents: spent(category.id, month),
        lastMonthCents: spent(category.id, lastMonth),
        lastYearCents: spent(category.id, lastYear),
        usualCents: median(history),
        monthsWithSpending: history.filter((cents) => cents > 0).length,
      };
    })
    .filter(
      (row) =>
        !row.archived || row.thisCents !== 0 || row.lastMonthCents !== 0 || row.lastYearCents !== 0,
    );

  const stores = byStore(db, bookId, monthBounds(lastYear).from, monthBounds(month).to, expense);
  const storeRows = [...stores.entries()]
    .map(([key, store]) => ({
      key,
      name: store.name,
      thisCents: store.byMonth.get(month) ?? 0,
      lastMonthCents: store.byMonth.get(lastMonth) ?? 0,
      lastYearCents: store.byMonth.get(lastYear) ?? 0,
    }))
    .filter((row) => row.thisCents > 0)
    .sort((a, b) => b.thisCents - a.thisCents || a.name.localeCompare(b.name))
    .slice(0, STORES);

  return {
    month,
    months: Array.from({ length: 12 }, (_, index) => {
      const inMonth = shiftMonth(month, index - 11);
      return {
        month: inMonth,
        spentCents: total(inMonth),
        lastYearCents: total(shiftMonth(inMonth, -12)),
      };
    }),
    categories: rows
      .map(({ archived: _, monthsWithSpending: __, ...row }) => row)
      .sort((a, b) => b.thisCents - a.thisCents || a.name.localeCompare(b.name)),
    stores: storeRows,
    alerts: rows
      .filter((row) => wellAbove(row.thisCents, row.usualCents, row.monthsWithSpending))
      .map((row) => ({
        id: row.id,
        name: row.name,
        spentCents: row.thisCents,
        usualCents: row.usualCents,
      }))
      .sort((a, b) => b.spentCents - b.usualCents - (a.spentCents - a.usualCents)),
  };
}

/** A year at a glance: in, out, saved, where it went, and the biggest month. */
export function yearReview(db: Queryable, bookId: number, year: number): YearReviewJson {
  requireBook(db, bookId);
  const categories = categoriesOf(db, bookId);
  const kinds = new Map(categories.map((row) => [row.id, row.kind]));
  const names = new Map(categories.map((row) => [row.id, row.name]));
  const expense = new Set(categories.filter((row) => row.kind === "expense").map((row) => row.id));
  const from = `${year - 1}-01-01`;
  const to = `${year}-12-31`;
  const all = lines(db, bookId, from, to);
  const thisYear = all.filter((row) => row.month.startsWith(`${year}-`));

  let inCents = 0;
  let outCents = 0;
  const byCategory = new Map<number | null, number>();
  const byMonth = new Map<string, number>();
  const spentIn = (row: Line) =>
    row.categoryId === null ? row.outCents : row.outCents - row.inCents;
  for (const row of thisYear) {
    const kind = row.categoryId === null ? null : kinds.get(row.categoryId);
    if (kind === "income") {
      inCents += row.inCents - row.outCents;
    } else if (kind === "expense") {
      outCents += spentIn(row);
      byCategory.set(row.categoryId, (byCategory.get(row.categoryId) ?? 0) + spentIn(row));
      byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + spentIn(row));
    } else {
      // Uncategorized: money in counts as in, money out as spending.
      inCents += row.inCents;
      outCents += row.outCents;
      byCategory.set(null, (byCategory.get(null) ?? 0) + row.outCents);
      byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + row.outCents);
    }
  }
  const lastYearOutCents = all
    .filter((row) => row.month.startsWith(`${year - 1}-`))
    .reduce((sum, row) => {
      const kind = row.categoryId === null ? null : kinds.get(row.categoryId);
      if (kind === "income") return sum;
      return sum + spentIn(row);
    }, 0);

  const stores = byStore(db, bookId, `${year}-01-01`, to, expense);
  const biggest = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  const count = db
    .select({ n: sql<number>`count(*)` })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        isNull(moneyTransactions.transferPeerId),
        gte(moneyTransactions.date, `${year}-01-01`),
        lte(moneyTransactions.date, to),
      ),
    )
    .get();
  const savedCents = inCents - outCents;
  return {
    year,
    inCents,
    outCents,
    savedCents,
    savingsRatePercent: inCents > 0 ? Math.round((savedCents / inCents) * 100) : null,
    lastYearOutCents,
    categories: [...byCategory.entries()]
      .filter(([, cents]) => cents > 0)
      .map(([id, cents]) => ({
        name: id === null ? "Uncategorized" : (names.get(id) ?? "Category"),
        cents,
      }))
      .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
      .slice(0, TOP),
    stores: [...stores.values()]
      .map((store) => ({
        name: store.name,
        cents: [...store.byMonth.values()].reduce((sum, cents) => sum + cents, 0),
        count: store.count,
      }))
      .filter((store) => store.cents > 0)
      .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
      .slice(0, TOP),
    biggestMonth: biggest && biggest[1] > 0 ? { month: biggest[0], spentCents: biggest[1] } : null,
    transactionCount: count?.n ?? 0,
  };
}
