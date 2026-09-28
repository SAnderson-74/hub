import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { monthBounds, shiftMonth } from "../../shared/budget";
import type { CashFlowItem, CashFlowJson, CashFlowPeriod } from "../../shared/cashFlow";
import { requireBook } from "./money.service";
import { moneyAccounts, moneyCategories, moneyTransactions } from "./schema";

/**
 * Where a book's money came from and went over the `months` ending with `month`.
 * Each category counts by its net: spending less refunds, income less anything paid
 * back. A spending category with more refunds than spending counts as money in.
 * Uncategorized money in and out are kept apart, and transfers are left out.
 */
export function cashFlow(
  db: Queryable,
  { bookId, month, months }: { bookId: number; month: string; months: CashFlowPeriod },
): CashFlowJson {
  requireBook(db, bookId);
  const from = monthBounds(shiftMonth(month, -(months - 1))).from;
  const to = monthBounds(month).to;
  const amount = moneyTransactions.amountCents;
  const rows = db
    .select({
      categoryId: moneyTransactions.categoryId,
      inCents: sql<number>`coalesce(sum(case when ${amount} > 0 then ${amount} else 0 end), 0)`,
      outCents: sql<number>`coalesce(sum(case when ${amount} < 0 then -${amount} else 0 end), 0)`,
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
    .groupBy(moneyTransactions.categoryId)
    .all();
  const names = new Map(
    db
      .select({ id: moneyCategories.id, name: moneyCategories.name })
      .from(moneyCategories)
      .where(eq(moneyCategories.bookId, bookId))
      .all()
      .map((category) => [category.id, category.name]),
  );

  const incoming: CashFlowItem[] = [];
  const outgoing: CashFlowItem[] = [];
  for (const row of rows) {
    if (row.categoryId === null) {
      if (row.inCents > 0)
        incoming.push({ key: "uncategorized-in", name: "Uncategorized", cents: row.inCents });
      if (row.outCents > 0)
        outgoing.push({ key: "uncategorized-out", name: "Uncategorized", cents: row.outCents });
      continue;
    }
    const net = row.inCents - row.outCents;
    const item = {
      key: `category-${row.categoryId}`,
      name: names.get(row.categoryId) ?? "Category",
      cents: Math.abs(net),
    };
    if (net > 0) incoming.push(item);
    else if (net < 0) outgoing.push(item);
  }
  const biggestFirst = (a: CashFlowItem, b: CashFlowItem) =>
    b.cents - a.cents || a.name.localeCompare(b.name);
  return { from, to, incoming: incoming.sort(biggestFirst), outgoing: outgoing.sort(biggestFirst) };
}
