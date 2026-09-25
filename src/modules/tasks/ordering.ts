import { TASK_STATUSES, type TaskStatus } from "../../shared/tasks";

type Ordered = { id: number; sortOrder: number };

/**
 * The sort order that places an item at `index` in `items`, a list that doesn't
 * contain the item itself. Orders are fractional, so nothing else is renumbered.
 * An empty list keeps `fallback`.
 */
export function orderAt(items: readonly Ordered[], index: number, fallback: number): number {
  const before = items[index - 1];
  const after = items[index];
  if (before && after) return (before.sortOrder + after.sortOrder) / 2;
  if (after) return after.sortOrder - 1;
  if (before) return before.sortOrder + 1;
  return fallback;
}

/**
 * The new sort order for moving an item `delta` places within its list, or null
 * when it's already at that end.
 */
export function orderAfterStep(
  items: readonly Ordered[],
  id: number,
  delta: number,
): number | null {
  const from = items.findIndex((item) => item.id === id);
  const moving = items[from];
  if (!moving) return null;
  const others = items.filter((item) => item.id !== id);
  const to = Math.min(Math.max(from + delta, 0), others.length);
  if (to === from) return null;
  return orderAt(others, to, moving.sortOrder);
}

/**
 * The new sort order for dropping an item at `index` of a list (counted without the
 * item), or null when that leaves it where it already was.
 */
export function orderForDrop(
  items: readonly Ordered[],
  moving: Ordered,
  index: number,
): number | null {
  const from = items.findIndex((item) => item.id === moving.id);
  if (from !== -1 && from === index) return null;
  const others = items.filter((item) => item.id !== moving.id);
  return orderAt(others, index, moving.sortOrder);
}

/** Tasks grouped into board columns, keeping their order. */
export function groupByStatus<T extends { status: TaskStatus }>(tasks: readonly T[]) {
  const groups = Object.fromEntries(TASK_STATUSES.map((status) => [status, [] as T[]])) as Record<
    TaskStatus,
    T[]
  >;
  for (const task of tasks) groups[task.status].push(task);
  return groups;
}
