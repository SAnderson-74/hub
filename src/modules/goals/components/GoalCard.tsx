import { Flag } from "lucide-react";
import { GOAL_STATUS_LABELS } from "../../../shared/goals";
import { type DueTone, describeDue, formatShortDate } from "../../tasks/dates";
import type { GoalItem } from "../queries";

const toneClass: Record<DueTone, string> = {
  danger: "text-danger",
  warn: "text-warn",
  muted: "text-muted",
};

/** A thin bar with its value as text next to it; color never carries meaning alone. */
export function ProgressBar({
  percent,
  label,
  achieved = false,
}: {
  percent: number;
  label: string;
  achieved?: boolean;
}) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="block h-2 w-full overflow-hidden rounded-full bg-surface-0"
    >
      <span
        className={`block h-full rounded-full ${achieved ? "bg-ok" : "bg-accent"}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

/** When the goal is due, or how it ended. */
export function goalWhen(goal: GoalItem, today: string): { text: string; tone: DueTone } | null {
  if (goal.status !== "active") {
    const when = goal.closedAt ? `, ${formatShortDate(goal.closedAt.slice(0, 10), today)}` : "";
    return { text: `${GOAL_STATUS_LABELS[goal.status]}${when}`, tone: "muted" };
  }
  if (!goal.targetDate) return null;
  const due = describeDue(goal.targetDate, today);
  return { text: due.label, tone: due.tone };
}

export function GoalCard({
  goal,
  today,
  onOpen,
}: {
  goal: GoalItem;
  today: string;
  onOpen: () => void;
}) {
  const when = goalWhen(goal, today);
  const next = goal.milestones.find((milestone) => !milestone.done);
  const achieved = goal.status === "achieved";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-tile bg-base/80 p-4 text-left ring-1 ring-surface-0/50 hover:ring-surface-1"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-semibold break-words text-fg">{goal.title}</span>
          {when ? (
            <span className={`shrink-0 text-sm font-semibold ${toneClass[when.tone]}`}>
              {when.text}
            </span>
          ) : null}
        </span>
        <span className="mt-3 flex items-center gap-3">
          <ProgressBar
            percent={goal.progress.percent}
            label={`${goal.title} progress`}
            achieved={achieved}
          />
          <span className="w-10 shrink-0 text-right text-sm font-semibold text-fg tabular-nums">
            {goal.progress.percent}%
          </span>
        </span>
        <span className="mt-2 block text-sm text-muted">{goal.progress.summary}</span>
        {next && goal.status === "active" ? (
          <span className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Flag aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              Next: {next.title}
              {next.targetDate ? `, ${formatShortDate(next.targetDate, today)}` : ""}
            </span>
          </span>
        ) : null}
      </button>
    </li>
  );
}
