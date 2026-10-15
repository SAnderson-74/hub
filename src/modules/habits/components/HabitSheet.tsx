import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { type HabitSchedule, WEEKDAY_SHORT } from "../../../shared/habits";
import { addDays } from "../../../shared/recurrence";
import { formatShortDate } from "../../tasks/dates";
import {
  type Habit,
  useCheckin,
  useCreateHabit,
  useDeleteHabit,
  useHabits,
  useUpdateHabit,
} from "../queries";

export type HabitTarget =
  | { mode: "new"; kind: "check" | "study" }
  | { mode: "edit"; habit: Habit }
  | null;

type Often = HabitSchedule["kind"];

const OFTEN: ReadonlyArray<readonly [Often, string]> = [
  ["daily", "Every day"],
  ["days", "On certain days"],
  ["weekly", "A few times a week"],
];

/** Adding or changing a habit, and filling in days it was done but not checked off. */
export function HabitSheet({
  target,
  today,
  onClose,
  onSaved,
}: {
  target: HabitTarget;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const habit = target?.mode === "edit" ? target.habit : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={
        habit
          ? "Habit"
          : target?.mode === "new" && target.kind === "study"
            ? "Add the study habit"
            : "Add a habit"
      }
    >
      {target ? (
        <HabitForm
          key={habit?.id ?? `new-${target.mode === "new" ? target.kind : ""}`}
          target={target}
          today={today}
          onSaved={onSaved}
        />
      ) : null}
    </Sheet>
  );
}

