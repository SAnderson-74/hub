import { CalendarDays, Flag } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { ghostButton } from "../../../client/components/ui";
import { EARNED_STATUSES } from "../../../shared/education";
import { TermSummary } from "../../education/components/Pacing";
import { StreakSettingsLink, StudyStreakSummary } from "../../education/components/StudyStreak";
import { defaultTerm } from "../../education/pacing";
import { useTerms } from "../../education/queries";
import { useGoals } from "../../goals/queries";
import { TaskCheckbox } from "../../tasks/components/TaskList";
import { TaskMeta } from "../../tasks/components/TaskMeta";
import { describeDue, formatShortDate } from "../../tasks/dates";
import { type TaskItem, useTasks, useUpdateTask } from "../../tasks/queries";
import { nextMilestones, todaySummary, todaysTasks } from "../home";

/** How many open tasks and milestones Home shows before pointing to the full page. */
const OPEN_SHOWN = 6;
const DONE_SHOWN = 3;
const MILESTONES_SHOWN = 5;

const dueTone = { danger: "text-danger", warn: "text-warn", muted: "text-muted" } as const;

const rowClass =
  "flex items-start gap-1 rounded-tile bg-base/80 py-1 pr-2 pl-1 ring-1 ring-surface-0/50";

/** Open tasks due by today or in progress, with the ones finished today below. */
export function TodayPanel({ today, className }: { today: string; className?: string }) {
  const tasks = useTasks("all");
  const update = useUpdateTask();
  const [announcement, setAnnouncement] = useState("");
  const { open, done } = todaysTasks(tasks.data ?? [], today);

  const toggle = (task: TaskItem, isDone: boolean) =>
    update
      .mutateAsync({ id: task.id, patch: { status: isDone ? "done" : "todo" } })
      .then(() => setAnnouncement(isDone ? `Done: ${task.title}` : `Back to do: ${task.title}`))
      .catch(() => undefined);

  return (
    <Panel
      title="Today"
      description={tasks.data ? todaySummary(open, done.length, today) : undefined}
      action={
        <Link to="/tasks" className={ghostButton}>
          All tasks
        </Link>
      }
      className={className}
    >
      {tasks.isPending ? (
        <LoadingRows rows={3} />
      ) : tasks.isError ? (
        <ErrorNote error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : open.length === 0 && done.length === 0 ? (
        <p className="text-muted">
          Nothing due today. Tasks due today or earlier, and tasks in progress, show here.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {[...open.slice(0, OPEN_SHOWN), ...done.slice(0, DONE_SHOWN)].map((task) => (
              <li key={task.id} className={rowClass}>
                <TaskCheckbox task={task} onToggle={(isDone) => toggle(task, isDone)} />
                <Link
                  to={`/tasks?task=${task.id}`}
                  className="block min-h-11 min-w-0 flex-1 rounded-control py-2.5"
                >
                  <span
                    className={`block font-semibold break-words ${
                      task.status === "done"
                        ? "text-muted line-through decoration-surface-2"
                        : "text-fg"
                    }`}
                  >
                    {task.title}
                  </span>
                  {task.status === "doing" ? (
                    <span className="mt-1 block text-xs font-semibold text-accent-text">
                      In progress
                    </span>
                  ) : null}
                  <TaskMeta task={task} today={today} />
                </Link>
              </li>
            ))}
          </ul>
          {open.length > OPEN_SHOWN ? (
            <p className="mt-3 text-sm text-muted">
              {open.length - OPEN_SHOWN} more on the{" "}
              <Link to="/tasks" className="font-semibold text-accent-text underline">
                Tasks page
              </Link>
              .
            </p>
          ) : null}
        </>
      )}
      {update.isError ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {update.error.message}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </Panel>
  );
}

/** Open milestones of active goals, soonest first. */
export function MilestonesPanel({ today, className }: { today: string; className?: string }) {
  const goals = useGoals();
  const upcoming = nextMilestones(goals.data ?? [], MILESTONES_SHOWN);
  return (
    <Panel
      title="Next milestones"
      action={
        <Link to="/goals" className={ghostButton}>
          All goals
        </Link>
      }
      className={className}
    >
      {goals.isPending ? (
        <LoadingRows rows={2} />
      ) : goals.isError ? (
        <ErrorNote error={goals.error} onRetry={() => void goals.refetch()} />
      ) : upcoming.length === 0 ? (
        <p className="text-muted">No open milestones. Add them to a goal on the Goals page.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((milestone) => {
            const due = milestone.targetDate ? describeDue(milestone.targetDate, today) : null;
            return (
              <li key={milestone.id}>
                <Link
                  to={`/goals?goal=${milestone.goalId}`}
                  className="block min-h-11 rounded-tile bg-base/80 px-4 py-3 ring-1 ring-surface-0/50 hover:ring-surface-1"
                >
                  <span className="block font-semibold break-words text-fg">{milestone.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                    <span className="inline-flex min-w-0 items-center gap-1 text-muted">
                      <Flag aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="break-words">{milestone.goalTitle}</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${due ? dueTone[due.tone] : "text-muted"}`}
                    >
                      <CalendarDays aria-hidden="true" className="size-3.5" />
                      {due ? due.label : "No date"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** The study streak without its calendar. */
export function StreakPanel({ className }: { className?: string }) {
  return (
    <Panel title="Study streak" action={<StreakSettingsLink />} className={className}>
      <StudyStreakSummary calendar={false} />
    </Panel>
  );
}

/** Credits against the goal for the current term (or the next, or the latest). */
export function TermPanel({ today, className }: { today: string; className?: string }) {
  const terms = useTerms();
  const term = defaultTerm(terms.data ?? [], today);
  const earned = term?.courses.filter((course) => EARNED_STATUSES.includes(course.status)) ?? [];
  return (
    <Panel
      title="Term progress"
      description={
        term
          ? `${term.name}: ${formatShortDate(term.startDate, today)} to ${formatShortDate(term.endDate, today)}.`
          : undefined
      }
      action={
        <Link to={term ? `/courses?term=${term.id}` : "/courses"} className={ghostButton}>
          Open courses
        </Link>
      }
      className={className}
    >
      {terms.isPending ? (
        <LoadingRows rows={2} />
      ) : terms.isError ? (
        <ErrorNote error={terms.error} onRetry={() => void terms.refetch()} />
      ) : !term ? (
        <p className="text-muted">No terms yet. Plan one on the Courses page.</p>
      ) : (
        <>
          <TermSummary term={term} today={today} />
          <p className="mt-3 text-sm text-muted">
            {earned.length} of {term.courses.length}{" "}
            {term.courses.length === 1 ? "course" : "courses"} passed or transferred.
          </p>
        </>
      )}
    </Panel>
  );
}
