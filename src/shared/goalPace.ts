import { z } from "zod";
import { formatCents } from "./money";
import { addDays, daysBetween } from "./recurrence";

// A goal's pace: from where it started (its first check-in, or 0% when it was added) to
// where it is now, whether it's on track for its date, when it would finish at this
// rate, and what each week needs to make the date.

export const goalCheckinSchema = z
  .object({ note: z.string().trim().max(1_000, "Keep check-in notes under 1,000 characters.") })
  .strict();
export type GoalCheckinCreate = z.infer<typeof goalCheckinSchema>;

export type PaceState = "done" | "ahead" | "on_track" | "behind" | "unknown";

export const PACE_LABELS: Record<PaceState, string> = {
  done: "Done",
  ahead: "Ahead",
  on_track: "On track",
  behind: "Behind",
  unknown: "Too early to tell",
};

export type Pace = {
  state: PaceState;
  /** When it would reach 100% at the pace so far, or null when it isn't moving. */
  projectedDate: string | null;
  /** What each week needs to finish by the target date. Null without a date, or when done. */
  perWeek: { percent: number; cents: number | null; milestones: number | null } | null;
  /** One sentence on it. */
  summary: string;
};

/** How far behind the straight line to the date still counts as on track, in points. */
const SLACK = 5;
/** How far ahead of it counts as ahead. */
const LEAD = 10;
/** Fewer days than this since the start say too little about a pace. */
const MIN_DAYS = 7;

export function goalPace(input: {
  today: string;
  /** When the goal was added, as a date. */
  start: string;
  percent: number;
  targetDate: string | null;
  /** Check-ins, any order. */
  checkins: ReadonlyArray<{ date: string; percent: number }>;
  /** For an amount goal: the amount saved and the target. */
  amount?: { currentCents: number; targetCents: number } | null;
  milestonesLeft?: number | null;
  formatDate: (date: string) => string;
}): Pace {
  const { today, percent, targetDate, formatDate } = input;
  if (percent >= 100)
    return { state: "done", projectedDate: null, perWeek: null, summary: "Done." };

  // Milestones, tasks, and a set percent all start at 0% when the goal is added. An amount
  // may already be part saved then, so its first check-in says where it really stood.
  const first = [...input.checkins].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const base = input.amount && first ? first : { date: input.start, percent: 0 };
  const days = daysBetween(base.date, today);
  const gained = percent - base.percent;
  const rate = days >= MIN_DAYS && gained > 0 ? gained / days : null;
  const projectedDate = rate ? addDays(today, Math.ceil((100 - percent) / rate)) : null;

  let perWeek: Pace["perWeek"] = null;
  if (targetDate && targetDate > today) {
    const weeks = Math.max(1, daysBetween(today, targetDate) / 7);
    perWeek = {
      percent: Math.ceil((100 - percent) / weeks),
      cents: input.amount
        ? Math.ceil(
            Math.max(0, input.amount.targetCents - input.amount.currentCents) / weeks / 100,
          ) * 100
        : null,
      milestones: input.milestonesLeft
        ? Math.round((input.milestonesLeft / weeks) * 10) / 10
        : null,
    };
  }

  let state: PaceState = "unknown";
  if (targetDate) {
    if (targetDate <= today) state = "behind";
    else {
      const span = daysBetween(base.date, targetDate);
      const expected = span > 0 ? base.percent + ((100 - base.percent) * days) / span : 100;
      state =
        percent >= expected + LEAD ? "ahead" : percent >= expected - SLACK ? "on_track" : "behind";
      // A few days in is too soon to say.
      if (days < MIN_DAYS) state = "unknown";
    }
  } else if (rate) {
    state = "on_track";
  }

  const need =
    perWeek === null
      ? ""
      : perWeek.cents !== null
        ? `${formatCents(perWeek.cents)} a week`
        : perWeek.milestones !== null
          ? `${perWeek.milestones} ${perWeek.milestones === 1 ? "milestone" : "milestones"} a week`
          : `${perWeek.percent}% a week`;
  const parts: string[] = [];
  if (targetDate && targetDate <= today)
    parts.push(`Its date, ${formatDate(targetDate)}, has passed.`);
  else if (targetDate && need)
    parts.push(`Needs about ${need} to finish by ${formatDate(targetDate)}.`);
  if (projectedDate) parts.push(`At this pace, done around ${formatDate(projectedDate)}.`);
  else if (days < MIN_DAYS) parts.push("Check in again in a week or so to see its pace.");
  else parts.push("No progress since it started, so there's no pace yet.");
  return { state, projectedDate, perWeek, summary: parts.join(" ") };
}
