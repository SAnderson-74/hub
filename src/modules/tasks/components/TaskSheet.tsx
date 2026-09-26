import { CornerLeftUp, Plus } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import {
  describeRecurrence,
  nextDueDate,
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
  recurrenceUnit,
} from "../../../shared/recurrence";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskPriority,
} from "../../../shared/tasks";
import { TaskTime } from "../../time/components/TaskTime";
import { formatShortDate, localDate } from "../dates";
import { type Draft, draftChanges, parseInterval, toDraft } from "../draft";
import {
  type ProjectItem,
  type TaskDetail,
  useCreateTask,
  useDeleteTask,
  useTask,
  useUpdateTask,
} from "../queries";
import { TaskCheckbox } from "./TaskList";

type TaskSheetProps = {
  taskId: number | null;
  projects: ProjectItem[];
  /** Shows another task (a subtask or the parent) in the same sheet. */
  onOpenTask: (id: number) => void;
  onClose: () => void;
};

/** Details of one task, with its subtasks. Unsaved edits are never dropped silently. */
export function TaskSheet({ taskId, projects, onOpenTask, onClose }: TaskSheetProps) {
  const task = useTask(taskId);
  const dirty = useRef(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  const leave = (action: () => void) => {
    if (dirty.current) setPendingLeave(() => action);
    else action();
  };
  const loaded = task.data && task.data.id === taskId ? task.data : null;

  return (
    <Sheet
      open={taskId !== null}
      onClose={() => leave(onClose)}
      title={loaded ? (loaded.parentId === null ? "Task" : "Subtask") : "Task"}
    >
      {taskId === null ? null : loaded ? (
        <TaskEditor
          key={loaded.id}
          task={loaded}
          projects={projects}
          onDirtyChange={(value) => {
            dirty.current = value;
          }}
          pendingLeave={pendingLeave}
          onResolveLeave={(proceed) => {
            const action = pendingLeave;
            setPendingLeave(null);
            if (proceed && action) {
              dirty.current = false;
              action();
            }
          }}
          onOpenTask={(id) => leave(() => onOpenTask(id))}
          onDeleted={() => {
            dirty.current = false;
            if (loaded.parentId !== null) onOpenTask(loaded.parentId);
            else onClose();
          }}
        />
      ) : task.isError ? (
        <ErrorNote error={task.error} onRetry={() => void task.refetch()} />
      ) : (
        <LoadingRows rows={4} />
      )}
    </Sheet>
  );
}

type TaskEditorProps = {
  task: TaskDetail;
  projects: ProjectItem[];
  onDirtyChange: (dirty: boolean) => void;
  pendingLeave: (() => void) | null;
  onResolveLeave: (proceed: boolean) => void;
  onOpenTask: (id: number) => void;
  onDeleted: () => void;
};

function TaskEditor({
  task,
  projects,
  onDirtyChange,
  pendingLeave,
  onResolveLeave,
  onOpenTask,
  onDeleted,
}: TaskEditorProps) {
  const [draft, setDraft] = useState(() => toDraft(task));
  const [message, setMessage] = useState("");
  const update = useUpdateTask();
  const parent = useTask(task.parentId);
  const ids = useId();
  const patch = draftChanges(task, draft);
  const dirty = Object.keys(patch).length > 0;
  const titleMissing = draft.title.trim() === "";
  const interval = parseInterval(draft.interval);
  const intervalInvalid = draft.repeat !== "" && interval === null;
  const blocked = titleMissing || intervalInvalid;
  const isSubtask = task.parentId !== null;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const save = (after?: () => void) => {
    if (blocked || !dirty) return;
    update.mutate(
      { id: task.id, patch },
      {
        onSuccess: (saved) => {
          setDraft(toDraft(saved));
          const repeated = task.recurrence && task.status !== "done" && saved.status === "done";
          setMessage(repeated ? "Task saved. The next one is in To do." : "Task saved");
          after?.();
        },
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  const activeProjects = projects.filter(
    (project) => !project.archived || String(project.id) === draft.projectId,
  );

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {isSubtask ? (
          <button
            type="button"
            onClick={() => task.parentId !== null && onOpenTask(task.parentId)}
            className="-ml-2 inline-flex min-h-11 max-w-full items-center gap-2 rounded-full px-2 text-sm font-semibold text-accent-text hover:bg-surface-0"
          >
            <CornerLeftUp aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">Subtask of {parent.data?.title ?? "a task"}</span>
          </button>
        ) : null}

        <div>
          <label htmlFor={`${ids}-title`} className={labelClass}>
            Title
          </label>
          <input
            id={`${ids}-title`}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={200}
            aria-invalid={titleMissing}
            aria-describedby={titleMissing ? `${ids}-title-error` : undefined}
            className={`${inputClass} font-semibold`}
          />
          {titleMissing ? (
            <p id={`${ids}-title-error`} className="mt-1.5 text-sm text-danger">
              Give the task a title.
            </p>
          ) : null}
        </div>

        <fieldset>
          <legend className={labelClass}>Status</legend>
          <div className="grid grid-cols-4 gap-1 rounded-full bg-base p-1 ring-1 ring-surface-1">
            {TASK_STATUSES.map((status) => (
              <label key={status} className="relative">
                <input
                  type="radio"
                  name={`${ids}-status`}
                  value={status}
                  checked={draft.status === status}
                  onChange={() => set("status", status)}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                />
                <span className="pointer-events-none grid h-10 place-items-center rounded-full px-1 text-center text-sm font-semibold text-muted peer-checked:bg-accent peer-checked:text-on-accent">
                  {TASK_STATUS_LABELS[status]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${ids}-priority`} className={labelClass}>
              Priority
            </label>
            <select
              id={`${ids}-priority`}
              value={draft.priority}
              onChange={(event) => set("priority", Number(event.target.value) as TaskPriority)}
              className={inputClass}
            >
              {TASK_PRIORITY_LABELS.map((label, value) => (
                <option key={label} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-due`} className={labelClass}>
              Due date
            </label>
            <input
              id={`${ids}-due`}
              type="date"
              value={draft.dueDate}
              onChange={(event) => set("dueDate", event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
            {draft.dueDate ? (
              <button
                type="button"
                onClick={() => set("dueDate", "")}
                className="mt-1 h-11 rounded-full px-2 text-sm font-semibold text-accent-text hover:bg-surface-0"
              >
                Clear due date
              </button>
            ) : null}
          </div>
        </div>

        {isSubtask ? null : (
          <RepeatFields
            draft={draft}
            interval={interval}
            invalid={intervalInvalid}
            onChange={set}
          />
        )}

        <div>
          <label htmlFor={`${ids}-project`} className={labelClass}>
            Project
          </label>
          <select
            id={`${ids}-project`}
            value={draft.projectId}
            onChange={(event) => set("projectId", event.target.value)}
            disabled={isSubtask}
            aria-describedby={isSubtask ? `${ids}-project-note` : undefined}
            className={inputClass}
          >
            <option value="">Inbox</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={String(project.id)}>
                {project.name}
              </option>
            ))}
          </select>
          {isSubtask ? (
            <p id={`${ids}-project-note`} className="mt-1.5 text-sm text-muted">
              Subtasks stay in their parent task's project.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={`${ids}-tags`} className={labelClass}>
            Tags
          </label>
          <input
            id={`${ids}-tags`}
            value={draft.tags}
            onChange={(event) => set("tags", event.target.value)}
            placeholder="errands, garden"
            autoCapitalize="none"
            aria-describedby={`${ids}-tags-hint`}
            className={inputClass}
          />
          <p id={`${ids}-tags-hint`} className="mt-1.5 text-sm text-muted">
            Separate tags with commas.
          </p>
        </div>

        <div>
          <label htmlFor={`${ids}-notes`} className={labelClass}>
            Notes
          </label>
          <textarea
            id={`${ids}-notes`}
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
            rows={4}
            className={textareaClass}
          />
        </div>

        {pendingLeave ? (
          <div role="alert" className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-warn/50">
            <p className="font-semibold text-fg">You have unsaved changes.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButton}
                disabled={blocked || update.isPending}
                onClick={() => save(() => onResolveLeave(true))}
              >
                Save task
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => onResolveLeave(true)}
              >
                Discard changes
              </button>
              <button type="button" className={ghostButton} onClick={() => onResolveLeave(false)}>
                Keep editing
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className={primaryButton}
              disabled={!dirty || blocked || update.isPending}
            >
              {update.isPending ? "Saving…" : "Save task"}
            </button>
            {dirty ? (
              <button type="button" className={ghostButton} onClick={() => setDraft(toDraft(task))}>
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

      <TaskTime taskId={task.id} />
      {isSubtask ? null : <Subtasks task={task} onOpenTask={onOpenTask} />}
      <DeleteTask task={task} onDeleted={onDeleted} />
    </div>
  );
}

function Subtasks({ task, onOpenTask }: { task: TaskDetail; onOpenTask: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const create = useCreateTask();
  const update = useUpdateTask();
  const headingId = useId();
  const done = task.subtasks.filter((subtask) => subtask.status === "done").length;

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    // Clear now so the next subtask can be typed while this one saves.
    setTitle("");
    create.mutate(
      { title: trimmed, parentId: task.id },
      { onError: () => setTitle((current) => current || trimmed) },
    );
  };

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <h3 id={headingId} className="flex items-baseline gap-2 font-semibold text-fg">
        Subtasks
        {task.subtasks.length > 0 ? (
          <span className="text-sm text-muted tabular-nums">
            {done} of {task.subtasks.length} done
          </span>
        ) : null}
      </h3>
      {task.subtasks.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {task.subtasks.map((subtask) => (
            <li key={subtask.id} className="flex items-center gap-1">
              <TaskCheckbox
                task={subtask}
                onToggle={(isDone) =>
                  update
                    .mutateAsync({ id: subtask.id, patch: { status: isDone ? "done" : "todo" } })
                    .catch(() => undefined)
                }
              />
              <button
                type="button"
                onClick={() => onOpenTask(subtask.id)}
                className={`min-h-11 min-w-0 flex-1 rounded-control px-1 text-left font-semibold break-words hover:text-accent-text ${
                  subtask.status === "done"
                    ? "text-muted line-through decoration-surface-2"
                    : "text-fg"
                }`}
              >
                {subtask.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={onAdd} className="mt-3 flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a subtask"
          aria-label="New subtask"
          maxLength={200}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={!title.trim() || create.isPending}
          aria-label="Add subtask"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-0 text-fg hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </form>
      {create.isError || update.isError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {(create.error ?? update.error)?.message}
        </p>
      ) : null}
    </section>
  );
}

function DeleteTask({ task, onDeleted }: { task: TaskDetail; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteTask();
  const count = task.subtasks.length;

  if (!confirming) {
    return (
      <div className="border-t border-surface-0/70 pt-4">
        <button
          type="button"
          className={`${dangerButton} -ml-4`}
          onClick={() => setConfirming(true)}
        >
          Delete task
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
      <p className="font-semibold text-fg">
        Delete this task
        {count > 0 ? ` and its ${count === 1 ? "subtask" : `${count} subtasks`}` : ""}? This can't
        be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => remove.mutate(task.id, { onSuccess: onDeleted })}
          className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
        >
          {remove.isPending ? "Deleting…" : "Delete task"}
        </button>
        <button type="button" className={ghostButton} onClick={() => setConfirming(false)}>
          Keep task
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

function RepeatFields({
  draft,
  interval,
  invalid,
  onChange,
}: {
  draft: Draft;
  interval: number | null;
  invalid: boolean;
  onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  const ids = useId();
  const today = localDate();
  const rule = draft.repeat && interval !== null ? { frequency: draft.repeat, interval } : null;
  const next = rule ? nextDueDate(rule, draft.dueDate || today, today) : null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${ids}-repeat`} className={labelClass}>
            Repeat
          </label>
          <select
            id={`${ids}-repeat`}
            value={draft.repeat}
            onChange={(event) => onChange("repeat", event.target.value as RecurrenceFrequency | "")}
            aria-describedby={`${ids}-repeat-note`}
            className={inputClass}
          >
            <option value="">Doesn't repeat</option>
            {RECURRENCE_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {describeRecurrence({ frequency, interval: 1 })}
              </option>
            ))}
          </select>
        </div>
        {draft.repeat ? (
          <div>
            <label htmlFor={`${ids}-interval`} className={labelClass}>
              Every
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${ids}-interval`}
                type="text"
                inputMode="numeric"
                value={draft.interval}
                onChange={(event) => onChange("interval", event.target.value)}
                maxLength={2}
                aria-invalid={invalid}
                aria-describedby={`${ids}-repeat-note`}
                className={`${inputClass} min-w-0 text-center tabular-nums`}
              />
              <span className="shrink-0 text-muted">
                {recurrenceUnit(draft.repeat, interval ?? 2)}
              </span>
            </div>
          </div>
        ) : null}
      </div>
      <p
        id={`${ids}-repeat-note`}
        className={`mt-1.5 text-sm ${invalid ? "text-danger" : "text-muted"}`}
      >
        {invalid
          ? "Use a whole number from 1 to 99."
          : next
            ? `Completing it adds the next one, due ${formatShortDate(next, today)}.`
            : "Repeating tasks come back when you complete them."}
      </p>
    </div>
  );
}
