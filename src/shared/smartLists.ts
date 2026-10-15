import type { TaskStatus } from "./tasks";

// The task lists that cut across projects, the way Things and OmniFocus have them:
//
//   Today     open tasks due or starting by today, or in progress; "This evening" ones
//             in their own section. Tasks waiting on an open task, and Someday ones,
//             stay out.
//   Upcoming  open tasks that start or fall due after today, by day
//   Anytime   open tasks that can be done now: started (or no start date), not Someday
//   Someday   parked tasks
//   Logbook   finished tasks, newest first
//
// Home's Today widget and the Home Assistant summary use the same Today rule.

export const SMART_LISTS = ["today", "upcoming", "anytime", "someday", "logbook"] as const;
export type SmartList = (typeof SMART_LISTS)[number];

export const SMART_LIST_LABELS: Record<SmartList, string> = {
  today: "Today",
  upcoming: "Upcoming",
  anytime: "Anytime",
  someday: "Someday",
  logbook: "Logbook",
};

export type Plannable = {
  status: TaskStatus;
  dueDate: string | null;
  /** Fields added with smart lists; older callers can leave them out. */
  startDate?: string | null;
  someday?: boolean;
  evening?: boolean;
  waitingOn?: ReadonlyArray<{ done: boolean }>;
};

const open = (task: Plannable) => task.status !== "done";

/** Waiting on a task that isn't done yet. */
export const isWaiting = (task: Plannable) => (task.waitingOn ?? []).some((other) => !other.done);

/** Its start date has come, or it has none. */
export const hasStarted = (task: Plannable, today: string) =>
  !task.startDate || task.startDate <= today;

export function inToday(task: Plannable, today: string): boolean {
  if (!open(task) || task.someday || isWaiting(task)) return false;
  return (
    task.status === "doing" ||
    (task.dueDate !== null && task.dueDate <= today) ||
    (Boolean(task.startDate) && hasStarted(task, today))
  );
}

export function inAnytime(task: Plannable, today: string): boolean {
  return open(task) && !task.someday && hasStarted(task, today);
}

export function inSomeday(task: Plannable): boolean {
  return open(task) && Boolean(task.someday);
}

/**
 * The day an open task next matters, if that's after today: its start date when it
 * hasn't started, otherwise its due date.
 */
export function upcomingDate(task: Plannable, today: string): string | null {
  if (!open(task) || task.someday) return null;
  if (task.startDate && task.startDate > today) return task.startDate;
  if (task.dueDate && task.dueDate > today) return task.dueDate;
  return null;
}

/** Whether the task belongs in the list. The Logbook holds finished tasks. */
export function inSmartList(list: SmartList, task: Plannable, today: string): boolean {
  switch (list) {
    case "today":
      return inToday(task, today);
    case "upcoming":
      return upcomingDate(task, today) !== null;
    case "anytime":
      return inAnytime(task, today);
    case "someday":
      return inSomeday(task);
    case "logbook":
      return task.status === "done";
  }
}
