import type { TaskStatus, TaskUpdate } from "../../shared/tasks";

// Planning the day and shutting down: estimates against the hours there are, and
// moving what's left to tomorrow.

type Plannable = {
  status: TaskStatus;
  dueDate: string | null;
  startDate: string | null;
  estimateMinutes: number | null;
};

/** Minutes estimated across the tasks, and how many have no estimate. */
export function planTotals(tasks: readonly Plannable[]): { minutes: number; unestimated: number } {
  return {
    minutes: tasks.reduce((sum, task) => sum + (task.estimateMinutes ?? 0), 0),
    unestimated: tasks.filter((task) => task.estimateMinutes === null).length,
  };
}

/**
 * The change that takes a task out of today and into tomorrow: it starts tomorrow, an
 * overdue or due-today date moves to tomorrow, and a task in progress goes back to To
 * do. Starting tomorrow keeps it out of Anytime too until then.
 */
export function tomorrowPatch(task: Plannable, today: string, tomorrow: string): TaskUpdate {
  const patch: TaskUpdate = { startDate: tomorrow };
  if (task.dueDate !== null && task.dueDate <= today) patch.dueDate = tomorrow;
  if (task.status === "doing") patch.status = "todo";
  return patch;
}

/** Tasks to suggest for today: soonest due first, then by priority, then newest. */
export function bySuggestion<T extends Plannable & { id: number; priority: number }>(
  a: T,
  b: T,
): number {
  const due = (task: T) => task.dueDate ?? "~";
  return (due(a) < due(b) ? -1 : due(a) > due(b) ? 1 : 0) || b.priority - a.priority || b.id - a.id;
}

/** The change that brings a task that could be done now into today. */
export function todayPatch(today: string): TaskUpdate {
  return { startDate: today, someday: false };
}
