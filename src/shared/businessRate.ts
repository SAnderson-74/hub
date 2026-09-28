import { z } from "zod";

// The rate calculator: what to charge an hour to keep a yearly income after business
// costs and taxes, given the hours you can actually bill.

export const businessRateSchema = z
  .object({
    /** What you want to keep in a year, after business costs and taxes. */
    incomeCents: z
      .number("Enter the income as a number.")
      .int("Use whole cents.")
      .min(0, "The income can't be negative.")
      .max(100_000_000, "Use an income under $1,000,000."),
    /** Yearly business costs: insurance, software, gear, fees. */
    overheadCents: z
      .number("Enter the costs as a number.")
      .int("Use whole cents.")
      .min(0, "Costs can't be negative.")
      .max(100_000_000, "Use costs under $1,000,000."),
    /** Share of profit set aside for taxes. */
    taxPercent: z
      .number("Enter the tax share as a number.")
      .min(0, "Use 0% or more for taxes.")
      .max(60, "Use 60% or less for taxes."),
    /** Hours a week you can bill, not every hour you work. */
    hoursPerWeek: z
      .number("Enter the hours as a number.")
      .min(1, "Bill at least 1 hour a week.")
      .max(80, "Use 80 hours a week or fewer."),
    /** Weeks a year you work, after time off. */
    weeksPerYear: z
      .number("Enter the weeks as a number.")
      .int("Use whole weeks.")
      .min(1, "Work at least 1 week a year.")
      .max(52, "A year has 52 weeks."),
  })
  .strict();
export type BusinessRate = z.infer<typeof businessRateSchema>;

export const defaultBusinessRate: BusinessRate = {
  incomeCents: 5_000_000,
  overheadCents: 500_000,
  taxPercent: 30,
  hoursPerWeek: 25,
  weeksPerYear: 46,
};

export type RateResult = {
  /** The least to charge an hour, rounded up to a whole dollar. */
  hourlyCents: number;
  /** What to bill in a year at exactly that need. */
  revenueCents: number;
  /** Profit before taxes, and what's set aside from it. */
  profitCents: number;
  taxCents: number;
  billableHours: number;
};

export function hourlyRate(input: BusinessRate): RateResult {
  const keep = 1 - input.taxPercent / 100;
  const profitCents = Math.round(input.incomeCents / keep);
  const revenueCents = profitCents + input.overheadCents;
  const billableHours = input.hoursPerWeek * input.weeksPerYear;
  return {
    hourlyCents: Math.ceil(revenueCents / billableHours / 100) * 100,
    revenueCents,
    profitCents,
    taxCents: profitCents - input.incomeCents,
    billableHours,
  };
}
