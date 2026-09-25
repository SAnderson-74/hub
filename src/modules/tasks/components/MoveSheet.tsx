import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp } from "lucide-react";
import { Sheet } from "../../../client/components/Sheet";
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "../../../shared/tasks";
import { groupByStatus, orderAfterStep, orderAt } from "../ordering";
import type { TaskItem } from "../queries";
import type { TaskMove } from "./TaskBoard";

const optionClass =
  "flex min-h-12 w-full items-center gap-3 rounded-control px-4 text-left font-semibold text-fg hover:bg-surface-0 disabled:cursor-not-allowed disabled:opacity-40";

/** Move a card to another column (to the top) or up and down its own column. */
export function MoveSheet({
  task,
  tasks,
  onMove,
  onClose,
}: {
  task: TaskItem | null;
  tasks: TaskItem[];
  onMove: (move: TaskMove) => void;
  onClose: () => void;
}) {
  const columns = groupByStatus(tasks);
  const column = task ? columns[task.status] : [];

  const move = (status: TaskStatus, sortOrder: number | null) => {
    if (task && sortOrder !== null) onMove({ task, status, sortOrder });
    onClose();
  };
  const step = (delta: number) => (task ? orderAfterStep(column, task.id, delta) : null);
  const steps = [
    { label: "Move to top", icon: ChevronsUp, order: step(-column.length) },
    { label: "Move up", icon: ArrowUp, order: step(-1) },
    { label: "Move down", icon: ArrowDown, order: step(1) },
    { label: "Move to bottom", icon: ChevronsDown, order: step(column.length) },
  ];

  return (
    <Sheet
      open={task !== null}
      onClose={onClose}
      variant="dialog"
      title={task ? `Move “${task.title}”` : "Move task"}
      description={task ? `In ${TASK_STATUS_LABELS[task.status]} now.` : undefined}
    >
      {task ? (
        <div className="space-y-5">
          <section aria-labelledby="move-to">
            <h3 id="move-to" className="mb-2 text-sm font-semibold text-muted">
              Move to
            </h3>
            <ul className="space-y-1">
              {TASK_STATUSES.filter((status) => status !== task.status).map((status) => (
                <li key={status}>
                  <button
                    type="button"
                    className={optionClass}
                    onClick={() => move(status, orderAt(columns[status], 0, task.sortOrder))}
                  >
                    {TASK_STATUS_LABELS[status]}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {column.length > 1 ? (
            <section aria-labelledby="move-order">
              <h3 id="move-order" className="mb-2 text-sm font-semibold text-muted">
                Order in {TASK_STATUS_LABELS[task.status]}
              </h3>
              <ul className="space-y-1">
                {steps.map(({ label, icon: Icon, order }) => (
                  <li key={label}>
                    <button
                      type="button"
                      className={optionClass}
                      disabled={order === null}
                      onClick={() => move(task.status, order)}
                    >
                      <Icon aria-hidden="true" className="size-5 text-muted" />
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
