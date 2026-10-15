import { Check } from "lucide-react";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { scheduleText, strengthLabel } from "../../../shared/habits";
import { formatMinutes } from "../../../shared/time";
import { type Habit, useCheckin } from "../queries";
import { HeatMap } from "./HeatMap";

/** "4-day streak", "2 weeks in a row" */
export function streakText(habit: Pick<Habit, "streak" | "streakUnit">): string {
  if (habit.streak === 0) return "No streak yet";
  return habit.streakUnit === "week"
    ? `${habit.streak} ${habit.streak === 1 ? "week" : "weeks"} in a row`
    : `${habit.streak}-day streak`;
}

/** What today still needs: "1 of 3 this week", "20 of 30 min studied". */
export function todayText(habit: Habit): string {
  if (habit.study) {
    return habit.doneToday
      ? `${formatMinutes(habit.study.todayMinutes)} studied today`
      : `${formatMinutes(habit.study.todayMinutes)} of ${formatMinutes(habit.study.minimum)} studied today`;
  }
  if (habit.schedule.kind === "weekly")
    return `${habit.weekCount} of ${habit.weekTarget} this week`;
  return habit.doneToday ? "Done today" : "Not done yet today";
}

/** Checks a habit off for today, or takes it back. The study habit checks itself off. */
export function CheckButton({ habit, today }: { habit: Habit; today: string }) {
  const checkin = useCheckin();
  if (habit.kind === "study") {
    return (
      <span
        className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
          habit.doneToday ? "bg-accent text-on-accent" : "text-muted ring-1 ring-surface-1"
        }`}
      >
        {habit.doneToday ? <Check aria-hidden="true" className="size-4" /> : null}
        {habit.doneToday ? "Done" : "From study time"}
      </span>
    );
  }
  const done = habit.doneToday;
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={done ? `${habit.name}: done today` : `${habit.name}: check off for today`}
      disabled={checkin.isPending}
      onClick={() => checkin.mutate({ id: habit.id, date: today, done: !done })}
      className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
        done ? "bg-accent text-on-accent" : "text-fg ring-1 ring-surface-1 hover:bg-surface-0"
      }`}
    >
      <Check aria-hidden="true" className="size-4" />
      {done ? "Done" : "Check off"}
    </button>
  );
}

/** A habit with its strength, streak, schedule, and twelve weeks of days. */
export function HabitCard({
  habit,
  today,
  onOpen,
}: {
  habit: Habit;
  today: string;
  onOpen: () => void;
}) {
  return (
    <li className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 rounded-control text-left hover:underline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <span className="block font-semibold break-words text-fg">{habit.name}</span>
          <span className="block text-sm text-muted">
            {[scheduleText(habit.schedule), todayText(habit)].join(" · ")}
          </span>
        </button>
        {habit.archived ? null : <CheckButton habit={habit} today={today} />}
      </div>
      <div className="space-y-1">
        <ProgressBar
          percent={habit.strength}
          label={`${habit.name}: strength ${habit.strength} of 100`}
        />
        <p className="text-sm text-muted tabular-nums">
          Strength {habit.strength} · {strengthLabel(habit.strength)} · {streakText(habit)}
        </p>
      </div>
      <HeatMap days={habit.days} label={habit.name} />
    </li>
  );
}
