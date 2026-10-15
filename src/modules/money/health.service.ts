import type { Queryable } from "../../server/db/client";
import type { AccountKind } from "../../shared/books";
import { monthBounds, monthsBetween, shiftMonth } from "../../shared/budget";
import { HEALTH_MONTHS } from "../../shared/health";
import { lines } from "./insights.service";
import { listAccounts, listCategories } from "./money.service";

// Money health numbers from the book's accounts and its last few full months.

const LIQUID: readonly AccountKind[] = ["checking", "savings", "cash"];

export type HealthJson = {
  /** Checking, savings, and cash with money in them. */
  liquidCents: number;
  /** Investment accounts, which a projection grows. */
  investedCents: number;
  /** Money owed on every account, positive. */
  debtCents: number;
  netCents: number;
  /** Full months the averages come from, up to six; 0 without any. */
  months: number;
  averageSpendingCents: number;
  averageIncomeCents: number;
  /** Months of spending the liquid accounts would cover, to one decimal; null without spending. */
  monthsCovered: number | null;
  /** Kept as a share of income, rounded; null without income. */
  savingsRatePercent: number | null;
};

/**
 * Spending and income are figured as Insights does: spending is money out less refunds
 * in spending categories plus uncategorized money out, income is money in to income
 * categories (less anything paid back) plus uncategorized money in. Transfers aside.
 * Only full months count, back to the book's first transaction.
 */
export function health(db: Queryable, bookId: number, today: string): HealthJson {
  const accounts = listAccounts(db, bookId).filter((account) => !account.archived);
  const sum = (filter: (account: (typeof accounts)[number]) => boolean) =>
    accounts.filter(filter).reduce((total, account) => total + account.balanceCents, 0);
  const liquidCents = sum((account) => LIQUID.includes(account.kind) && account.balanceCents > 0);
  const investedCents = sum((account) => account.kind === "investment" && account.balanceCents > 0);
  const debtCents = -sum((account) => account.balanceCents < 0);

  const kinds = new Map(listCategories(db, bookId).map((row) => [row.id, row.kind]));
  const last = shiftMonth(today.slice(0, 7), -1);
  const first = shiftMonth(last, -(HEALTH_MONTHS - 1));
  const rows = lines(db, bookId, monthBounds(first).from, monthBounds(last).to);
  const firstSeen = rows.reduce<string | null>(
    (low, row) => (low === null || row.month < low ? row.month : low),
    null,
  );
  const months =
    firstSeen === null ? 0 : Math.min(HEALTH_MONTHS, monthsBetween(firstSeen, last) + 1);
  let spending = 0;
  let income = 0;
  for (const row of rows) {
    const kind = row.categoryId === null ? null : kinds.get(row.categoryId);
    if (kind === "income") income += row.inCents - row.outCents;
    else if (kind === "expense") spending += row.outCents - row.inCents;
    else {
      income += row.inCents;
      spending += row.outCents;
    }
  }
  const averageSpendingCents = months === 0 ? 0 : Math.round(spending / months);
  const averageIncomeCents = months === 0 ? 0 : Math.round(income / months);
  return {
    liquidCents,
    investedCents,
    debtCents,
    netCents: sum(() => true),
    months,
    averageSpendingCents,
    averageIncomeCents,
    monthsCovered:
      averageSpendingCents > 0 ? Math.round((liquidCents / averageSpendingCents) * 10) / 10 : null,
    savingsRatePercent:
      averageIncomeCents > 0
        ? Math.round(((averageIncomeCents - averageSpendingCents) / averageIncomeCents) * 100)
        : null,
  };
}
