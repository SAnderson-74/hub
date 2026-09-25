import { Play, Square } from "lucide-react";
import { useId } from "react";
import { secondaryButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { formatMinutes } from "../../../shared/time";
import { useEntries, useStartTimer, useStopTimer, useTimer } from "../queries";
import { entryMinutes } from "../week";

/** Time logged on one task, with a button to time it now. For the task sheet. */
export function TaskTime({ taskId }: { taskId: number }) {
  const headingId = useId();
  const now = useNow(30_000);
  const entries = useEntries({ subject: { type: "task", id: taskId } });
  const timer = useTimer();
  const start = useStartTimer();
  const stop = useStopTimer();
  const timingThis = timer.data?.subject?.type === "task" && timer.data.subject.id === taskId;
  const total = (entries.data ?? []).reduce((sum, entry) => sum + entryMinutes(entry, now), 0);
  const error = start.error ?? stop.error;

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={headingId} className="font-semibold text-fg">
            Time
          </h3>
          <p className="text-sm text-muted">
            {entries.data
              ? total === 0
                ? "Nothing logged yet."
                : `${formatMinutes(total)} logged${timingThis ? ", timer running" : ""}.`
              : "Loading…"}
          </p>
        </div>
        {timingThis ? (
          <button
            type="button"
            className={secondaryButton}
            disabled={stop.isPending}
            onClick={() => stop.mutate(undefined)}
          >
            <Square aria-hidden="true" className="size-4" fill="currentColor" />
            Stop timer
          </button>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            disabled={start.isPending || timer.isPending}
            onClick={() => start.mutate({ subject: { type: "task", id: taskId } })}
          >
            <Play aria-hidden="true" className="size-4" fill="currentColor" />
            Start timer
          </button>
        )}
      </div>
      {!timingThis && timer.data ? (
        <p className="mt-2 text-sm text-muted">Starting this stops the timer that's running now.</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}
