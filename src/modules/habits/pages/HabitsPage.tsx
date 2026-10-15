import { GraduationCap, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { primaryButton, secondaryButton } from "../../../client/components/ui";
import { useModules } from "../../../client/lib/queries";
import { useCommand, useOpenParam } from "../../../client/lib/useCommand";
import { useNow } from "../../../client/lib/useNow";
import { localDate } from "../../tasks/dates";
import { CheckButton, HabitCard, todayText } from "../components/HabitParts";
import { HabitSheet, type HabitTarget } from "../components/HabitSheet";
import { useHabits } from "../queries";

/** Habits on their schedules: what's left today, and how strong each one is. */
export function HabitsPage() {
  const habits = useHabits();
  const now = useNow();
  // Check-ins go by Hub's day, which the server sends as each habit's last day.
  const today = habits.data?.[0]?.days.at(-1)?.date ?? localDate(now);
  const modules = useModules();
  const [target, setTarget] = useState<HabitTarget>(null);
  const [message, setMessage] = useState("");
  useCommand("add-habit", () => setTarget({ mode: "new", kind: "check" }));
  useOpenParam(
    "habit",
    (id) => {
      const habit = habits.data?.find((item) => item.id === id);
      if (habit) setTarget({ mode: "edit", habit });
    },
    habits.data !== undefined,
  );

  const all = habits.data ?? [];
  const active = all.filter((habit) => !habit.archived);
  const archived = all.filter((habit) => habit.archived);
  const dueToday = active.filter((habit) => habit.scheduledToday);
  const left = dueToday.filter((habit) => !habit.doneToday).length;
  const hasStudy = all.some((habit) => habit.kind === "study");

  return (
    <>
      <PageHeader
        title="Habits"
        subtitle={
          habits.data
            ? active.length === 0
              ? "Add a habit to start building it."
              : left === 0
                ? "Everything's done for today."
                : `${left} left for today.`
            : undefined
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          onClick={() => setTarget({ mode: "new", kind: "check" })}
        >
          <Plus aria-hidden="true" className="size-5" />
          Add habit
        </button>
        {modules.courses && habits.data && !hasStudy ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setTarget({ mode: "new", kind: "study" })}
          >
            <GraduationCap aria-hidden="true" className="size-4" />
            Track study as a habit
          </button>
        ) : null}
      </div>
      <p role="status" className="mb-4 text-sm font-semibold text-ok empty:hidden">
        {message}
      </p>

      {habits.isPending ? (
        <LoadingRows rows={3} />
      ) : habits.isError ? (
        <ErrorNote error={habits.error} onRetry={() => void habits.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
          <Panel
            title="Today"
            description="Habits meant for today, and weekly ones still short of their count."
            className="lg:col-span-5"
          >
            {dueToday.length === 0 ? (
              <p className="text-muted">Nothing on for today.</p>
            ) : (
              <ul className="space-y-2">
                {dueToday.map((habit) => (
                  <li key={habit.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-semibold break-words text-fg">{habit.name}</span>
                      <span className="block text-sm text-muted">{todayText(habit)}</span>
                    </span>
                    <CheckButton habit={habit} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title="All habits"
            description="Strength rises with each check-in and dips for a miss, so one missed day doesn't undo the rest."
            className="lg:col-span-7"
          >
            {active.length === 0 ? (
              <p className="text-muted">
                No habits yet. Add one, like reading or a walk, and check it off each time.
              </p>
            ) : (
              <ul className="space-y-3">
                {active.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    today={today}
                    onOpen={() => setTarget({ mode: "edit", habit })}
                  />
                ))}
              </ul>
            )}
            {archived.length > 0 ? (
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
                  Archived ({archived.length})
                </summary>
                <ul className="mt-2 space-y-3">
                  {archived.map((habit) => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      today={today}
                      onOpen={() => setTarget({ mode: "edit", habit })}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
          </Panel>
        </div>
      )}

      <HabitSheet
        target={target}
        today={today}
        onClose={() => setTarget(null)}
        onSaved={(said) => {
          setTarget(null);
          setMessage(said);
        }}
      />
    </>
  );
}
