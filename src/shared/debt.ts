import { z } from "zod";

// Paying off debts: each card or loan with its yearly rate and minimum payment, paid
// in an order (smallest balance first, highest rate first, or your own), with any
// extra each month going to the first one not yet paid off. When one is paid off,
// its minimum joins the extra, so the monthly total stays the same.

export const DEBT_STRATEGIES = ["snowball", "avalanche", "custom"] as const;
export type DebtStrategy = (typeof DEBT_STRATEGIES)[number];

export const DEBT_STRATEGY_LABELS: Record<DebtStrategy, string> = {
  snowball: "Smallest balance first",
  avalanche: "Highest rate first",
  custom: "My own order",
};

export const DEBT_STRATEGY_HINTS: Record<DebtStrategy, string> = {
  snowball: "Quick wins: each payoff frees its minimum for the next.",
  avalanche: "Least interest overall.",
  custom: "Pay them off in the order you set.",
};

/** The longest a plan is followed, in months: 50 years. */
export const MAX_MONTHS = 600;

const id = z.number().int().positive();

export const debtTermsSchema = z
  .object({
    /** The yearly rate in hundredths of a percent: 2499 is 24.99%. */
    aprBasisPoints: z
      .number()
      .int("Use a rate like 24.99.")
      .min(0, "Rates can't be negative.")
      .max(10_000, "Use a rate of 100% or less."),
    minimumCents: z
      .number()
      .int("Use whole cents.")
      .min(0, "The minimum can't be negative.")
      .max(10_000_000, "Use an amount under $100,000."),
  })
  .strict();
export type DebtTerms = z.infer<typeof debtTermsSchema>;

export const debtPlanSchema = z
  .object({
    bookId: id,
    strategy: z.enum(DEBT_STRATEGIES),
    /** Paid each month on top of the minimums. */
    extraCents: z
      .number()
      .int("Use whole cents.")
      .min(0, "The extra can't be negative.")
      .max(10_000_000, "Use an amount under $100,000."),
    /** Account ids, first paid first, for "custom". */
    order: z.array(id).max(100),
  })
  .strict();
export type DebtPlanSet = z.infer<typeof debtPlanSchema>;

export type Debt = {
  id: number;
  name: string;
  /** What's owed, positive. */
  balanceCents: number;
  aprBasisPoints: number;
  minimumCents: number;
};

export type DebtResult = {
  id: number;
  /** Months from now until it's paid off (1 is next month), or null if it never is. */
  months: number | null;
  interestCents: number;
};

export type PayoffPlan = {
  /** Months until every debt is paid off, or null if the payments never get there. */
  months: number | null;
  interestCents: number;
  /** In the order they're paid off. */
  debts: DebtResult[];
  /** What's owed at the end of each month, starting with now. */
  balances: number[];
};

/** The order debts are paid in for a strategy; `custom` follows `order`, then the rest by balance. */
export function payoffOrder(
  debts: readonly Debt[],
  strategy: DebtStrategy,
  order: readonly number[] = [],
): Debt[] {
  const bySize = (a: Debt, b: Debt) => a.balanceCents - b.balanceCents || a.id - b.id;
  if (strategy === "snowball") return [...debts].sort(bySize);
  if (strategy === "avalanche") {
    return [...debts].sort((a, b) => b.aprBasisPoints - a.aprBasisPoints || bySize(a, b));
  }
  const place = new Map(order.map((debtId, index) => [debtId, index]));
  return [...debts].sort(
    (a, b) =>
      (place.get(a.id) ?? Number.POSITIVE_INFINITY) -
        (place.get(b.id) ?? Number.POSITIVE_INFINITY) || bySize(a, b),
  );
}

/**
 * Follows a plan month by month: interest is added, every debt gets its minimum (or
 * what's left of it), and the rest of the month's total goes to debts in order. The
 * month's total is every minimum plus the extra, so a paid-off debt's minimum moves
 * on to the next one.
 */
export function simulatePayoff(
  debts: readonly Debt[],
  strategy: DebtStrategy,
  extraCents: number,
  order: readonly number[] = [],
): PayoffPlan {
  const ordered = payoffOrder(
    debts.filter((debt) => debt.balanceCents > 0),
    strategy,
    order,
  );
  const balance = new Map(ordered.map((debt) => [debt.id, debt.balanceCents]));
  const interest = new Map(ordered.map((debt) => [debt.id, 0]));
  const paidOff = new Map<number, number>();
  const budget = ordered.reduce((sum, debt) => sum + debt.minimumCents, 0) + extraCents;
  const owed = () => [...balance.values()].reduce((sum, cents) => sum + cents, 0);
  const balances = [owed()];

  for (let month = 1; month <= MAX_MONTHS && owed() > 0; month += 1) {
    for (const debt of ordered) {
      const left = balance.get(debt.id) ?? 0;
      if (left <= 0) continue;
      const charge = Math.round((left * debt.aprBasisPoints) / 10_000 / 12);
      balance.set(debt.id, left + charge);
      interest.set(debt.id, (interest.get(debt.id) ?? 0) + charge);
    }
    let money = budget;
    for (const debt of ordered) {
      const left = balance.get(debt.id) ?? 0;
      const pay = Math.min(left, debt.minimumCents, money);
      balance.set(debt.id, left - pay);
      money -= pay;
    }
    for (const debt of ordered) {
      if (money <= 0) break;
      const left = balance.get(debt.id) ?? 0;
      const pay = Math.min(left, money);
      balance.set(debt.id, left - pay);
      money -= pay;
    }
    for (const debt of ordered) {
      if (!paidOff.has(debt.id) && (balance.get(debt.id) ?? 0) <= 0) paidOff.set(debt.id, month);
    }
    balances.push(owed());
    // Payments that don't cover the interest never get there.
    const before = balances.at(-2) ?? 0;
    if (month >= 12 && owed() >= before) break;
  }

  const results = ordered
    .map((debt) => ({
      id: debt.id,
      months: paidOff.get(debt.id) ?? null,
      interestCents: interest.get(debt.id) ?? 0,
    }))
    .sort(
      (a, b) => (a.months ?? Number.POSITIVE_INFINITY) - (b.months ?? Number.POSITIVE_INFINITY),
    );
  const done = results.every((result) => result.months !== null);
  return {
    months: done ? Math.max(0, ...results.map((result) => result.months ?? 0)) : null,
    interestCents: results.reduce((sum, result) => sum + result.interestCents, 0),
    debts: results,
    balances,
  };
}

/** "24.99" from 2499. */
export const aprText = (basisPoints: number) => (basisPoints / 100).toFixed(2).replace(/\.00$/, "");

/** Basis points from what someone typed, like "24.99" or "7%"; null when it isn't a rate. */
export function parseApr(text: string): number | null {
  const cleaned = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Math.round(Number(cleaned) * 100);
  return value > 10_000 ? null : value;
}
