import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
} from "../../../client/components/ui";
import { formatMinutes } from "../../../shared/time";
import { localDate } from "../../tasks/dates";
import { type TimeEntry, useDeleteEntry, useSaveEntry } from "../queries";
import { draftRange } from "../week";
import { parseSubject, SubjectSelect, subjectValue } from "./SubjectSelect";

/** "new" to add time, an entry to edit it, or null when closed. */
export type EntryTarget = "new" | TimeEntry | null;

type Draft = { date: string; start: string; end: string; subject: string; note: string };

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

function toDraft(entry: TimeEntry | null, now: Date): Draft {
  if (!entry) {
    const start = new Date(now.getTime() - 30 * 60_000);
    return { date: localDate(start), start: hhmm(start), end: hhmm(now), subject: "", note: "" };
  }
  const started = new Date(entry.startedAt);
  return {
    date: localDate(started),
    start: hhmm(started),
    end: entry.endedAt ? hhmm(new Date(entry.endedAt)) : "",
    subject: subjectValue(entry.subject),
    note: entry.note,
  };
}

export function EntrySheet({ target, onClose }: { target: EntryTarget; onClose: () => void }) {
  const entry = target !== null && target !== "new" ? target : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      variant="dialog"
      title={entry ? "Edit time" : "Add time"}
      description={entry ? undefined : "For time you didn't track with the timer."}
    >
      {target === null ? null : (
        <EntryForm key={entry?.id ?? "new"} entry={entry} onDone={onClose} />
      )}
    </Sheet>
  );
}

function EntryForm({ entry, onDone }: { entry: TimeEntry | null; onDone: () => void }) {
  const [draft, setDraft] = useState(() => toDraft(entry, new Date()));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveEntry();
  const remove = useDeleteEntry();
  const ids = useId();
  const running = entry !== null && entry.endedAt === null;
  const range = draftRange(running ? { ...draft, end: "" } : draft);
  const incomplete = range === null || (!running && range.endedAt === null);
  const minutes = range?.endedAt
    ? Math.round((range.endedAt.getTime() - range.startedAt.getTime()) / 60_000)
    : null;

  const set = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!range || incomplete) return;
    const common = {
      startedAt: range.startedAt.toISOString(),
      note: draft.note.trim(),
      subject: parseSubject(draft.subject),
    };
    const endedAt = range.endedAt?.toISOString();
    save.mutate(
      entry
        ? { id: entry.id, json: running ? common : { ...common, endedAt } }
        : { id: null, json: { ...common, endedAt: endedAt ?? common.startedAt } },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${ids}-date`} className={labelClass}>
            Date
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            value={draft.date}
            onChange={(event) => set("date", event.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>
        <div className={running ? "" : "grid grid-cols-2 gap-3"}>
          <div>
            <label htmlFor={`${ids}-start`} className={labelClass}>
              Start
            </label>
            <input
              id={`${ids}-start`}
              type="time"
              value={draft.start}
              onChange={(event) => set("start", event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          {running ? null : (
            <div>
              <label htmlFor={`${ids}-end`} className={labelClass}>
                End
              </label>
              <input
                id={`${ids}-end`}
                type="time"
                value={draft.end}
                onChange={(event) => set("end", event.target.value)}
                aria-describedby={`${ids}-length`}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </div>
          )}
        </div>
        <p id={`${ids}-length`} className="text-sm text-muted">
          {running
            ? "The timer is still running. Stop it to set an end time."
            : minutes !== null
              ? `${formatMinutes(minutes)}${range?.nextDay ? ", ending the next day" : ""}.`
              : "Pick a date, a start, and an end."}
        </p>
        <div>
          <label htmlFor={`${ids}-subject`} className={labelClass}>
            For
          </label>
          <SubjectSelect
            id={`${ids}-subject`}
            value={draft.subject}
            current={entry?.subject ?? null}
            onChange={(value) => set("subject", value)}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-note`} className={labelClass}>
            Note
          </label>
          <input
            id={`${ids}-note`}
            value={draft.note}
            onChange={(event) => set("note", event.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </div>
        <button type="submit" className={primaryButton} disabled={incomplete || save.isPending}>
          {entry ? "Save time" : "Add time"}
        </button>
        {save.isError ? (
          <p role="alert" className="text-sm text-danger">
            {save.error.message}
          </p>
        ) : null}
      </form>

      {entry && !running ? (
        confirmDelete ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">Delete this time entry? This can't be undone.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(entry.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                Delete time
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
            {remove.isError ? (
              <p role="alert" className="text-sm text-danger">
                {remove.error.message}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="border-t border-surface-0/70 pt-4">
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete time
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
