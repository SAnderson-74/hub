import { z } from "zod";

// Money owed back: part of a spending transaction someone else will repay, like their
// half of dinner or a cost paid for work. When the repayment comes in it's matched to
// what it pays back and counts as a refund in the original's category, so spending
// shows only your share, and tithing leaves it out.

const id = z.number().int().positive();
const amount = z
  .number()
  .int("Use whole cents.")
  .min(1, "Use an amount more than $0.")
  .max(10_000_000_000, "Use an amount under $100,000,000.");
const who = z.string().trim().max(60, "Keep the name under 60 characters.");

export const owedCreateSchema = z
  .object({ transactionId: id, amountCents: amount, who: who.default("") })
  .strict();
export type OwedCreate = z.input<typeof owedCreateSchema>;

export const owedUpdateSchema = z.object({ amountCents: amount, who }).partial().strict();
export type OwedUpdate = z.infer<typeof owedUpdateSchema>;

export const owedMatchSchema = z.object({ repaymentId: id }).strict();
export type OwedMatch = z.infer<typeof owedMatchSchema>;

/** How close a repayment's amount must be to count as a likely match, in cents. */
export const MATCH_TOLERANCE_CENTS = 100;
