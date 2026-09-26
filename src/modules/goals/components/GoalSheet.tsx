import { Plus, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  dangerButton,
  ghostButton,
  iconButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import {
  GOAL_STATUS_LABELS,
  GOAL_STATUSES,
  PROGRESS_MODE_LABELS,
  PROGRESS_MODES,
  type ProgressMode,
} from "../../../shared/goals";
import { TASK_STATUS_LABELS } from "../../../shared/tasks";
import { TaskCheckbox } from "../../tasks/components/TaskList";
import { formatShortDate, localDate } from "../../tasks/dates";
import { useTasks } from "../../tasks/queries";
import { type GoalDraft, goalDraftChanges, goalDraftErrors, toGoalDraft } from "../draft";
import {
  type GoalDetail,
  useAddMilestone,
  useDeleteGoal,
  useDeleteMilestone,
  useGoal,
  useLinkTask,
  useUnlinkTask,
  useUpdateGoal,
  useUpdateMilestone,
} from "../queries";

const MODE_HINTS: Record<ProgressMode, string> = {
  milestones: "Progress is the share of milestones below that are done.",
  tasks: "Progress is the share of linked tasks that are done.",
  amount: "Progress is how much is saved toward the target.",
  manual: "Set the progress yourself.",
};

/** One goal: its details, milestones, and linked tasks. Unsaved edits are never dropped silently. */
export function GoalSheet({ goalId, onClose }: { goalId: number | null; onClose: () => void }) {
  const goal = useGoal(goalId);
  const dirty = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const loaded = goal.data && goal.data.id === goalId ? goal.data : null;

  const requestClose = () => {
    if (dirty.current) setConfirmClose(true);
    else onClose();
  };

  return (
    <Sheet open={goalId !== null} onClose={requestClose} title="Goal">
      {goalId === null ? null : loaded ? (
        <GoalEditor
          key={loaded.id}
          goal={loaded}
          onDirtyChange={(value) => {
            dirty.current = value;
          }}
          confirmClose={confirmClose}
          onResolveClose={(close) => {
            setConfirmClose(false);
            if (close) {
              dirty.current = false;
              onClose();
            }
          }}
          onDeleted={() => {
            dirty.current = false;
            onClose();
          }}
        />
      ) : goal.isError ? (
        <ErrorNote error={goal.error} onRetry={() => void goal.refetch()} />
      ) : (
        <LoadingRows rows={4} />
      )}
    </Sheet>
  );
}

function GoalEditor({
  goal,
  onDirtyChange,
  confirmClose,
  onResolveClose,
  onDeleted,
}: {
  goal: GoalDetail;
  onDirtyChange: (dirty: boolean) => void;
  confirmClose: boolean;
  onResolveClose: (close: boolean) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState(() => toGoalDraft(goal));
  const [message, setMessage] = useState("");
  const update = useUpdateGoal();
  const ids = useId();
  const errors = goalDraftErrors(draft);
  const blocked = Object.keys(errors).length > 0;
  const patch = blocked ? {} : goalDraftChanges(goal, draft);
  const dirty = blocked || Object.keys(patch).length > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const save = (after?: () => void) => {
    if (blocked || Object.keys(patch).length === 0) return;
    update.mutate(
      { id: goal.id, patch },
      {
        onSuccess: (saved) => {
          if (saved) setDraft(toGoalDraft(saved));
          setMessage("Goal saved");
          after?.();
        },
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <ProgressBar
            percent={goal.progress.percent}
            label="Progress"
            complete={goal.status === "achieved"}
          />
          <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
            {goal.progress.percent}%
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted">{goal.progress.summary}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${ids}-title`} className={labelClass}>
            Title
          </label>
          <input
            id={`${ids}-title`}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={200}
            aria-invalid={Boolean(errors.title)}
            className={`${inputClass} font-semibold`}
          />
          {errors.title ? <p className="mt-1.5 text-sm text-danger">{errors.title}</p> : null}
        </div>

        <fieldset>
          <legend className={labelClass}>Status</legend>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-base p-1 ring-1 ring-surface-1">
            {GOAL_STATUSES.map((status) => (
              <label key={status} className="relative">
                <input
                  type="radio"
                  name={`${ids}-status`}
                  value={status}
                  checked={draft.status === status}
                  onChange={() => set("status", status)}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                />
                <span className="pointer-events-none grid h-10 place-items-center rounded-full text-sm font-semibold text-muted peer-checked:bg-accent peer-checked:text-on-accent">
                  {GOAL_STATUS_LABELS[status]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${ids}-date`} className={labelClass}>
            Target date
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            value={draft.targetDate}
            onChange={(event) => set("targetDate", event.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
          />
          {draft.targetDate ? (
            <button
              type="button"
              onClick={() => set("targetDate", "")}
              className="mt-1 h-11 rounded-full px-2 text-sm font-semibold text-accent-text hover:bg-surface-0"
            >
              Clear target date
            </button>
          ) : null}
        </div>

        <div>
          <label htmlFor={`${ids}-mode`} className={labelClass}>
            Measure progress by
          </label>
          <select
            id={`${ids}-mode`}
            value={draft.progressMode}
            onChange={(event) => set("progressMode", event.target.value as ProgressMode)}
            aria-describedby={`${ids}-mode-hint`}
            className={inputClass}
          >
            {PROGRESS_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PROGRESS_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <p id={`${ids}-mode-hint`} className="mt-1.5 text-sm text-muted">
            {MODE_HINTS[draft.progressMode]}
          </p>
        </div>

        {draft.progressMode === "amount" ? (
          <div className="grid grid-cols-2 gap-3">
            <MoneyField
              id={`${ids}-current`}
              label="Saved so far"
              value={draft.current}
              error={errors.current}
              onChange={(value) => set("current", value)}
            />
            <MoneyField
              id={`${ids}-target`}
              label="Target"
              value={draft.target}
              error={errors.target}
              onChange={(value) => set("target", value)}
            />
          </div>
        ) : null}

        {draft.progressMode === "manual" ? (
          <div>
            <label htmlFor={`${ids}-percent`} className={labelClass}>
              Progress: {draft.manualPercent}%
            </label>
            <input
              id={`${ids}-percent`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.manualPercent}
              onChange={(event) => set("manualPercent", Number(event.target.value))}
              className="h-11 w-full accent-accent"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor={`${ids}-notes`} className={labelClass}>
            Notes
          </label>
          <textarea
            id={`${ids}-notes`}
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
            rows={3}
            className={textareaClass}
          />
        </div>

        {confirmClose ? (
          <div role="alert" className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-warn/50">
            <p className="font-semibold text-fg">
              {blocked ? "Some changes can't be saved yet." : "You have unsaved changes."}
            </p>
            <div className="flex flex-wrap gap-2">
              {blocked ? null : (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={update.isPending}
                  onClick={() => save(() => onResolveClose(true))}
                >
                  Save goal
                </button>
              )}
              <button
                type="button"
                className={secondaryButton}
                onClick={() => onResolveClose(true)}
              >
                Discard changes
              </button>
              <button type="button" className={ghostButton} onClick={() => onResolveClose(false)}>
                Keep editing
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className={primaryButton}
              disabled={blocked || Object.keys(patch).length === 0 || update.isPending}
            >
              {update.isPending ? "Saving…" : "Save goal"}
            </button>
            {dirty ? (
              <button
                type="button"
                className={ghostButton}
                onClick={() => setDraft(toGoalDraft(goal))}
              >
                Undo changes
              </button>
            ) : null}
            <p role="status" className="text-sm font-semibold text-ok">
              {message}
            </p>
          </div>
        )}
        {update.isError ? (
          <p role="alert" className="text-sm text-danger">
            {update.error.message}
          </p>
        ) : null}
      </form>

      <Milestones goal={goal} />
      <LinkedTasks goal={goal} />
      <DeleteGoal goal={goal} onDeleted={onDeleted} />
    </div>
  );
}

function MoneyField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-muted"
        >
          $
        </span>
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputClass} pl-8 tabular-nums`}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Milestones({ goal }: { goal: GoalDetail }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const add = useAddMilestone();
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();
  const headingId = useId();
  const today = localDate();
  const error = add.error ?? update.error ?? remove.error;
  const done = goal.milestones.filter((milestone) => milestone.done).length;

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    add.mutate(
      { goalId: goal.id, json: { title: trimmed, targetDate: date || null } },
      {
        onSuccess: () => {
          setTitle("");
          setDate("");
        },
      },
    );
  };

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <h3 id={headingId} className="flex items-baseline gap-2 font-semibold text-fg">
        Milestones
        {goal.milestones.length > 0 ? (
          <span className="text-sm text-muted tabular-nums">
            {done} of {goal.milestones.length} done
          </span>
        ) : null}
      </h3>
      {goal.milestones.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {goal.milestones.map((milestone) => (
            <li key={milestone.id} className="flex items-center gap-1">
              <TaskCheckbox
                task={{ title: milestone.title, status: milestone.done ? "done" : "todo" }}
                onToggle={(isDone) =>
                  update
                    .mutateAsync({
                      goalId: goal.id,
                      milestoneId: milestone.id,
                      patch: { done: isDone },
                    })
                    .catch(() => undefined)
                }
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-semibold break-words ${
                    milestone.done ? "text-muted line-through decoration-surface-2" : "text-fg"
                  }`}
                >
                  {milestone.title}
                </span>
                {milestone.targetDate ? (
                  <span className="block text-sm text-muted">
                    {formatShortDate(milestone.targetDate, today)}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className={iconButton}
                aria-label={`Delete milestone ${milestone.title}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ goalId: goal.id, milestoneId: milestone.id })}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={onAdd} className="mt-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a milestone"
            aria-label="New milestone"
            maxLength={200}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!title.trim() || add.isPending}
            aria-label="Add milestone"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-0 text-fg hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>
        <label className="flex items-center gap-3 text-sm text-muted">
          <span className="shrink-0">Target date (optional)</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label="New milestone target date"
            className={`${inputClass} h-11 [color-scheme:dark]`}
          />
        </label>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}

function LinkedTasks({ goal }: { goal: GoalDetail }) {
  const [choice, setChoice] = useState("");
  const tasks = useTasks("all");
  const link = useLinkTask();
  const unlink = useUnlinkTask();
  const headingId = useId();
  const selectId = useId();
  const linked = new Set(goal.tasks.map((task) => task.id));
  const choices = (tasks.data ?? []).filter(
    (task) => task.status !== "done" && !linked.has(task.id),
  );
  const error = link.error ?? unlink.error;

  const onLink = (event: FormEvent) => {
    event.preventDefault();
    const taskId = Number(choice);
    if (!taskId) return;
    link.mutate({ goalId: goal.id, taskId }, { onSuccess: () => setChoice("") });
  };

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <h3 id={headingId} className="font-semibold text-fg">
        Linked tasks
      </h3>
      {goal.tasks.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {goal.tasks.map((task) => (
            <li key={task.linkId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-semibold break-words ${
                    task.status === "done"
                      ? "text-muted line-through decoration-surface-2"
                      : "text-fg"
                  }`}
                >
                  {task.title}
                </span>
                <span className="block text-sm text-muted">{TASK_STATUS_LABELS[task.status]}</span>
              </span>
              <button
                type="button"
                className={iconButton}
                aria-label={`Unlink ${task.title}`}
                disabled={unlink.isPending}
                onClick={() => unlink.mutate(task.linkId)}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">No tasks linked yet.</p>
      )}
      <form onSubmit={onLink} className="mt-3 flex gap-2">
        <label htmlFor={selectId} className="sr-only">
          Task to link
        </label>
        <select
          id={selectId}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          className={inputClass}
        >
          <option value="">
            {choices.length > 0 ? "Choose an open task" : "No open tasks to link"}
          </option>
          {choices.map((task) => (
            <option key={task.id} value={String(task.id)}>
              {task.title}
            </option>
          ))}
        </select>
        <button type="submit" className={secondaryButton} disabled={!choice || link.isPending}>
          Link task
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}

function DeleteGoal({ goal, onDeleted }: { goal: GoalDetail; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteGoal();
  if (!confirming) {
    return (
      <div className="border-t border-surface-0/70 pt-4">
        <button
          type="button"
          className={`${dangerButton} -ml-4`}
          onClick={() => setConfirming(true)}
        >
          Delete goal
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
      <p className="font-semibold text-fg">
        Delete this goal and its milestones? Linked tasks stay. This can't be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => remove.mutate(goal.id, { onSuccess: onDeleted })}
          className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
        >
          {remove.isPending ? "Deleting…" : "Delete goal"}
        </button>
        <button type="button" className={ghostButton} onClick={() => setConfirming(false)}>
          Keep goal
        </button>
      </div>
      {remove.isError ? (
        <p role="alert" className="text-sm text-danger">
          {remove.error.message}
        </p>
      ) : null}
    </div>
  );
}
