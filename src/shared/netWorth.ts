import { z } from "zod";
import { formatCents } from "./money";
import { formatSigned, monthLabel } from "./profit";

// Net worth: what every account adds up to (money owed subtracts), at the end of each
// month, so the trend shows how it's changing.

/** How far back the chart can go, in months. */
export const NET_WORTH_RANGES = [12, 36, 60] as const;
export type NetWorthRange = (typeof NET_WORTH_RANGES)[number];

export const NET_WORTH_RANGE_LABELS: Record<NetWorthRange, string> = {
  12: "1 year",
  36: "3 years",
  60: "5 years",
};

export const netWorthQuerySchema = z.object({
  /** Today, in the browser's time zone: the last point. */
  to: z.iso.date("Use a date like 2030-01-31."),
  months: z.coerce
    .number()
    .int()
    .refine((value) => (NET_WORTH_RANGES as readonly number[]).includes(value), {
      message: "Use 12, 36, or 60 months.",
    })
    .default(12),
  /** One book; every open book when left out. */
  bookId: z.coerce.number().int().positive().optional(),
});

export type NetWorthPoint = {
  month: string;
  /** The month's last day, or today for the current month. */
  date: string;
  /** Accounts with money in them. */
  assetsCents: number;
  /** Money owed, as a positive amount. */
  debtsCents: number;
  netCents: number;
};

/** "Net worth is $41,200, up $3,100 since October 2025." */
export function netWorthSummary(points: readonly NetWorthPoint[]): string {
  const last = points.at(-1);
  const first = points[0];
  if (!last || !first) return "No accounts yet.";
  const now = `Net worth is ${formatSigned(last.netCents)}`;
  if (points.length === 1) return `${now}. The chart fills in as months go by.`;
  const change = last.netCents - first.netCents;
  const since = monthLabel(first.month, true);
  if (change === 0) return `${now}, the same as at the end of ${since}.`;
  return `${now}, ${change > 0 ? "up" : "down"} ${formatCents(Math.abs(change))} since the end of ${since}.`;
}
