import { z } from "zod";
import { formatCents } from "./money";
import { monthLabel } from "./profit";

// Monthly budgets for spending categories. A budget set for a month carries on to the
// months after it until a later month sets a new amount; 0 means "no budget from here".

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const monthSchema = z.string().regex(MONTH, "Use a month like 2030-01.");

/** "2030-01" from "2030-01-31". */
export const monthOf = (date: string) => date.slice(0, 7);

/** The month `count` months after (or before, if negative) this one. */
export function shiftMonth(month: string, count: number): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + count;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** The first and last dates of a month, for date range queries. */
export function monthBounds(month: string): { from: string; to: string } {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export type BudgetEntry = { categoryId: number; month: string; amountCents: number };

/**
 * The budget in force for a category in a month: the latest amount set in that month
 * or before. null when none was set, or the latest was 0.
 */
export function budgetFor(
  entries: readonly BudgetEntry[],
  categoryId: number,
  month: string,
): number | null {
  let latest: BudgetEntry | null = null;
  for (const entry of entries) {
    if (entry.categoryId !== categoryId || entry.month > month) continue;
    if (!latest || entry.month > latest.month) latest = entry;
  }
  return latest && latest.amountCents > 0 ? latest.amountCents : null;
}

export type BudgetStatus = {
  /** Budget minus spending; negative when over. */
  remainingCents: number;
  /** How much of the budget is used, 0-100 for the bar (capped). */
  percent: number;
  over: boolean;
};

export function budgetStatus(budgetCents: number, spentCents: number): BudgetStatus {
  const remainingCents = budgetCents - spentCents;
  const used = budgetCents > 0 ? (spentCents / budgetCents) * 100 : 0;
  return {
    remainingCents,
    percent: Math.max(0, Math.min(100, Math.round(used))),
    over: remainingCents < 0,
  };
}

/** "$120 left" or "$30 over". */
export function remainingText(status: BudgetStatus): string {
  return status.over
    ? `${formatCents(-status.remainingCents)} over`
    : `${formatCents(status.remainingCents)} left`;
}

export type BudgetMonthTotals = { month: string; budgetedCents: number; spentCents: number };

/** The history chart's one-line reading. */
export function historySummary(months: readonly BudgetMonthTotals[]): string {
  const spent = months.filter((entry) => entry.spentCents > 0);
  if (spent.length === 0) return `No spending in the last ${months.length} months.`;
  const average = Math.round(
    months.reduce((sum, entry) => sum + entry.spentCents, 0) / months.length,
  );
  const budgeted = months.filter((entry) => entry.budgetedCents > 0);
  const over = budgeted.filter((entry) => entry.spentCents > entry.budgetedCents);
  const first = months[0]?.month ?? "";
  const last = months.at(-1)?.month ?? "";
  const lead = `Spending averaged ${formatCents(average)} a month from ${monthLabel(first)} to ${monthLabel(last)}`;
  if (budgeted.length === 0) return `${lead}. No budgets were set.`;
  if (over.length === 0) return `${lead}, within budget every budgeted month.`;
  return `${lead}, over budget in ${over.length} of ${budgeted.length} budgeted ${budgeted.length === 1 ? "month" : "months"}.`;
}

export const budgetSetSchema = z
  .object({
    categoryId: z.number().int().positive(),
    /** Applies to this month and later ones, until a later month sets another amount. */
    month: monthSchema,
    /** 0 removes the budget from this month on. */
    amountCents: z
      .number()
      .int("Use whole cents.")
      .min(0, "Budgets can't be negative.")
      .max(10_000_000_000, "Use an amount under $100,000,000."),
  })
  .strict();
export type BudgetSet = z.infer<typeof budgetSetSchema>;

export const budgetQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
  month: monthSchema,
});

// Carrying unspent money over, and sinking funds: saving a bit each month for a cost
// that comes once or twice a year.

export const GOAL_REPEATS = [null, 6, 12] as const;

export const budgetSettingsSchema = z
  .object({
    categoryId: z.number().int().positive(),
    /** The month the change is made from: carrying over starts here when turned on. */
    month: monthSchema,
    rollover: z.boolean(),
    /** A sinking fund's target. Saving up needs carrying over, so it turns that on. */
    goal: z
      .object({
        cents: z
          .number()
          .int("Use whole cents.")
          .min(100, "Save up for at least $1.")
          .max(10_000_000_000, "Use an amount under $100,000,000."),
        dueDate: z.iso.date("Use a date like 2030-01-31."),
        /** Comes again every 6 or 12 months, or null for once. */
        everyMonths: z.union([z.literal(6), z.literal(12)]).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type BudgetSettingsSet = z.infer<typeof budgetSettingsSchema>;

/** Whole months from `from` to `to` (YYYY-MM), 0 when the same. */
export function monthsBetween(from: string, to: string): number {
  const [fromYear = 0, fromIndex = 1] = from.split("-").map(Number);
  const [toYear = 0, toIndex = 1] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toIndex - fromIndex);
}

/**
 * When a sinking fund's cost is next due as seen from `month`: its date, or for one
 * that repeats, the first of its dates that isn't in a month before this one.
 */
export function goalDueDate(dueDate: string, everyMonths: number | null, month: string): string {
  if (!everyMonths || monthOf(dueDate) >= month) return dueDate;
  const behind = monthsBetween(monthOf(dueDate), month);
  const steps = Math.ceil(behind / everyMonths);
  const target = shiftMonth(monthOf(dueDate), steps * everyMonths);
  // Keep the day, or the month's last day when it has fewer.
  const day = Math.min(Number(dueDate.slice(8, 10)), Number(monthBounds(target).to.slice(8, 10)));
  return `${target}-${String(day).padStart(2, "0")}`;
}

/**
 * What to set aside each month, from `month` through the due month, to have `goalCents`
 * by then with `savedCents` already put by. Rounded up to whole dollars; 0 when it's
 * already saved. A goal whose month has passed needs the rest now.
 */
export function neededMonthlyCents(
  goalCents: number,
  savedCents: number,
  month: string,
  dueDate: string,
): number {
  const rest = Math.max(0, goalCents - savedCents);
  if (rest === 0) return 0;
  const months = Math.max(1, monthsBetween(month, monthOf(dueDate)) + 1);
  return Math.ceil(rest / months / 100) * 100;
}
