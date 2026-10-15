import { CornerLeftUp, Plus, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
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
import { formatMinutesShort } from "../../../shared/quickAdd";
import {
  monthWeekOf,
  nextInSeries,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  weekdayOf,
} from "../../../shared/recurrence";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskPriority,
} from "../../../shared/tasks";
import { SubjectTime } from "../../time/components/SubjectTime";
import { formatShortDate, localDate } from "../dates";
import {
  canCountFromCompletion,
  type Draft,
  datesProblem,
  draftChanges,
  draftRule,
  type EndChoice,
  type MonthlyOn,
  monthlyChoices,
  type RepeatChoice,
  repeatProblem,
  seriesContinues,
  toDraft,
} from "../draft";
import {
  type ProjectItem,
  type TaskDetail,
  useCreateTask,
  useDeleteTaskLater,
  useTask,
  useTasks,
  useUpdateTask,
} from "../queries";
import { TaskCheckbox } from "./TaskList";
import { SaveTemplate } from "./TemplatesSheet";

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
  const today = localDate();
  const patch = draftChanges(task, draft, today);
  const dirty = Object.keys(patch).length > 0;
  const titleMissing = draft.title.trim() === "";
  const repeatInvalid = repeatProblem(draft) !== null;
  const datesInvalid = datesProblem(draft);
  const blocked = titleMissing || repeatInvalid || datesInvalid !== null;
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
          const finished = task.recurrence && task.status !== "done" && saved.status === "done";
          setMessage(
            !finished || !task.recurrence
              ? "Task saved"
              : seriesContinues(task.recurrence, task.dueDate, today)
                ? "Task saved. The next one is in To do."
                : "Task saved. That was the last one.",
          );
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

        <PlanFields task={task} draft={draft} problem={datesInvalid} onChange={set} />

        {isSubtask ? null : <RepeatFields draft={draft} today={today} onChange={set} />}

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

      <SubjectTime subject={{ type: "task", id: task.id }} />
      {isSubtask ? null : <Subtasks task={task} onOpenTask={onOpenTask} />}
      {isSubtask ? null : <SaveTemplate from={{ taskId: task.id }} defaultName={task.title} />}
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
  const deleteLater = useDeleteTaskLater();
  const count = task.subtasks.length;
  return (
    <div className="border-t border-surface-0/70 pt-4">
      <button
        type="button"
        className={`${dangerButton} -ml-4`}
        onClick={() => {
          deleteLater(task);
          onDeleted();
        }}
      >
        Delete task
      </button>
      {count > 0 ? (
        <p className="text-sm text-muted">
          Its {count === 1 ? "subtask goes" : `${count} subtasks go`} too. Undo is there for a few
          seconds.
        </p>
      ) : null}
    </div>
  );
}

const REPEAT_LABELS: Record<Exclude<RepeatChoice, "">, [string, string, string]> = {
  daily: ["Daily", "day", "days"],
  weekly: ["Weekly", "week", "weeks"],
  monthly: ["Monthly", "month", "months"],
  yearly: ["Yearly", "year", "years"],
};

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"] as const;

/** "Day 13", "The 2nd Wednesday", "The last Wednesday", "The last day" (of March, when yearly). */
function monthlyLabel(choice: MonthlyOn, anchor: string, yearly: boolean): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  const monthName = date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const ofMonth = yearly ? ` of ${monthName}` : "";
  const day = WEEKDAY_NAMES[weekdayOf(anchor)];
  if (choice === "day")
    return yearly ? `${monthName} ${date.getUTCDate()}` : `Day ${date.getUTCDate()}`;
  if (choice === "weekday") return `The ${ORDINAL[monthWeekOf(anchor)] ?? ""} ${day}${ofMonth}`;
  if (choice === "lastWeekday") return `The last ${day}${ofMonth}`;
  return `The last day${ofMonth}`;
}

/**
 * How a task repeats: how often, which days, whether the next one counts from when
 * it's done, and when the series ends. Days of the week and of the month come from
 * the due date (today without one).
 */
