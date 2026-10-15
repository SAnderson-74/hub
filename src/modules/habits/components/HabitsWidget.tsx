import { Link } from "react-router";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { useHabits } from "../queries";
import { CheckButton, todayText } from "./HabitParts";
import { HeatMap } from "./HeatMap";

/** Home: today's habits with their check-offs, and each one's strength. */
export function HabitsWidget({ className }: { className?: string }) {
  const habits = useHabits();
  const active = (habits.data ?? []).filter((habit) => !habit.archived);
  const today = active[0]?.days.at(-1)?.date ?? "";
  const due = active.filter((habit) => habit.scheduledToday);
  return (
    <Panel
      title="Habits"
      action={
        <Link
          to="/habits"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline"
        >
          All habits
        </Link>
      }
      className={className}
    >
      {habits.isPending ? (
        <LoadingRows rows={2} />
      ) : habits.isError ? (
        <ErrorNote error={habits.error} onRetry={() => void habits.refetch()} />
      ) : active.length === 0 ? (
        <p className="text-sm text-muted">No habits yet. Add one on the Habits page.</p>
      ) : due.length === 0 ? (
        <p className="text-sm text-muted">Nothing on for today.</p>
      ) : (
        <ul className="space-y-3">
          {due.map((habit) => (
            <li key={habit.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold break-words text-fg">{habit.name}</span>
                  <span className="block text-sm text-muted tabular-nums">
                    {todayText(habit)} · strength {habit.strength}
                  </span>
                </span>
                <CheckButton habit={habit} today={today} />
              </div>
              <HeatMap days={habit.days.slice(-28)} label={habit.name} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
