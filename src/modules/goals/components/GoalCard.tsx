import { Flag } from "lucide-react";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { StatusDot } from "../../../client/components/StatusDot";
import { PACE_LABELS } from "../../../shared/goalPace";
import { GOAL_STATUS_LABELS } from "../../../shared/goals";
import { type DueTone, describeDue, formatShortDate } from "../../tasks/dates";
import { PACE_TONES, paceOf } from "../pace";
import type { GoalItem } from "../queries";

/** "On track · done around Jun 2", or "Behind · needs 8% a week". */
function PaceLine({ goal, today }: { goal: GoalItem; today: string }) {
  const pace = paceOf(goal, today);
  if (pace.state === "unknown" && !pace.projectedDate) return null;
  const detail = pace.projectedDate
    ? `done around ${formatShortDate(pace.projectedDate, today)}`
    : pace.perWeek
      ? `needs ${pace.perWeek.percent}% a week`
      : "";
  return (
    <span className="mt-1 flex items-center gap-1.5 text-sm text-muted">
      <StatusDot tone={PACE_TONES[pace.state]} />
      <span className="min-w-0 truncate">
        {PACE_LABELS[pace.state]}
        {detail ? ` · ${detail}` : ""}
      </span>
    </span>
  );
}

const toneClass: Record<DueTone, string> = {
  danger: "text-danger",
  warn: "text-warn",
  muted: "text-muted",
};

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
            complete={achieved}
          />
          <span className="w-10 shrink-0 text-right text-sm font-semibold text-fg tabular-nums">
            {goal.progress.percent}%
          </span>
        </span>
        <span className="mt-2 block text-sm break-words text-muted">
          {goal.progress.summary}
          {goal.progressMode === "amount" && goal.accounts.length > 0
            ? ` in ${goal.accounts.map((account) => account.name).join(" and ")}`
            : ""}
        </span>
        {goal.status === "active" ? <PaceLine goal={goal} today={today} /> : null}
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
