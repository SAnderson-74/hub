import { ArrowRightLeft } from "lucide-react";
import { type DragEvent, useState } from "react";
import { useMediaQuery } from "../../../client/lib/useMediaQuery";
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "../../../shared/tasks";
import { groupByStatus, orderForDrop } from "../ordering";
import type { TaskItem } from "../queries";
import { TaskMeta } from "./TaskMeta";

const DONE_PAGE = 20;

export type TaskMove = { task: TaskItem; status: TaskStatus; sortOrder: number };

type TaskBoardProps = {
  tasks: TaskItem[];
  today: string;
  projectNames?: Map<number, string>;
  onOpen: (task: TaskItem) => void;
  /** Opens the move menu, the way to move cards on phones and with a keyboard. */
  onMoveMenu: (task: TaskItem) => void;
  onMove: (move: TaskMove) => void;
};

type DropTarget = { status: TaskStatus; index: number };

/** Where the pointer is among a column's cards (ignoring the one being dragged). */
function dropIndex(event: DragEvent<HTMLElement>, draggingId: number): number {
  const cards = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-task-id]")].filter(
    (card) => card.dataset.taskId !== String(draggingId),
  );
  const index = cards.findIndex((card) => {
    const box = card.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });
  return index === -1 ? cards.length : index;
}

function DropLine() {
  return <li aria-hidden="true" className="h-1 rounded-full bg-accent" />;
}

export function TaskBoard({
  tasks,
  today,
  projectNames,
  onOpen,
  onMoveMenu,
  onMove,
}: TaskBoardProps) {
  // Dragging needs a mouse or trackpad; on touch screens the move menu does the job.
  const canDrag = useMediaQuery("(pointer: fine)");
  const [dragging, setDragging] = useState<TaskItem | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [doneShown, setDoneShown] = useState(DONE_PAGE);
  const columns = groupByStatus(tasks);

  const endDrag = () => {
    setDragging(null);
    setDrop(null);
  };

  const onDrop = (status: TaskStatus) => {
    if (!dragging || !drop) return endDrag();
    const sortOrder = orderForDrop(columns[status], dragging, drop.index);
    if (status !== dragging.status || sortOrder !== null) {
      onMove({ task: dragging, status, sortOrder: sortOrder ?? dragging.sortOrder });
    }
    endDrag();
  };

  return (
    <div className="relative -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0">
      {TASK_STATUSES.map((status) => {
        const column = columns[status];
        const visible = status === "done" ? column.slice(0, doneShown) : column;
        const target = drop?.status === status ? drop.index : null;
        let othersSeen = 0;
        return (
          <section
            key={status}
            aria-labelledby={`board-${status}`}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const index = dropIndex(event, dragging.id);
              if (drop?.status !== status || drop.index !== index) setDrop({ status, index });
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              onDrop(status);
            }}
            className={`relative flex w-[82%] shrink-0 snap-start flex-col rounded-panel bg-mantle p-3 ring-1 transition-colors sm:w-72 md:w-auto ${
              target !== null ? "ring-accent/60" : "ring-surface-0/60"
            }`}
          >
            <h2
              id={`board-${status}`}
              className="flex items-baseline gap-2 px-2 pt-1 pb-3 font-semibold text-fg"
            >
              {TASK_STATUS_LABELS[status]}
              <span className="text-sm text-muted tabular-nums">{column.length}</span>
            </h2>
            <ul className="flex min-h-24 flex-1 flex-col gap-2">
              {visible.map((task) => {
                const isDragged = dragging?.id === task.id;
                const lineBefore = !isDragged && target === othersSeen;
                if (!isDragged) othersSeen += 1;
                return [
                  lineBefore ? <DropLine key={`line-${task.id}`} /> : null,
                  <li
                    key={task.id}
                    data-task-id={task.id}
                    draggable={canDrag}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(task.id));
                      setDragging(task);
                    }}
                    onDragEnd={endDrag}
                    className={`flex items-start gap-1 rounded-tile bg-base py-1 pr-1 pl-3 ring-1 ring-surface-0/70 ${
                      canDrag ? "cursor-grab active:cursor-grabbing" : ""
                    } ${isDragged ? "opacity-40" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(task)}
                      className="min-h-11 min-w-0 flex-1 rounded-control py-2 text-left"
                    >
                      <span
                        className={`block font-semibold break-words ${
                          status === "done" ? "text-muted" : "text-fg"
                        }`}
                      >
                        {task.title}
                      </span>
                      <TaskMeta
                        task={task}
                        today={today}
                        projectName={
                          projectNames && task.projectId !== null
                            ? projectNames.get(task.projectId)
                            : undefined
                        }
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveMenu(task)}
                      aria-label={`Move “${task.title}”`}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg"
                    >
                      <ArrowRightLeft aria-hidden="true" className="size-4" />
                    </button>
                  </li>,
                ];
              })}
              {target !== null && target >= othersSeen ? <DropLine /> : null}
              {column.length === 0 && target === null ? (
                <li className="grid flex-1 place-items-center rounded-tile px-3 py-6 text-center text-sm text-faint border border-dashed border-surface-1">
                  {canDrag ? "Drag tasks here" : "No tasks"}
                </li>
              ) : null}
            </ul>
            {status === "done" && column.length > doneShown ? (
              <button
                type="button"
                onClick={() => setDoneShown((shown) => shown + DONE_PAGE)}
                className="mt-2 h-11 rounded-full px-4 text-sm font-semibold text-accent-text hover:bg-surface-0"
              >
                Show {Math.min(DONE_PAGE, column.length - doneShown)} more
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
