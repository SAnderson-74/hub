import { ChartNoAxesGantt, ChevronDown, Plus, Target } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { primaryButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { localDate } from "../../tasks/dates";
import { GoalCard } from "../components/GoalCard";
import { GoalSheet } from "../components/GoalSheet";
import { NewGoalSheet } from "../components/NewGoalSheet";
import { Timeline } from "../components/Timeline";
import { useGoals } from "../queries";
import { buildTimeline } from "../timeline";

type View = "goals" | "timeline";
const VIEW_KEY = "hub.goals.view";

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "timeline" ? "timeline" : "goals";
  } catch {
    return "goals";
  }
}

export function GoalsPage() {
  const goals = useGoals();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const today = localDate(useNow());
  const [view, setView] = useState<View>(storedView);
  const [creating, setCreating] = useState(false);
  const openGoalId = Number(params.get("goal")) || null;

  // Opening a goal adds a history entry so the phone's back gesture closes the sheet.
  const openGoal = (id: number) => {
    const next = new URLSearchParams(params);
    next.set("goal", String(id));
    if (openGoalId === null) navigate({ search: next.toString() }, { state: { sheet: true } });
    else setParams(next, { replace: true, state: location.state });
  };
  const closeGoal = () => {
    if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete("goal");
      setParams(next, { replace: true });
    }
  };

  const all = goals.data ?? [];
  const active = all.filter((goal) => goal.status === "active");
  const closed = all.filter((goal) => goal.status !== "active");

  return (
    <>
      <PageHeader
        title="Goals"
        subtitle={
          goals.data
            ? active.length === 0
              ? "No active goals. Start one below."
              : `${active.length} active${closed.length > 0 ? `, ${closed.length} achieved or dropped` : ""}.`
            : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex rounded-full bg-mantle p-1 ring-1 ring-surface-0/60">
          <legend className="sr-only">View</legend>
          {(
            [
              ["goals", "Goals", Target],
              ["timeline", "Timeline", ChartNoAxesGantt],
            ] as const
          ).map(([value, label, Icon]) => (
            <label key={value} className="relative">
              <input
                type="radio"
                name="goal-view"
                value={value}
                checked={view === value}
                onChange={() => {
                  setView(value);
                  try {
                    localStorage.setItem(VIEW_KEY, value);
                  } catch {
                    // Private browsing; the choice still applies to this visit.
                  }
                }}
                className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
              />
              <span className="pointer-events-none flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg">
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </span>
            </label>
          ))}
        </fieldset>
        <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" className="size-5" />
          New goal
        </button>
      </div>

      {goals.isPending ? (
        <LoadingRows rows={3} />
      ) : goals.isError ? (
        <ErrorNote error={goals.error} onRetry={() => void goals.refetch()} />
      ) : view === "timeline" ? (
        <>
          <Timeline months={buildTimeline(all, today)} today={today} onOpenGoal={openGoal} />
          <p className="mt-6 text-sm text-muted">
            Goals and milestones without a target date aren't on the timeline.
          </p>
        </>
      ) : (
        <div className="space-y-6">
          {active.length === 0 ? (
            <p className="rounded-tile bg-mantle p-5 text-muted ring-1 ring-surface-0/60">
              Goals track something you want to reach by a date, through milestones, tasks, an
              amount, or your own estimate.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {active.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  today={today}
                  onOpen={() => openGoal(goal.id)}
                />
              ))}
            </ul>
          )}
          {closed.length > 0 ? (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-1 font-semibold text-fg [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 text-muted transition-transform group-open:rotate-180"
                />
                Achieved and dropped
                <span className="text-sm text-muted tabular-nums">{closed.length}</span>
              </summary>
              <ul className="mt-2 grid gap-3 md:grid-cols-2">
                {closed.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    today={today}
                    onOpen={() => openGoal(goal.id)}
                  />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}

      <GoalSheet goalId={openGoalId} onClose={closeGoal} />
      <NewGoalSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          openGoal(id);
        }}
      />
    </>
  );
}
