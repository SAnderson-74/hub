import type { TaskStatus } from "../../shared/tasks";
import { localDate } from "../tasks/dates";

/** Plain string order. localeCompare would sort "~" (our "no date") before digits. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const NO_DATE = "~";

type TaskLike = {
  id: number;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  completedAt: string | null;
  sortOrder: number;
};

/** Overdue and due-today tasks sort by date; tasks only in progress come after. */
const dueBy = (task: TaskLike, today: string) =>
  task.dueDate !== null && task.dueDate <= today ? task.dueDate : NO_DATE;

/**
 * What's on for today: open tasks that are due by today or in progress, then tasks
 * finished today. A task just ticked off has no completion time until the server
 * answers, so it counts as finished today.
 */
export function todaysTasks<T extends TaskLike>(
  tasks: readonly T[],
  today: string,
): { open: T[]; done: T[] } {
  const open = tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        ((task.dueDate !== null && task.dueDate <= today) || task.status === "doing"),
    )
    .sort(
      (a, b) =>
        byText(dueBy(a, today), dueBy(b, today)) ||
        b.priority - a.priority ||
        a.sortOrder - b.sortOrder ||
        a.id - b.id,
    );
  const done = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        (task.completedAt === null || localDate(new Date(task.completedAt)) === today),
    )
    .sort((a, b) => byText(b.completedAt ?? NO_DATE, a.completedAt ?? NO_DATE) || a.id - b.id);
  return { open, done };
}

/** "2 to do, 1 overdue. 3 done today." */
export function todaySummary(
  open: readonly Pick<TaskLike, "dueDate">[],
  doneCount: number,
  today: string,
): string {
  const overdue = open.filter((task) => task.dueDate !== null && task.dueDate < today).length;
  const parts: string[] = [];
  if (open.length === 0) parts.push("Nothing left for today.");
  else parts.push(`${open.length} to do${overdue > 0 ? `, ${overdue} overdue` : ""}.`);
  if (doneCount > 0) parts.push(`${doneCount} done today.`);
  return parts.join(" ");
}

type GoalLike = {
  id: number;
  title: string;
  status: string;
  milestones: Array<{ id: number; title: string; targetDate: string | null; done: boolean }>;
};

export type UpcomingMilestone = {
  id: number;
  title: string;
  targetDate: string | null;
  goalId: number;
  goalTitle: string;
};

/**
 * Open milestones of active goals, soonest target first. Milestones without a date
 * come last, in goal order.
 */
export function nextMilestones(goals: readonly GoalLike[], limit: number): UpcomingMilestone[] {
  return (
    goals
      .filter((goal) => goal.status === "active")
      .flatMap((goal) =>
        goal.milestones
          .filter((milestone) => !milestone.done)
          .map((milestone) => ({
            id: milestone.id,
            title: milestone.title,
            targetDate: milestone.targetDate,
            goalId: goal.id,
            goalTitle: goal.title,
          })),
      )
      // A stable sort keeps goal order among equal dates.
      .sort((a, b) => byText(a.targetDate ?? NO_DATE, b.targetDate ?? NO_DATE))
      .slice(0, limit)
  );
}
