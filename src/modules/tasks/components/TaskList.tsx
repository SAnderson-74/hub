import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { TASK_STATUS_LABELS, type TaskStatus } from "../../../shared/tasks";
import { groupByStatus } from "../ordering";
import type { TaskItem } from "../queries";
import { TaskMeta } from "./TaskMeta";

/** Sections of the list, active work first. Done tasks are folded away. */
const OPEN_SECTIONS: TaskStatus[] = ["doing", "todo", "backlog"];
const DONE_PAGE = 20;

type TaskListProps = {
  tasks: TaskItem[];
  today: string;
  projectNames?: Map<number, string>;
  onOpen: (task: TaskItem) => void;
  onToggleDone: (task: TaskItem, done: boolean) => Promise<unknown>;
};

/**
 * A round "done" checkbox. It flips at once and follows the saved state again when
 * `onToggle` settles, so a failed save flips it back.
 */
export function TaskCheckbox({
  task,
  onToggle,
}: {
  task: { title: string; status: TaskStatus };
  onToggle: (done: boolean) => Promise<unknown>;
}) {
  const [pending, setPending] = useState<boolean | null>(null);
  const done = pending ?? task.status === "done";
  return (
    <label className="relative grid size-11 shrink-0 cursor-pointer place-items-center">
      <input
        type="checkbox"
        checked={done}
        onChange={() => {
          setPending(!done);
          void onToggle(!done).finally(() => setPending(null));
        }}
        aria-label={task.title}
        className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
      />
      <span
        aria-hidden="true"
        className={`grid size-6 place-items-center rounded-full ring-2 transition-colors ${
          done ? "bg-ok text-crust ring-ok" : "ring-surface-2 peer-hover:ring-muted"
        }`}
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : null}
      </span>
    </label>
  );
}

function TaskRow({
  task,
  today,
  projectNames,
  onOpen,
  onToggleDone,
}: Omit<TaskListProps, "tasks"> & { task: TaskItem }) {
  const done = task.status === "done";
  return (
    <li className="flex items-start gap-1 rounded-tile bg-base/80 py-1 pr-2 pl-1 ring-1 ring-surface-0/50">
      <TaskCheckbox task={task} onToggle={(done) => onToggleDone(task, done)} />
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="min-h-11 min-w-0 flex-1 rounded-control py-2.5 text-left"
      >
        <span
          className={`block font-semibold break-words ${done ? "text-muted line-through decoration-surface-2" : "text-fg"}`}
        >
          {task.title}
        </span>
        <TaskMeta
          task={task}
          today={today}
          projectName={
            projectNames && task.projectId !== null ? projectNames.get(task.projectId) : undefined
          }
        />
      </button>
    </li>
  );
}

export function TaskList(props: TaskListProps) {
  const { tasks } = props;
  const [doneShown, setDoneShown] = useState(DONE_PAGE);
  const groups = groupByStatus(tasks);
  const sections = OPEN_SECTIONS.filter((status) => groups[status].length > 0);
  const done = groups.done;

  return (
    <div className="space-y-6">
      {sections.length === 0 ? (
        <p className="rounded-tile bg-mantle p-5 text-muted ring-1 ring-surface-0/60">
          Nothing open here. Add a task above.
        </p>
      ) : null}
      {sections.map((status) => (
        <section key={status} aria-labelledby={`list-${status}`}>
          <h2
            id={`list-${status}`}
            className="mb-2 flex items-baseline gap-2 px-1 font-semibold text-fg"
          >
            {TASK_STATUS_LABELS[status]}
            <span className="text-sm font-semibold text-muted tabular-nums">
              {groups[status].length}
            </span>
          </h2>
          <ul className="space-y-2">
            {groups[status].map((task) => (
              <TaskRow key={task.id} {...props} task={task} />
            ))}
          </ul>
        </section>
      ))}
      {done.length > 0 ? (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-1 font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden="true"
              className="size-5 text-muted transition-transform group-open:rotate-180"
            />
            Done
            <span className="text-sm text-muted tabular-nums">{done.length}</span>
          </summary>
          <ul className="mt-2 space-y-2">
            {done.slice(0, doneShown).map((task) => (
              <TaskRow key={task.id} {...props} task={task} />
            ))}
          </ul>
          {done.length > doneShown ? (
            <button
              type="button"
              onClick={() => setDoneShown((shown) => shown + DONE_PAGE)}
              className="mt-2 h-11 rounded-full px-4 text-sm font-semibold text-accent-text hover:bg-surface-0"
            >
              Show {Math.min(DONE_PAGE, done.length - doneShown)} more
            </button>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
