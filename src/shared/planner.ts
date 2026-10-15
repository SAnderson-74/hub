import { z } from "zod";
import { daysBetween } from "./recurrence";

// The calendar of everything dated, and the weekly review: a checklist across the
// modules, each step with a count and a link to where it's fixed.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2030-01-31.");

/** Six weeks of a month grid, plus a little room. */
export const CALENDAR_MAX_DAYS = 62;

export const calendarQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((range) => range.from <= range.to, "Start on or before the end.")
  .refine(
    (range) => daysBetween(range.from, range.to) < CALENDAR_MAX_DAYS,
    `Ask for at most ${CALENDAR_MAX_DAYS} days at a time.`,
  );

export const CALENDAR_KIND_LABELS: Record<string, string> = {
  task: "Task",
  goal: "Goal",
  milestone: "Milestone",
  assessment: "Assessment",
  "business step": "Business step",
  lead: "Lead follow-up",
  bill: "Bill",
  income: "Income",
};

export const REVIEW_STEP_IDS = [
  "overdue",
  "inbox",
  "someday",
  "week-ahead",
  "goals",
  "assessments",
  "resale-review",
  "resale-aging",
  "uncategorized",
  "bills",
  "leads",
  "time",
] as const;
export type ReviewStepId = (typeof REVIEW_STEP_IDS)[number];

/**
 * "fix" steps are clear once their count is 0, so there's nothing to tick. "look"
 * steps are a look over something, ticked off by hand.
 */
export type ReviewStepKind = "fix" | "look";

export const reviewStepParamSchema = z.object({ step: z.enum(REVIEW_STEP_IDS) });
export const reviewStepUpdateSchema = z.object({ done: z.boolean() }).strict();
export const reviewFinishSchema = z.object({ finished: z.boolean() }).strict();
