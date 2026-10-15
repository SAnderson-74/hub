import { z } from "zod";
import { monthSchema } from "./budget";

// Spending insights: how this month compares with last month, the same month last year,
// and a category's usual; a year in review; and which categories are well above usual.

export const insightsQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
  month: monthSchema,
});

export const yearReviewQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(1900).max(3000),
});

/** How many earlier months a category's usual is the middle of. */
export const USUAL_MONTHS = 6;

/**
 * Whether a month's spending is well above the usual: half again as much, and at least
 * $50 more, with spending in at least half of the months the usual comes from.
 */
export function wellAbove(spentCents: number, usualCents: number, monthsWithSpending: number) {
  return (
    monthsWithSpending >= USUAL_MONTHS / 2 &&
    usualCents > 0 &&
    spentCents >= usualCents * 1.5 &&
    spentCents - usualCents >= 5_000
  );
}

/** The middle value, or the mean of the two middle ones. 0 for none. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

/** "12% more" / "8% less" / "the same", comparing `now` with `before`; null without a before. */
export function changeText(now: number, before: number): string | null {
  if (before <= 0) return null;
  const percent = Math.round(((now - before) / before) * 100);
  if (percent === 0) return "the same";
  return percent > 0 ? `${percent}% more` : `${-percent}% less`;
}
