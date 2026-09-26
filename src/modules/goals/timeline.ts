import { daysBetween } from "../../shared/recurrence";

type MilestoneLike = { id: number; title: string; targetDate: string | null; done: boolean };
type GoalLike = {
  id: number;
  title: string;
  targetDate: string | null;
  status: "active" | "achieved" | "dropped";
  milestones: MilestoneLike[];
};

export type TimelineState = "done" | "overdue" | "today" | "upcoming";

export type TimelineItem =
  | {
      kind: "goal" | "milestone";
      key: string;
      goalId: number;
      goalTitle: string;
      title: string;
      date: string;
      state: TimelineState;
    }
  | { kind: "today"; key: "today"; date: string };

export type TimelineMonth = { key: string; label: string; items: TimelineItem[] };

function stateFor(date: string, done: boolean, today: string): TimelineState {
  if (done) return "done";
  const days = daysBetween(today, date);
  if (days < 0) return "overdue";
  return days === 0 ? "today" : "upcoming";
}

/**
 * Dated goals and milestones in date order, grouped by month, with a "today" marker
 * placed before anything due today. Dropped goals and undated items are left out.
 */
export function buildTimeline(goals: GoalLike[], today: string): TimelineMonth[] {
  const items: TimelineItem[] = [{ kind: "today", key: "today", date: today }];
  for (const goal of goals) {
    if (goal.status === "dropped") continue;
    if (goal.targetDate) {
      items.push({
        kind: "goal",
        key: `goal-${goal.id}`,
        goalId: goal.id,
        goalTitle: goal.title,
        title: goal.title,
        date: goal.targetDate,
        state: stateFor(goal.targetDate, goal.status === "achieved", today),
      });
    }
    for (const milestone of goal.milestones) {
      if (!milestone.targetDate) continue;
      items.push({
        kind: "milestone",
        key: `milestone-${milestone.id}`,
        goalId: goal.id,
        goalTitle: goal.title,
        title: milestone.title,
        date: milestone.targetDate,
        state: stateFor(milestone.targetDate, milestone.done || goal.status === "achieved", today),
      });
    }
  }
  // Same day: the marker first, then milestones before the goal they lead to.
  const rank = { today: 0, milestone: 1, goal: 2 } as const;
  items.sort((a, b) => a.date.localeCompare(b.date) || rank[a.kind] - rank[b.kind]);

  const months: TimelineMonth[] = [];
  for (const item of items) {
    const key = item.date.slice(0, 7);
    let month = months.at(-1);
    if (month?.key !== key) {
      month = { key, label: monthLabel(key), items: [] };
      months.push(month);
    }
    month.items.push(item);
  }
  return months;
}

function monthLabel(key: string): string {
  const [year = 1970, month = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
