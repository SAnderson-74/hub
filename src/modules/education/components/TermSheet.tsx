import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
} from "../../../client/components/ui";
import { type Term, useCreateTerm, useDeleteTerm, useUpdateTerm } from "../queries";

/** "new" creates a term, a term edits it, null is closed. */
export type TermTarget = "new" | Term | null;

export function TermSheet({
  target,
  onClose,
  onCreated,
}: {
  target: TermTarget;
  onClose: () => void;
  onCreated: (termId: number) => void;
}) {
  const term = target !== null && target !== "new" ? target : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      variant="dialog"
      title={term ? "Edit term" : "New term"}
      description={term ? undefined : "A block of study, like a semester, with a credit goal."}
    >
      {target === null ? null : (
        <TermForm key={term?.id ?? "new"} term={term} onDone={onClose} onCreated={onCreated} />
      )}
    </Sheet>
  );
}

function TermForm({
  term,
  onDone,
  onCreated,
}: {
  term: Term | null;
  onDone: () => void;
  onCreated: (termId: number) => void;
}) {
  const [name, setName] = useState(term?.name ?? "");
  const [startDate, setStartDate] = useState(term?.startDate ?? "");
  const [endDate, setEndDate] = useState(term?.endDate ?? "");
  const [goal, setGoal] = useState(
    term?.creditGoal === null || !term ? "" : String(term.creditGoal),
  );
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateTerm();
  const update = useUpdateTerm();
  const remove = useDeleteTerm();
  const ids = useId();

  const goalNumber = goal.trim() === "" ? null : Number(goal);
  const problems = {
    name: name.trim() === "" ? "Give the term a name." : null,
    dates:
      !startDate || !endDate
        ? "Pick a start and an end date."
        : startDate > endDate
          ? "The term has to end after it starts."
          : null,
    goal:
      goalNumber !== null && (!Number.isInteger(goalNumber) || goalNumber < 0 || goalNumber > 1000)
        ? "Use a whole number of credits, or leave it empty."
        : null,
  };
  const blocked = Object.values(problems).some(Boolean);
  const error = create.error ?? update.error ?? remove.error;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked) return;
    const fields = { name: name.trim(), startDate, endDate, creditGoal: goalNumber };
    if (term) {
      update.mutate({ id: term.id, patch: fields }, { onSuccess: onDone });
    } else {
      create.mutate(fields, {
        onSuccess: (terms) => {
          // The new term is the one with the highest id.
          const created = terms?.reduce((a, b) => (b.id > a.id ? b : a));
          if (created) onCreated(created.id);
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Name
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            placeholder="Term 1"
            aria-invalid={tried && Boolean(problems.name)}
            className={inputClass}
          />
          {tried && problems.name ? (
            <p className="mt-1.5 text-sm text-danger">{problems.name}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${ids}-start`} className={labelClass}>
              Starts
            </label>
            <input
              id={`${ids}-start`}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-end`} className={labelClass}>
              Ends
            </label>
            <input
              id={`${ids}-end`}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={tried && Boolean(problems.dates)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
        </div>
        {tried && problems.dates ? (
          <p className="-mt-3 text-sm text-danger">{problems.dates}</p>
        ) : null}
        <div>
          <label htmlFor={`${ids}-goal`} className={labelClass}>
            Credit goal (optional)
          </label>
          <input
            id={`${ids}-goal`}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            inputMode="numeric"
            aria-invalid={Boolean(problems.goal)}
            aria-describedby={`${ids}-goal-hint`}
            className={inputClass}
          />
          <p
            id={`${ids}-goal-hint`}
            className={`mt-1.5 text-sm ${problems.goal ? "text-danger" : "text-muted"}`}
          >
            {problems.goal ?? "Without a goal, the term's courses add up to it."}
          </p>
        </div>
        <button
          type="submit"
          className={primaryButton}
          disabled={create.isPending || update.isPending}
        >
          {term ? "Save term" : "Create term"}
        </button>
      </form>

      {term ? (
        confirmDelete ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">
              Delete this term
              {term.courses.length > 0
                ? ` and its ${term.courses.length === 1 ? "course" : `${term.courses.length} courses`}`
                : ""}
              ? Time logged on them stays. This can't be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(term.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                Delete term
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
                Keep term
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-surface-0/70 pt-4">
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete term
            </button>
          </div>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