function HabitForm({
  target,
  today,
  onSaved,
}: {
  target: Exclude<HabitTarget, null>;
  today: string;
  onSaved: (message: string) => void;
}) {
  const ids = useId();
  const habit = target.mode === "edit" ? target.habit : null;
  const kind = habit?.kind ?? (target.mode === "new" ? target.kind : "check");
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();
  const [name, setName] = useState(habit?.name ?? (kind === "study" ? "Study" : ""));
  const [often, setOften] = useState<Often>(habit?.schedule.kind ?? "daily");
  const [days, setDays] = useState<number[]>(
    habit?.schedule.kind === "days" ? habit.schedule.days : [0, 2, 4],
  );
  const [times, setTimes] = useState(habit?.schedule.kind === "weekly" ? habit.schedule.times : 3);
  const [remind, setRemind] = useState(habit?.remindAt != null);
  const [remindAt, setRemindAt] = useState(habit?.remindAt ?? "20:00");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameBad = name.trim() === "";
  const daysBad = often === "days" && days.length === 0;
  const error = create.error ?? update.error ?? remove.error;
  const busy = create.isPending || update.isPending || remove.isPending;

  const schedule = (): HabitSchedule =>
    often === "daily"
      ? { kind: "daily" }
      : often === "days"
        ? { kind: "days", days }
        : { kind: "weekly", times };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (nameBad || daysBad) return;
    const fields = { name: name.trim(), schedule: schedule(), remindAt: remind ? remindAt : null };
    if (habit) {
      update.mutate(
        { id: habit.id, patch: fields },
        { onSuccess: () => onSaved(`Saved ${fields.name}`) },
      );
    } else {
      create.mutate({ ...fields, kind }, { onSuccess: () => onSaved(`Added ${fields.name}`) });
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Name
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            maxLength={80}
            placeholder="Read 20 pages"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={tried && nameBad}
            aria-describedby={tried && nameBad ? `${ids}-name-error` : undefined}
            className={inputClass}
          />
          {tried && nameBad ? (
            <p id={`${ids}-name-error`} className="mt-1.5 text-sm text-danger">
              Give the habit a name.
            </p>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className={labelClass}>How often</legend>
          {OFTEN.map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name={`${ids}-often`}
                value={value}
                checked={often === value}
                onChange={() => setOften(value)}
                className="size-5 shrink-0 accent-accent"
              />
              <span className="font-semibold text-fg">{label}</span>
            </label>
          ))}
        </fieldset>

        {often === "days" ? (
          <fieldset>
            <legend className={labelClass}>On</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_SHORT.map((label, day) => (
                <label key={label} className="relative">
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={(event) =>
                      setDays(
                        event.target.checked
                          ? [...days, day].sort()
                          : days.filter((value) => value !== day),
                      )
                    }
                    className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                  />
                  <span className="pointer-events-none flex h-11 min-w-12 items-center justify-center rounded-full px-3 text-sm font-semibold text-muted ring-1 ring-surface-1 peer-checked:bg-accent peer-checked:text-on-accent peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                    {label}
                  </span>
                </label>
              ))}
            </div>
            {tried && daysBad ? (
              <p className="mt-1.5 text-sm text-danger">Pick at least one day.</p>
            ) : null}
          </fieldset>
        ) : null}

        {often === "weekly" ? (
          <div>
            <label htmlFor={`${ids}-times`} className={labelClass}>
              Times a week
            </label>
            <select
              id={`${ids}-times`}
              value={String(times)}
              onChange={(event) => setTimes(Number(event.target.value))}
              className={`${inputClass} max-w-40`}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={remind}
              onChange={(event) => setRemind(event.target.checked)}
              className="size-5 shrink-0 accent-accent"
            />
            <span className="font-semibold text-fg">Remind me if it's not done</span>
          </label>
          {remind ? (
            <div>
              <label htmlFor={`${ids}-time`} className={labelClass}>
                At
              </label>
              <input
                id={`${ids}-time`}
                type="time"
                value={remindAt}
                onChange={(event) => setRemindAt(event.target.value || "20:00")}
                aria-describedby={`${ids}-time-hint`}
                className={`${inputClass} max-w-40 [color-scheme:dark]`}
              />
              <p id={`${ids}-time-hint`} className="mt-1.5 text-sm text-muted">
                As a notification or through Home Assistant, like other reminders.
              </p>
            </div>
          ) : null}
        </div>

        {kind === "study" ? (
          <p className="text-sm text-muted">
            Checked off by itself on days with enough time on courses. The minimum is under Settings
            &gt; Study streak.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        ) : null}
        <button type="submit" className={primaryButton} disabled={busy}>
          {habit ? "Save habit" : "Add habit"}
        </button>
      </form>

      {habit && habit.kind === "check" ? <PastDays habit={habit} today={today} /> : null}

      {habit ? (
        <div className="flex flex-wrap gap-2 border-t border-surface-0/70 pt-4">
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() =>
              update.mutate(
                { id: habit.id, patch: { archived: !habit.archived } },
                {
                  onSuccess: () =>
                    onSaved(habit.archived ? `Restored ${habit.name}` : `Archived ${habit.name}`),
                },
              )
            }
          >
            {habit.archived ? "Restore habit" : "Archive habit"}
          </button>
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg">Delete it and its check-ins?</span>
              <button
                type="button"
                className={dangerButton}
                disabled={busy}
                onClick={() =>
                  remove.mutate(habit.id, { onSuccess: () => onSaved(`Deleted ${habit.name}`) })
                }
              >
                Delete habit
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
                Keep habit
              </button>
            </span>
          ) : (
            <button type="button" className={dangerButton} onClick={() => setConfirmDelete(true)}>
              Delete habit
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The last two weeks, to check off days that were done but not marked. */
function PastDays({ habit: opened, today }: { habit: Habit; today: string }) {
  const checkin = useCheckin();
  // The latest from the server (or the check-in just made), not the copy the sheet opened with.
  const habit = useHabits().data?.find((item) => item.id === opened.id) ?? opened;
  const done = new Set(habit.days.filter((day) => day.state === "done").map((day) => day.date));
  const dates = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13));
  return (
    <section aria-label="Past days" className="space-y-2">
      <h3 className="font-semibold text-fg">Past days</h3>
      <p className="text-sm text-muted">Tap a day to check it off, or to take it back.</p>
      <div className="grid grid-cols-7 gap-1.5">
        {dates.map((date) => {
          const on = done.has(date);
          const day = new Date(`${date}T00:00:00Z`);
          return (
            <button
              key={date}
              type="button"
              aria-pressed={on}
              aria-label={`${formatShortDate(date, today)}: ${on ? "done" : "not done"}`}
              disabled={checkin.isPending}
              onClick={() => checkin.mutate({ id: habit.id, date, done: !on })}
              className={`flex min-h-11 flex-col items-center justify-center rounded-control text-xs tabular-nums ${
                on
                  ? "bg-accent font-semibold text-on-accent"
                  : "bg-base text-muted ring-1 ring-surface-0"
              }`}
            >
              <span aria-hidden="true">{WEEKDAY_SHORT[(day.getUTCDay() + 6) % 7]}</span>
              <span aria-hidden="true">{day.getUTCDate()}</span>
            </button>
          );
        })}
      </div>
      {checkin.error ? (
        <p role="alert" className="text-sm text-danger">
          {checkin.error.message}
        </p>
      ) : null}
    </section>
  );
}
