import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { inputClass, labelClass, primaryButton } from "../../../client/components/ui";
import { PROGRESS_MODE_LABELS, PROGRESS_MODES, type ProgressMode } from "../../../shared/goals";
import { useCreateGoal } from "../queries";

/** Starts a goal with the basics; milestones, tasks, and amounts are added in the goal sheet. */
export function NewGoalSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="dialog"
      title="New goal"
      description="Something to reach by a date, measured the way that fits."
    >
      {open ? <NewGoalForm onCreated={onCreated} /> : null}
    </Sheet>
  );
}

function NewGoalForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [mode, setMode] = useState<ProgressMode>("milestones");
  const [tried, setTried] = useState(false);
  const create = useCreateGoal();
  const ids = useId();
  const missing = title.trim() === "";

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (missing) return;
    create.mutate(
      { title: title.trim(), targetDate: targetDate || null, progressMode: mode },
      { onSuccess: (goal) => goal && onCreated(goal.id) },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor={`${ids}-title`} className={labelClass}>
          Title
        </label>
        <input
          id={`${ids}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          placeholder="Run a 10K"
          aria-invalid={tried && missing}
          className={inputClass}
        />
        {tried && missing ? (
          <p className="mt-1.5 text-sm text-danger">Give the goal a title.</p>
        ) : null}
      </div>
      <div>
        <label htmlFor={`${ids}-date`} className={labelClass}>
          Target date (optional)
        </label>
        <input
          id={`${ids}-date`}
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          className={`${inputClass} [color-scheme:dark]`}
        />
      </div>
      <div>
        <label htmlFor={`${ids}-mode`} className={labelClass}>
          Measure progress by
        </label>
        <select
          id={`${ids}-mode`}
          value={mode}
          onChange={(event) => setMode(event.target.value as ProgressMode)}
          className={inputClass}
        >
          {PROGRESS_MODES.map((value) => (
            <option key={value} value={value}>
              {PROGRESS_MODE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={primaryButton} disabled={create.isPending}>
        Create goal
      </button>
      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {create.error.message}
        </p>
      ) : null}
    </form>
  );
}
