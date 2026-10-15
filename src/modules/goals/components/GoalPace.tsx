import { type FormEvent, useId, useState } from "react";
import { StatusDot } from "../../../client/components/StatusDot";
import {
  ghostButton,
  labelClass,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { PACE_LABELS } from "../../../shared/goalPace";
import { formatShortDate, localDate } from "../../tasks/dates";
import { PACE_TONES, paceOf } from "../pace";
import { type GoalDetail, useAddCheckin, useDeleteCheckin } from "../queries";

/**
 * How a goal is going: on track or behind for its date, when it would finish at this
 * pace, and what each week needs. Check-ins note progress with a comment along the way.
 */
export function GoalPace({ goal }: { goal: GoalDetail }) {
  const ids = useId();
  const today = localDate();
  const pace = paceOf(goal, today);
  const add = useAddCheckin();
  const remove = useDeleteCheckin();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const checkins = [...goal.checkins].reverse();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(
      { goalId: goal.id, note },
      {
        onSuccess: () => {
          setNote("");
          setMessage(`Checked in at ${goal.progress.percent}%`);
        },
      },
    );
  };

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-4 border-t border-surface-0/70 pt-6"
    >
      <div>
        <h3 id={`${ids}-title`} className="font-semibold text-fg">
          Pace
        </h3>
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-fg">
          <StatusDot tone={PACE_TONES[pace.state]} />
          {PACE_LABELS[pace.state]}
        </p>
        <p className="mt-1 text-sm text-muted">{pace.summary}</p>
      </div>

      {goal.status === "active" ? (
        <form onSubmit={onSubmit} noValidate className="space-y-2">
          <label htmlFor={`${ids}-note`} className={labelClass}>
            Check-in note
          </label>
          <textarea
            id={`${ids}-note`}
            value={note}
            rows={2}
            maxLength={1_000}
            placeholder="How's it going?"
            onChange={(event) => setNote(event.target.value)}
            aria-describedby={`${ids}-hint`}
            className={textareaClass}
          />
          <p id={`${ids}-hint`} className="text-sm text-muted">
            Saves today's progress ({goal.progress.percent}%) with the note.
          </p>
          <button type="submit" className={secondaryButton} disabled={add.isPending}>
            Check in
          </button>
          <p role="status" className="text-sm font-semibold text-ok empty:hidden">
            {message}
          </p>
          {add.error ? (
            <p role="alert" className="text-sm text-danger">
              {add.error.message}
            </p>
          ) : null}
        </form>
      ) : null}

      {checkins.length > 0 ? (
        <ul className="divide-y divide-surface-0 text-sm" aria-label="Check-ins">
          {checkins.map((checkin) => (
            <li key={checkin.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold text-fg tabular-nums">
                  {formatShortDate(checkin.date, today)} · {checkin.percent}%
                </span>
                {checkin.note ? (
                  <span className="block break-words text-muted">{checkin.note}</span>
                ) : null}
              </span>
              <button
                type="button"
                className={`${ghostButton} -mr-3 shrink-0`}
                disabled={remove.isPending}
                aria-label={`Delete the check-in from ${formatShortDate(checkin.date, today)}`}
                onClick={() => remove.mutate({ goalId: goal.id, checkinId: checkin.id })}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
