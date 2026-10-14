import { z } from "zod";
import type { Repeats } from "./categorize";
import { addDays, addMonths } from "./recurrence";

// Bills, subscriptions, and repeating income. Hub suggests them from transactions that
// repeat; once confirmed, each has a schedule (its next date steps forward by its
// frequency) and, when it came from transactions, the payee it matches, so Hub can
// tell when one arrives, changes price, or doesn't come.

export const BILL_KINDS = ["bill", "subscription", "income"] as const;
export type BillKind = (typeof BILL_KINDS)[number];

export const BILL_KIND_LABELS: Record<BillKind, string> = {
  bill: "Bill",
  subscription: "Subscription",
  income: "Income",
};

export const BILL_FREQUENCIES = ["weekly", "biweekly", "monthly", "yearly"] as const;
export type BillFrequency = (typeof BILL_FREQUENCIES)[number];

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every two weeks",
  monthly: "Every month",
  yearly: "Every year",
};

/** How many times a year each comes. */
export const PER_YEAR: Record<BillFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  yearly: 1,
};

/** How many days early or late a payment still counts as this one. */
export const MATCH_DAYS: Record<BillFrequency, number> = {
  weekly: 2,
  biweekly: 3,
  monthly: 5,
  yearly: 15,
};

/** The date after `date` on the schedule. Monthly and yearly keep the day of the month. */
export function nextBillDate(date: string, frequency: BillFrequency, monthDay?: number): string {
  if (frequency === "weekly") return addDays(date, 7);
  if (frequency === "biweekly") return addDays(date, 14);
  return addMonths(date, frequency === "monthly" ? 1 : 12, monthDay);
}

/** Every scheduled date from `first` that falls within `from`..`to`. */
export function billDates(
  first: string,
  frequency: BillFrequency,
  from: string,
  to: string,
): string[] {
  const monthDay = Number(first.slice(8, 10));
  const dates: string[] = [];
  let date = first;
  // A thousand steps covers about twenty years of weekly bills.
  for (let step = 0; step < 1000 && date <= to; step += 1) {
    if (date >= from) dates.push(date);
    date = nextBillDate(date, frequency, monthDay);
  }
  return dates;
}

export function frequencyOf(every: Repeats["every"]): BillFrequency {
  return every === "week"
    ? "weekly"
    : every === "two weeks"
      ? "biweekly"
      : every === "month"
        ? "monthly"
        : "yearly";
}

/** Whether a payment of `cents` is a price change from the usual `typicalCents`. */
export function priceChanged(typicalCents: number, cents: number): boolean {
  return Math.abs(Math.abs(cents) - typicalCents) > Math.max(100, typicalCents * 0.05);
}

/** The yearly cost of subscriptions, in cents. */
export function yearlyCents(
  bills: ReadonlyArray<{ kind: BillKind; frequency: BillFrequency; amountCents: number }>,
  kind: BillKind,
): number {
  return bills
    .filter((bill) => bill.kind === kind)
    .reduce((sum, bill) => sum + bill.amountCents * PER_YEAR[bill.frequency], 0);
}

const id = z.number().int().positive();
const name = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(100, "Keep names under 100 characters.");
const date = z.iso.date("Use a date like 2030-01-31.");
const amount = z
  .number()
  .int()
  .min(1, "Use an amount more than $0.")
  .max(100_000_000, "Use an amount under $1,000,000.");

export const billCreateSchema = z
  .object({
    bookId: id,
    name,
    kind: z.enum(BILL_KINDS),
    /** Its usual amount, always positive; income adds and the rest take away. */
    amountCents: amount,
    frequency: z.enum(BILL_FREQUENCIES),
    nextDate: date,
    accountId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
    /** The payee group it was found from (src/shared/payees.ts), to match payments. */
    matchKey: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
export type BillCreate = z.infer<typeof billCreateSchema>;

export const billUpdateSchema = z
  .object({
    name,
    kind: z.enum(BILL_KINDS),
    amountCents: amount,
    frequency: z.enum(BILL_FREQUENCIES),
    nextDate: date,
    accountId: id.nullable(),
    categoryId: id.nullable(),
  })
  .partial()
  .strict();
export type BillUpdate = z.infer<typeof billUpdateSchema>;

/** "Not a bill": a suggestion that shouldn't come back. */
export const billDismissSchema = z
  .object({ bookId: id, matchKey: z.string().min(1).max(200), name })
  .strict();
export type BillDismiss = z.infer<typeof billDismissSchema>;

export const FORECAST_DAYS = [30, 60, 90] as const;

export const forecastQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
  days: z.coerce
    .number()
    .refine(
      (value) => (FORECAST_DAYS as readonly number[]).includes(value),
      "Use 30, 60, or 90 days.",
    )
    .default(30),
});
