import { type LeadStatus, OPEN_LEAD_STATUSES } from "../../shared/business";
import { formatCents } from "../../shared/money";
import { daysBetween } from "../tasks/dates";

type StepCost = { done: boolean; estimateCents: number | null; spentCents: number | null };

export type PlanTotals = {
  steps: number;
  done: number;
  estimateCents: number;
  spentCents: number;
  /** Estimates of unfinished steps, less what's already spent on them. */
  leftCents: number;
};

export function planTotals(steps: readonly StepCost[]): PlanTotals {
  const totals = { steps: 0, done: 0, estimateCents: 0, spentCents: 0, leftCents: 0 };
  for (const step of steps) {
    totals.steps += 1;
    if (step.done) totals.done += 1;
    totals.estimateCents += step.estimateCents ?? 0;
    totals.spentCents += step.spentCents ?? 0;
    if (!step.done) {
      totals.leftCents += Math.max(0, (step.estimateCents ?? 0) - (step.spentCents ?? 0));
    }
  }
  return totals;
}

/** "2 of 5 done · $1,200 estimated · $400 spent" */
export function phaseLine(totals: PlanTotals): string {
  if (totals.steps === 0) return "No steps yet";
  return [
    `${totals.done} of ${totals.steps} done`,
    totals.estimateCents > 0 ? `${formatCents(totals.estimateCents)} estimated` : "",
    totals.spentCents > 0 ? `${formatCents(totals.spentCents)} spent` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export type ExpiryTone = "danger" | "warn" | "muted";

/** A certification's expiry: past, within 90 days, or later. null without a date. */
export function expiryStatus(
  expiresOn: string | null,
  today: string,
): { tone: ExpiryTone; expired: boolean; soon: boolean } | null {
  if (!expiresOn) return null;
  const days = daysBetween(today, expiresOn);
  if (days < 0) return { tone: "danger", expired: true, soon: false };
  if (days <= 90) return { tone: "warn", expired: false, soon: true };
  return { tone: "muted", expired: false, soon: false };
}

type LeadValue = { status: LeadStatus; valueCents: number | null };

export function leadTotals(leads: readonly LeadValue[]) {
  let open = 0;
  let openCents = 0;
  let wonCents = 0;
  for (const lead of leads) {
    if (OPEN_LEAD_STATUSES.includes(lead.status)) {
      open += 1;
      openCents += lead.valueCents ?? 0;
    } else if (lead.status === "won") wonCents += lead.valueCents ?? 0;
  }
  return { open, openCents, wonCents };
}
