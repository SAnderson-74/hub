import { ArrowRight, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  inputClass,
  labelClass,
  secondaryButton,
} from "../../../client/components/ui";
import { useSaveSettings, useSettings } from "../../../client/lib/queries";
import { formatMinutesShort } from "../../../shared/quickAdd";
import { addDays } from "../../../shared/recurrence";
import { inAnytime, inToday, isWaiting } from "../../../shared/smartLists";
import { todaysTasks } from "../../core/home";
import { mergeTasks } from "../ordering";
import { bySuggestion, planTotals, todayPatch, tomorrowPatch } from "../plan";
import { type TaskItem, useTasks, useTasksDoneSince, useUpdateTask } from "../queries";

export type DayPlanMode = "plan" | "shutdown" | null;

const HOURS = Array.from({ length: 33 }, (_, index) => index / 2);
const ESTIMATES = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240];
/** Tasks offered to pull into today, at most. */
const SUGGESTED = 8;

const rowClass =
  "flex flex-wrap items-center gap-2 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50";

/**
 * Morning: today's tasks with estimates against the hours there are, and tasks that
 * could join them. Evening: what got done, and the rest moved to tomorrow.
 */
export function DayPlanSheet({
  mode,
  today,
  onClose,
}: {
  mode: DayPlanMode;
  today: string;
  onClose: () => void;
}) {
  const open = mode !== null;
  const openTasks = useTasks("all");
  const doneToday = useTasksDoneSince(new Date(`${today}T00:00:00`).toISOString());
  const update = useUpdateTask();
  const [message, setMessage] = useState("");
  const loaded =
    openTasks.data && doneToday.data ? mergeTasks(openTasks.data, doneToday.data.tasks) : null;
  const { open: todayOpen, done } = todaysTasks(loaded ?? [], today);
  const tomorrow = addDays(today, 1);
  const error = openTasks.error ?? doneToday.error;

  const change = (
    task: TaskItem,
    patch: Parameters<typeof update.mutate>[0]["patch"],
    said: string,
  ) => update.mutateAsync({ id: task.id, patch }).then(() => setMessage(said));
  const toTomorrow = (task: TaskItem) =>
    change(task, tomorrowPatch(task, today, tomorrow), `Moved to tomorrow: ${task.title}`);
  const moveAll = async () => {
    for (const task of todayOpen)
      await update.mutateAsync({ id: task.id, patch: tomorrowPatch(task, today, tomorrow) });
    setMessage(
      `Moved ${todayOpen.length} ${todayOpen.length === 1 ? "task" : "tasks"} to tomorrow.`,
    );
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        setMessage("");
        onClose();
      }}
      title={mode === "shutdown" ? "Shut down for the day" : "Plan the day"}
      description={
        mode === "shutdown"
          ? "See what got done, move the rest to tomorrow, and log time you didn't track."
          : "Pick today's tasks and estimate them against the hours you have."
      }
    >
      <p role="status" className={message ? "mb-4 text-sm font-semibold text-ok" : "sr-only"}>
        {message}
      </p>
      {/* Nothing inside while closed, so hidden copies of task titles don't linger. */}
      {!open ? null : error ? (
        <ErrorNote
          error={error}
          onRetry={() => void Promise.all([openTasks.refetch(), doneToday.refetch()])}
        />
      ) : !loaded ? (
        <LoadingRows rows={3} />
      ) : mode === "shutdown" ? (
        <div className="space-y-6">
          <section aria-labelledby="shutdown-done">
            <h3 id="shutdown-done" className="mb-2 font-semibold text-fg">
              Done today: {done.length}
            </h3>
            {done.length === 0 ? (
              <p className="text-sm text-muted">Nothing ticked off yet today.</p>
            ) : (
              <ul className="space-y-1 text-sm text-muted">
                {done.map((task) => (
                  <li key={task.id} className="break-words">
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="shutdown-left">
            <h3 id="shutdown-left" className="mb-2 font-semibold text-fg">
              Still open: {todayOpen.length}
            </h3>
            {todayOpen.length === 0 ? (
              <p className="text-sm text-muted">Nothing left for today.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {todayOpen.map((task) => (
                    <li key={task.id} className={rowClass}>
                      <span className="min-w-0 flex-1 font-semibold break-words text-fg">
                        {task.title}
                      </span>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={update.isPending}
                        onClick={() => void toTomorrow(task).catch(() => undefined)}
                        aria-label={`Move ${task.title} to tomorrow`}
                      >
                        <ArrowRight aria-hidden="true" className="size-4" />
                        Tomorrow
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`${secondaryButton} mt-3`}
                  disabled={update.isPending}
                  onClick={() => void moveAll().catch(() => undefined)}
                >
                  Move all to tomorrow
                </button>
              </>
            )}
          </section>
          <section aria-labelledby="shutdown-time">
            <h3 id="shutdown-time" className="mb-2 font-semibold text-fg">
              Time you didn't track
            </h3>
            <Link to="/time?do=add-entry" className={secondaryButton} onClick={onClose}>
              Log time
            </Link>
          </section>
        </div>
      ) : (
        <PlanView
          todayOpen={todayOpen}
          others={(openTasks.data ?? [])
            .filter((task) => inAnytime(task, today) && !inToday(task, today) && !isWaiting(task))
            .sort(bySuggestion)}
          onEstimate={(task, minutes) =>
            void change(
              task,
              { estimateMinutes: minutes },
              minutes === null
                ? `Estimate cleared: ${task.title}`
                : `Estimate saved: ${task.title}`,
            ).catch(() => undefined)
          }
          onTomorrow={(task) => void toTomorrow(task).catch(() => undefined)}
          onToday={(task) =>
            void change(task, todayPatch(today), `Added to today: ${task.title}`).catch(
              () => undefined,
            )
          }
          busy={update.isPending}
        />
      )}
      {update.isError ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {update.error.message}
        </p>
      ) : null}
    </Sheet>
  );
}

function PlanView({
  todayOpen,
  others,
  onEstimate,
  onTomorrow,
  onToday,
  busy,
}: {
  todayOpen: TaskItem[];
  others: TaskItem[];
  onEstimate: (task: TaskItem, minutes: number | null) => void;
  onTomorrow: (task: TaskItem) => void;
  onToday: (task: TaskItem) => void;
  busy: boolean;
}) {
  const ids = useId();
  const [showAll, setShowAll] = useState(false);
  const settings = useSettings();
  const save = useSaveSettings();
  const hours = settings.data?.dayPlan.hours ?? 6;
  const { minutes, unestimated } = planTotals(todayOpen);
  const available = hours * 60;
  const over = minutes - available;
  const percent =
    available === 0
      ? minutes > 0
        ? 100
        : 0
      : Math.min(100, Math.round((minutes / available) * 100));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="font-semibold text-fg">
            Planned {formatMinutesShort(minutes)} of {hours} h
          </p>
          <div>
            <label htmlFor={`${ids}-hours`} className={labelClass}>
              Hours for tasks
            </label>
            <select
              id={`${ids}-hours`}
              value={String(hours)}
              disabled={!settings.data || save.isPending}
              onChange={(event) => save.mutate({ dayPlan: { hours: Number(event.target.value) } })}
              className={`${inputClass} max-w-32`}
            >
              {HOURS.map((value) => (
                <option key={value} value={String(value)}>
                  {value} h
                </option>
              ))}
            </select>
          </div>
        </div>
        <ProgressBar
          percent={percent}
          label="Planned time against the hours you have"
          over={over > 0}
        />
        <p className={`text-sm ${over > 0 ? "text-danger" : "text-muted"}`}>
          {over > 0
            ? `${formatMinutesShort(over)} more than you have. Move something to tomorrow.`
            : over === 0
              ? "Every hour is planned."
              : `${formatMinutesShort(available - minutes)} left to plan.`}
          {unestimated > 0
            ? ` ${unestimated} ${unestimated === 1 ? "task has" : "tasks have"} no estimate yet.`
            : ""}
        </p>
      </div>

      <section aria-labelledby="plan-today">
        <h3 id="plan-today" className="mb-2 font-semibold text-fg">
          Today
        </h3>
        {todayOpen.length === 0 ? (
          <p className="text-sm text-muted">Nothing for today yet. Add some from below.</p>
        ) : (
          <ul className="space-y-2">
            {todayOpen.map((task) => (
              <li key={task.id} className={rowClass}>
                <span className="w-full min-w-0 font-semibold break-words text-fg sm:w-auto sm:flex-1">
                  {task.title}
                </span>
                <label className="sr-only" htmlFor={`${ids}-estimate-${task.id}`}>
                  Estimate for {task.title}
                </label>
                <select
                  id={`${ids}-estimate-${task.id}`}
                  value={task.estimateMinutes === null ? "" : String(task.estimateMinutes)}
                  disabled={busy}
                  onChange={(event) =>
                    onEstimate(task, event.target.value === "" ? null : Number(event.target.value))
                  }
                  className={`${inputClass} h-11 max-w-36`}
                >
                  <option value="">No estimate</option>
                  {[
                    ...new Set([
                      ...ESTIMATES,
                      ...(task.estimateMinutes ? [task.estimateMinutes] : []),
                    ]),
                  ]
                    .sort((a, b) => a - b)
                    .map((value) => (
                      <option key={value} value={String(value)}>
                        {formatMinutesShort(value)}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => onTomorrow(task)}
                  aria-label={`Move ${task.title} to tomorrow`}
                >
                  <ArrowRight aria-hidden="true" className="size-4" />
                  Tomorrow
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section aria-labelledby="plan-add">
          <h3 id="plan-add" className="mb-2 font-semibold text-fg">
            Could do today
          </h3>
          <ul className="space-y-2">
            {(showAll ? others : others.slice(0, SUGGESTED)).map((task) => (
              <li key={task.id} className={rowClass}>
                <span className="min-w-0 flex-1 break-words text-fg">
                  {task.title}
                  {task.estimateMinutes ? (
                    <span className="block text-sm text-muted">
                      {formatMinutesShort(task.estimateMinutes)}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => onToday(task)}
                  aria-label={`Add ${task.title} to today`}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Today
                </button>
              </li>
            ))}
          </ul>
          {others.length > SUGGESTED && !showAll ? (
            <button
              type="button"
              className={`${ghostButton} mt-2 -ml-4`}
              onClick={() => setShowAll(true)}
            >
              Show {others.length - SUGGESTED} more
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
