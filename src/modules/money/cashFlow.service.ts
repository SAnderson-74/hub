import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { monthBounds, shiftMonth } from "../../shared/budget";
import type {
  CashFlowGroup,
  CashFlowItem,
  CashFlowJson,
  CashFlowPeriod,
} from "../../shared/cashFlow";
import { lineAmountCents, lineCategoryId, splitJoin } from "./lines";
import { requireBook } from "./money.service";
import {
  moneyAccounts,
  moneyCards,
  moneyCategories,
  moneyTransactionSplits,
  moneyTransactions,
} from "./schema";

type Row = {
  categoryId: number | null;
  accountId: number;
  cardId: number | null;
  inCents: number;
  outCents: number;
};

const biggestFirst = (a: CashFlowItem, b: CashFlowItem) =>
  b.cents - a.cents || a.name.localeCompare(b.name);

/**
 * Where a book's money came from and went over the `months` ending with `month`.
 * Each category counts by its net: spending less refunds, income less anything paid
 * back. A spending category with more refunds than spending counts as money in.
 * Uncategorized money in and out are kept apart, and transfers are left out.
 *
 * By payment method, money in is the same, and money out is the same total split by
 * the card that paid, or the account when no card did. A refund comes off the card
 * or account it went back to.
 */
export function cashFlow(
  db: Queryable,
  {
    bookId,
    month,
    months,
    by = "category",
  }: { bookId: number; month: string; months: CashFlowPeriod; by?: CashFlowGroup },
): CashFlowJson {
  requireBook(db, bookId);
  const from = monthBounds(shiftMonth(month, -(months - 1))).from;
  const to = monthBounds(month).to;
  // Split transactions count in each part's category.
  const amount = lineAmountCents;
  const rows: Row[] = db
    .select({
      categoryId: lineCategoryId,
      accountId: moneyTransactions.accountId,
      cardId: moneyTransactions.cardId,
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
    .groupBy(lineCategoryId, moneyTransactions.accountId, moneyTransactions.cardId)
    .all();
  const names = new Map(
    db
      .select({ id: moneyCategories.id, name: moneyCategories.name })
      .from(moneyCategories)
      .where(eq(moneyCategories.bookId, bookId))
      .all()
      .map((category) => [category.id, category.name]),
  );

  // Each category's totals across accounts and cards.
  const byCategory = new Map<number | null, { inCents: number; outCents: number }>();
  for (const row of rows) {
    const total = byCategory.get(row.categoryId) ?? { inCents: 0, outCents: 0 };
    total.inCents += row.inCents;
    total.outCents += row.outCents;
    byCategory.set(row.categoryId, total);
  }

  const incoming: CashFlowItem[] = [];
  const outgoing: CashFlowItem[] = [];
  for (const [categoryId, total] of byCategory) {
    if (categoryId === null) {
      if (total.inCents > 0)
        incoming.push({ key: "uncategorized-in", name: "Uncategorized", cents: total.inCents });
      if (total.outCents > 0)
        outgoing.push({ key: "uncategorized-out", name: "Uncategorized", cents: total.outCents });
      continue;
    }
    const net = total.inCents - total.outCents;
    const item = {
      key: `category-${categoryId}`,
      name: names.get(categoryId) ?? "Category",
      cents: Math.abs(net),
    };
    if (net > 0) incoming.push(item);
    else if (net < 0) outgoing.push(item);
  }

  const out = by === "method" ? byMethod(db, bookId, rows, byCategory) : outgoing;
  return {
    from,
    to,
    by,
    incoming: incoming.sort(biggestFirst),
    outgoing: out.sort(biggestFirst),
  };
}

/**
 * Money out split by payment method: for each category that counts as money out,
 * what each card or account paid less what came back to it, plus uncategorized
 * money out. It adds up to the same total as by category.
 */
function byMethod(
  db: Queryable,
  bookId: number,
  rows: readonly Row[],
  byCategory: Map<number | null, { inCents: number; outCents: number }>,
): CashFlowItem[] {
  const totals = new Map<string, number>();
  const add = (key: string, cents: number) => totals.set(key, (totals.get(key) ?? 0) + cents);
  for (const row of rows) {
    const key = row.cardId === null ? `account-${row.accountId}` : `card-${row.cardId}`;
    if (row.categoryId === null) {
      if (row.outCents > 0) add(key, row.outCents);
      continue;
    }
    const category = byCategory.get(row.categoryId);
    if (category && category.outCents > category.inCents) add(key, row.outCents - row.inCents);
  }
  const settled = settle(totals);

  const accounts = db
    .select({ id: moneyAccounts.id, name: moneyAccounts.name })
    .from(moneyAccounts)
    .where(eq(moneyAccounts.bookId, bookId))
    .all();
  const cards = db
    .select({ id: moneyCards.id, name: moneyCards.name, accountId: moneyCards.accountId })
    .from(moneyCards)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyCards.accountId))
    .where(eq(moneyAccounts.bookId, bookId))
    .all();
  const withCards = new Set(cards.map((card) => card.accountId));
  const label = new Map<string, string>([
    ...cards.map((card) => [`card-${card.id}`, card.name] as const),
    // An account with cards also pays by other means: checks, bank transfers, apps.
    ...accounts.map(
      (account) =>
        [
          `account-${account.id}`,
          withCards.has(account.id) ? `${account.name} (no card)` : account.name,
        ] as const,
    ),
  ]);
  return [...settled].map(([key, cents]) => ({ key, name: label.get(key) ?? "Account", cents }));
}

/**
 * Drops methods that took in more refunds than they paid out (a refund to a different
 * card than the purchase), taking that amount off the others in proportion, so the
 * total stays the same.
 */
export function settle(totals: ReadonlyMap<string, number>): Map<string, number> {
  const positive = [...totals].filter(([, cents]) => cents > 0);
  const owed = [...totals].reduce((sum, [, cents]) => sum + (cents < 0 ? -cents : 0), 0);
  if (owed === 0) return new Map(positive);
  const gross = positive.reduce((sum, [, cents]) => sum + cents, 0);
  const net = gross - owed;
  if (net <= 0) return new Map();
  const scaled = positive.map(([key, cents]) => [key, Math.floor((cents * net) / gross)] as const);
  // Whole cents: the rounding remainder goes to the biggest.
  const remainder = net - scaled.reduce((sum, [, cents]) => sum + cents, 0);
  const biggest = scaled.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return new Map(
    scaled.map(([key, cents]) => [key, key === biggest[0] ? cents + remainder : cents] as const),
  );
}
