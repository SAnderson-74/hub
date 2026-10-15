import { z } from "zod";

// Money health: how many months of spending the cash on hand covers, and how much of
// what comes in is kept. And a projection of net worth from saving and growth.

export const healthQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
});

/** How many full months the averages come from. */
export const HEALTH_MONTHS = 6;

export type HealthTone = "ok" | "warn" | "danger";

/** A word and a tone for months of spending covered. */
export function coverageLevel(months: number): { label: string; tone: HealthTone } {
  if (months < 1) return { label: "Thin", tone: "danger" };
  if (months < 3) return { label: "Building", tone: "warn" };
  if (months < 6) return { label: "Solid", tone: "ok" };
  return { label: "Strong", tone: "ok" };
}

/** A word and a tone for a savings rate in percent. */
export function savingsLevel(percent: number): { label: string; tone: HealthTone } {
  if (percent < 0) return { label: "Spending more than comes in", tone: "danger" };
  if (percent < 10) return { label: "Low", tone: "warn" };
  if (percent < 20) return { label: "Healthy", tone: "ok" };
  return { label: "Strong", tone: "ok" };
}

export type ProjectionInput = {
  /** Net worth now. */
  netCents: number;
  /** The part of it in investments, which grows at the return. */
  investedCents: number;
  /** Saved each month, put into investments. */
  monthlyCents: number;
  /** Yearly return on investments, in percent. */
  returnPercent: number;
  years: number;
};

export type ProjectionPoint = {
  year: number;
  netCents: number;
  /** The same saving with no growth at all, for comparison. */
  savedOnlyCents: number;
};

/**
 * Net worth at the end of each year ahead: investments grow at the yearly return,
 * compounded monthly, and each month's saving is invested. Everything else stays as
 * it is. A rough guide, not a promise: returns go up and down.
 */
export function projectNetWorth(input: ProjectionInput): ProjectionPoint[] {
  const rate = input.returnPercent / 100 / 12;
  const rest = input.netCents - input.investedCents;
  let invested = input.investedCents;
  const points: ProjectionPoint[] = [
    { year: 0, netCents: input.netCents, savedOnlyCents: input.netCents },
  ];
  for (let month = 1; month <= input.years * 12; month += 1) {
    invested = invested * (1 + rate) + input.monthlyCents;
    if (month % 12 === 0) {
      points.push({
        year: month / 12,
        netCents: Math.round(rest + invested),
        savedOnlyCents: input.netCents + input.monthlyCents * month,
      });
    }
  }
  return points;
}
