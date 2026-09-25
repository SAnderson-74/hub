import { CircleCheck, Flag, Target } from "lucide-react";
import { formatShortDate } from "../../tasks/dates";
import type { TimelineMonth, TimelineState } from "../timeline";

const stateText: Record<TimelineState, { label: string; className: string }> = {
  done: { label: "Done", className: "text-ok" },
  overdue: { label: "Overdue", className: "text-danger" },
  today: { label: "Due today", className: "text-warn" },
  upcoming: { label: "Upcoming", className: "text-muted" },
};

/** Goals and milestones down a line by date, with where today falls. */
export function Timeline({
  months,
  today,
  onOpenGoal,
}: {
  months: TimelineMonth[];
  today: string;
  onOpenGoal: (id: number) => void;
}) {
  return (
    <div className="space-y-8">
      {months.map((month) => (
        <section key={month.key} aria-labelledby={`month-${month.key}`}>
          <h2 id={`month-${month.key}`} className="mb-3 px-1 font-semibold text-fg">
            {month.label}
          </h2>
          <ol className="relative space-y-2 border-l-2 border-surface-0 pl-5 ml-3">
            {month.items.map((item) => {
              if (item.kind === "today") {
                return (
                  <li key={item.key} className="relative flex items-center gap-3 py-1">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[27px] size-3 rounded-full bg-accent ring-4 ring-base"
                    />
                    <span className="h-0.5 flex-1 rounded-full bg-accent/60" aria-hidden="true" />
                    <span className="text-sm font-bold text-accent-text">
                      Today is {formatShortDate(item.date, today)}
                    </span>
                  </li>
                );
              }
              const state = stateText[item.state];
              const Icon =
                item.state === "done" ? CircleCheck : item.kind === "goal" ? Target : Flag;
              return (
                <li key={item.key} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[27px] top-4 size-3 rounded-full ring-4 ring-base ${
                      item.kind === "goal" ? "bg-fg" : "bg-surface-2"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onOpenGoal(item.goalId)}
                    className="flex min-h-11 w-full items-start gap-3 rounded-tile bg-base/80 px-4 py-3 text-left ring-1 ring-surface-0/50 hover:ring-surface-1"
                  >
                    <Icon
                      aria-hidden="true"
                      className={`mt-0.5 size-4 shrink-0 ${state.className}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words text-fg">{item.title}</span>
                      <span className="block text-sm text-muted">
                        {item.kind === "goal" ? "Goal" : `Milestone for ${item.goalTitle}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block font-semibold text-fg tabular-nums">
                        {formatShortDate(item.date, today)}
                      </span>
                      <span className={`block font-semibold ${state.className}`}>
                        {state.label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
