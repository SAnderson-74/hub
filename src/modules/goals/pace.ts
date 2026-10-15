import type { Tone } from "../../client/components/StatusDot";
import { goalPace, type Pace, type PaceState } from "../../shared/goalPace";
import { formatShortDate, localDate } from "../tasks/dates";
import type { GoalItem } from "./queries";

export const PACE_TONES: Record<PaceState, Tone> = {
  done: "ok",
  ahead: "ok",
  on_track: "ok",
  behind: "warn",
  unknown: "idle",
};

/** An active goal's pace, from its progress, target, and check-ins. */
export function paceOf(goal: GoalItem, today: string): Pace {
  const done = goal.milestones.filter((milestone) => milestone.done).length;
  return goalPace({
    today,
    start: localDate(new Date(goal.createdAt)),
    percent: goal.progress.percent,
    targetDate: goal.targetDate,
    checkins: goal.checkins,
    amount:
      goal.progressMode === "amount" && goal.targetCents
        ? { currentCents: goal.currentCents, targetCents: goal.targetCents }
        : null,
    milestonesLeft: goal.progressMode === "milestones" ? goal.milestones.length - done : null,
    formatDate: (date) => formatShortDate(date, today),
  });
}