function RepeatFields({
  draft,
  today,
  onChange,
}: {
  draft: Draft;
  today: string;
  onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  const ids = useId();
  const anchor = draft.dueDate || today;
  const problem = repeatProblem(draft);
  const rule = draftRule(draft, today);
  const next = rule ? nextInSeries({ interval: 1, ...rule }, anchor, today) : null;
  const unit = draft.repeat ? REPEAT_LABELS[draft.repeat] : null;
  const count = Number(draft.interval) || 2;
  const monthly = draft.repeat === "monthly" || draft.repeat === "yearly";
  const toggleDay = (day: number) =>
    onChange(
      "weekdays",
      draft.weekdays.includes(day)
        ? draft.weekdays.filter((item) => item !== day)
        : [...draft.weekdays, day].sort((a, b) => a - b),
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${ids}-repeat`} className={labelClass}>
            Repeat
          </label>
          <select
            id={`${ids}-repeat`}
            value={draft.repeat}
            onChange={(event) => onChange("repeat", event.target.value as RepeatChoice)}
            aria-describedby={`${ids}-repeat-note`}
            className={inputClass}
          >
            <option value="">Doesn't repeat</option>
            {(["daily", "weekly", "monthly", "yearly"] as const).map((choice) => (
              <option key={choice} value={choice}>
                {REPEAT_LABELS[choice][0]}
              </option>
            ))}
          </select>
        </div>
        {unit ? (
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
                aria-invalid={problem?.startsWith("Use a whole number from 1") ?? false}
                aria-describedby={`${ids}-repeat-note`}
                className={`${inputClass} min-w-0 text-center tabular-nums`}
              />
              <span className="shrink-0 text-muted">{count === 1 ? unit[1] : unit[2]}</span>
            </div>
          </div>
        ) : null}
      </div>

      {draft.repeat === "weekly" ? (
        <fieldset>
          <legend className={labelClass}>On</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((short, day) => {
              const on = draft.weekdays.includes(day);
              return (
                <button
                  key={short}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_NAMES[day]}
                  onClick={() => toggleDay(day)}
                  className={`grid size-11 place-items-center rounded-full text-sm font-semibold ring-1 transition-colors ${
                    on
                      ? "bg-accent text-on-accent ring-accent"
                      : "bg-base text-muted ring-surface-1 hover:text-fg"
                  }`}
                >
                  {short.slice(0, 2)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {draft.weekdays.length === 0
              ? `None picked: ${WEEKDAY_NAMES[weekdayOf(anchor)]}s, the due date's day.`
              : "Tap a day to add or remove it."}
          </p>
        </fieldset>
      ) : null}

      {monthly ? (
        <div>
          <label htmlFor={`${ids}-on`} className={labelClass}>
            On
          </label>
          <select
            id={`${ids}-on`}
            value={monthlyChoices(anchor).includes(draft.monthlyOn) ? draft.monthlyOn : "day"}
            onChange={(event) => onChange("monthlyOn", event.target.value as MonthlyOn)}
            className={inputClass}
          >
            {monthlyChoices(anchor).map((choice) => (
              <option key={choice} value={choice}>
                {monthlyLabel(choice, anchor, draft.repeat === "yearly")}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {unit ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {canCountFromCompletion(draft) ? (
            <div>
              <label htmlFor={`${ids}-from`} className={labelClass}>
                Count the next one from
              </label>
              <select
                id={`${ids}-from`}
                value={draft.fromCompletion ? "completion" : "schedule"}
                onChange={(event) =>
                  onChange("fromCompletion", event.target.value === "completion")
                }
                className={inputClass}
              >
                <option value="schedule">The due date</option>
                <option value="completion">When it's done</option>
              </select>
            </div>
          ) : null}
          <div>
            <label htmlFor={`${ids}-ends`} className={labelClass}>
              Ends
            </label>
            <select
              id={`${ids}-ends`}
              value={draft.ends}
              onChange={(event) => onChange("ends", event.target.value as EndChoice)}
              className={inputClass}
            >
              <option value="never">Never</option>
              <option value="date">On a date</option>
              <option value="count">After a number more</option>
            </select>
          </div>
          {draft.ends === "date" ? (
            <div>
              <label htmlFor={`${ids}-until`} className={labelClass}>
                Last date
              </label>
              <input
                id={`${ids}-until`}
                type="date"
                value={draft.until}
                onChange={(event) => onChange("until", event.target.value)}
                aria-describedby={`${ids}-repeat-note`}
                className={inputClass}
              />
            </div>
          ) : null}
          {draft.ends === "count" ? (
            <div>
              <label htmlFor={`${ids}-left`} className={labelClass}>
                How many more
              </label>
              <input
                id={`${ids}-left`}
                type="text"
                inputMode="numeric"
                value={draft.left}
                onChange={(event) => onChange("left", event.target.value)}
                maxLength={3}
                aria-invalid={problem?.includes("how many more") ?? false}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* A date still to pick isn't a mistake; numbers typed wrong are. */}
      <p
        id={`${ids}-repeat-note`}
        className={`text-sm ${problem && draft.ends !== "date" ? "text-danger" : "text-muted"}`}
      >
        {problem
          ? problem
          : !draft.repeat
            ? "Repeating tasks come back when you complete them."
            : next
              ? `Completing it adds the next one, due ${formatShortDate(next.dueDate, today)}.`
              : "This is the last one; completing it ends the series."}
      </p>
    </div>
  );
}

/** Estimates offered in the task sheet, in minutes. Others (from quick add) show too. */
const ESTIMATES = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

/**
 * When it shows up and what it waits on: a start date ("don't show me until…"),
 * Someday, This evening, and other tasks that have to be done first.
 */
function PlanFields({
  task,
  draft,
  problem,
  onChange,
}: {
  task: TaskDetail;
  draft: Draft;
  problem: string | null;
  onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  const ids = useId();
  const open = useTasks("all");
  const others = (open.data ?? []).filter(
    (other) => other.id !== task.id && other.status !== "done",
  );
  // Names for tasks already chosen, whether saved or just picked.
  const names = new Map<number, { title: string; done: boolean }>([
    ...task.waitingOn.map((other) => [other.id, other] as const),
    ...others.map((other) => [other.id, { title: other.title, done: false }] as const),
  ]);
  const choices = others.filter((other) => !draft.waitingOn.includes(other.id));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${ids}-start`} className={labelClass}>
            Start date
          </label>
          <input
            id={`${ids}-start`}
            type="date"
            value={draft.startDate}
            onChange={(event) => onChange("startDate", event.target.value)}
            aria-describedby={`${ids}-start-hint`}
            aria-invalid={problem !== null}
            className={`${inputClass} [color-scheme:dark]`}
          />
          {draft.startDate ? (
            <button
              type="button"
              onClick={() => onChange("startDate", "")}
              className="mt-1 h-11 rounded-full px-2 text-sm font-semibold text-accent-text hover:bg-surface-0"
            >
              Clear start date
            </button>
          ) : null}
        </div>
        <fieldset className="space-y-1">
          <legend className={labelClass}>Show it</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={draft.someday}
              onChange={(event) => onChange("someday", event.target.checked)}
              className="size-5 shrink-0 accent-accent"
            />
            Someday
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={draft.evening}
              onChange={(event) => onChange("evening", event.target.checked)}
              className="size-5 shrink-0 accent-accent"
            />
            This evening
          </label>
        </fieldset>
      </div>
      <div>
        <label htmlFor={`${ids}-estimate`} className={labelClass}>
          Estimate
        </label>
        <select
          id={`${ids}-estimate`}
          value={draft.estimate}
          onChange={(event) => onChange("estimate", event.target.value)}
          className={`${inputClass} max-w-48`}
        >
          <option value="">None</option>
          {ESTIMATES.map((minutes) => (
            <option key={minutes} value={String(minutes)}>
              {formatMinutesShort(minutes)}
            </option>
          ))}
          {draft.estimate && !ESTIMATES.includes(Number(draft.estimate)) ? (
            <option value={draft.estimate}>{formatMinutesShort(Number(draft.estimate))}</option>
          ) : null}
        </select>
      </div>
      <p
        id={`${ids}-start-hint`}
        className={`-mt-3 text-sm ${problem ? "text-danger" : "text-muted"}`}
      >
        {problem ??
          "It stays out of Today and Anytime until the start date. Someday parks it; This evening puts it at the end of Today."}
      </p>

      <div>
        <label htmlFor={`${ids}-wait`} className={labelClass}>
          Waits on
        </label>
        {draft.waitingOn.length > 0 ? (
          <ul aria-label="Tasks it waits on" className="mb-2 space-y-2">
            {draft.waitingOn.map((id) => {
              const other = names.get(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-tile bg-base/80 pl-4 ring-1 ring-surface-0/50"
                >
                  <span className="min-w-0 flex-1 py-2">
                    <span className="block break-words text-fg">{other?.title ?? "A task"}</span>
                    <span className="block text-sm text-muted">
                      {other?.done ? "Done" : "Not done yet"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        "waitingOn",
                        draft.waitingOn.filter((item) => item !== id),
                      )
                    }
                    aria-label={`Stop waiting on ${other?.title ?? "this task"}`}
                    className={iconButton}
                  >
                    <X aria-hidden="true" className="size-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <select
          id={`${ids}-wait`}
          value=""
          onChange={(event) => {
            const id = Number(event.target.value);
            if (id > 0) onChange("waitingOn", [...draft.waitingOn, id]);
          }}
          aria-describedby={`${ids}-wait-hint`}
          className={inputClass}
        >
          <option value="">
            {choices.length === 0 ? "No other open tasks" : "Add a task it waits on"}
          </option>
          {choices.map((other) => (
            <option key={other.id} value={other.id}>
              {other.title}
            </option>
          ))}
        </select>
        <p id={`${ids}-wait-hint`} className="mt-1.5 text-sm text-muted">
          While any of these is open, this task stays out of Today.
        </p>
      </div>
    </div>
  );
}
