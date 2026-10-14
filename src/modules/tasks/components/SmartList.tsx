import { inSmartList, type SmartList, upcomingDate } from "../../../shared/smartLists";
import { todaysTasks } from "../../core/home";
import { formatShortDate } from "../dates";
import type { TaskItem } from "../queries";
import { ShowMoreDone, type TaskListProps, TaskRow } from "./TaskList";

type Section = { id: string; label: string; tasks: TaskItem[] };

const EMPTY: Record<SmartList, string> = {
  today: "Nothing for today. Tasks due or starting today, and ones in progress, show here.",
  upcoming: "Nothing coming up. Tasks with a later due or start date show here, by day.",
  anytime: "Nothing to pick up. Open tasks that have started show here.",
  someday: "Nothing parked. Mark a task Someday to keep it here until you're ready.",
  logbook: "Nothing finished yet.",
};

const finished = (task: TaskItem) => task.completedAt ?? "~";

/** The sections a smart list shows, from the tasks loaded for the page. */
export function smartSections(list: SmartList, tasks: TaskItem[], today: string): Section[] {
  if (list === "today") {
    const { open, done } = todaysTasks(tasks, today);
    return [
      { id: "today", label: "Today", tasks: open.filter((task) => !task.evening) },
      { id: "evening", label: "This evening", tasks: open.filter((task) => task.evening) },
      { id: "done-today", label: "Done today", tasks: done },
    ];
  }
  if (list === "upcoming") {
    const byDay = new Map<string, TaskItem[]>();
    for (const task of tasks) {
      const day = upcomingDate(task, today);
      if (day) byDay.set(day, [...(byDay.get(day) ?? []), task]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, items]) => ({ id: day, label: formatShortDate(day, today), tasks: items }));
  }
  const shown = tasks.filter((task) => inSmartList(list, task, today));
  if (list === "logbook") {
    shown.sort((a, b) => (finished(a) < finished(b) ? 1 : -1) || b.id - a.id);
  }
  return [{ id: list, label: "", tasks: shown }];
}

/** Today, Upcoming, Anytime, Someday, or the Logbook. */
export function SmartTaskList(
  props: Omit<TaskListProps, "tasks"> & { list: SmartList; tasks: TaskItem[] },
) {
  const { list, tasks, today } = props;
  const sections = smartSections(list, tasks, today).filter((section) => section.tasks.length > 0);
  return (
    <div className="space-y-6">
      {sections.length === 0 ? (
        <p className="rounded-tile bg-mantle p-5 text-muted ring-1 ring-surface-0/60">
          {EMPTY[list]}
        </p>
      ) : null}
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={section.label ? `smart-${section.id}` : undefined}
          aria-label={section.label ? undefined : "Tasks"}
        >
          {section.label ? (
            <h2
              id={`smart-${section.id}`}
              className="mb-2 flex items-baseline gap-2 px-1 font-semibold text-fg"
            >
              {section.label}
              <span className="text-sm font-semibold text-muted tabular-nums">
                {section.tasks.length}
              </span>
            </h2>
          ) : null}
          <ul className="space-y-2">
            {section.tasks.map((task) => (
              <TaskRow key={task.id} {...props} task={task} />
            ))}
          </ul>
        </section>
      ))}
      {list === "logbook" ? (
        <ShowMoreDone {...props} shown={tasks.filter((task) => task.status === "done").length} />
      ) : null}
    </div>
  );
}
