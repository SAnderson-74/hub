import { CalendarDays, Flag, ListChecks, Tag } from "lucide-react";
import { TASK_PRIORITY_LABELS } from "../../../shared/tasks";
import { type DueTone, describeDue } from "../dates";
import type { TaskItem } from "../queries";

const dueClass: Record<DueTone, string> = {
  danger: "text-danger",
  warn: "text-warn",
  muted: "text-muted",
};

const priorityClass = ["", "text-muted", "text-warn", "text-danger"] as const;

/** Due date, priority, subtasks, project, and tags in one wrapping line. Empty parts are skipped. */
export function TaskMeta({
  task,
  today,
  projectName,
}: {
  task: TaskItem;
  today: string;
  projectName?: string;
}) {
  const due = task.dueDate ? describeDue(task.dueDate, today) : null;
  const done = task.status === "done";
  const parts = [
    due ? (
      <span
        key="due"
        className={`inline-flex items-center gap-1 ${done ? "text-muted" : dueClass[due.tone]}`}
      >
        <CalendarDays aria-hidden="true" className="size-3.5" />
        {due.label}
      </span>
    ) : null,
    task.priority > 0 ? (
      <span
        key="priority"
        className={`inline-flex items-center gap-1 ${priorityClass[task.priority]}`}
      >
        <Flag aria-hidden="true" className="size-3.5" />
        {TASK_PRIORITY_LABELS[task.priority]} priority
      </span>
    ) : null,
    task.subtaskCount > 0 ? (
      <span key="subtasks" className="inline-flex items-center gap-1 text-muted tabular-nums">
        <ListChecks aria-hidden="true" className="size-3.5" />
        {task.subtasksDone} of {task.subtaskCount}
        <span className="sr-only">subtasks done</span>
      </span>
    ) : null,
    projectName ? (
      <span key="project" className="text-muted">
        {projectName}
      </span>
    ) : null,
    ...task.tags.map((tag) => (
      <span
        key={`tag-${tag.id}`}
        className="inline-flex items-center gap-1 rounded-full bg-surface-0 px-2 py-0.5 text-fg"
      >
        <Tag aria-hidden="true" className="size-3 text-muted" />
        {tag.name}
      </span>
    )),
  ].filter(Boolean);

  if (parts.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold">
      {parts}
    </div>
  );
}
