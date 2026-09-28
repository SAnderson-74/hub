import { Play, Square } from "lucide-react";
import { useId } from "react";
import { secondaryButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import type { EntityRef } from "../../../shared/entities";
import { formatMinutes } from "../../../shared/time";
import { useEntries, useStartTimer, useStopTimer, useTimers } from "../queries";
import { entryMinutes } from "../week";

/** Time logged on one task, item, or other subject, with a button to time it now. For sheets. */
export function SubjectTime({ subject }: { subject: EntityRef }) {
  const headingId = useId();
  const now = useNow(30_000);
  const entries = useEntries({ subject });
  const timers = useTimers();
  const start = useStartTimer();
  const stop = useStopTimer();
  const running = timers.data?.find(
    (timer) => timer.subject?.type === subject.type && timer.subject.id === subject.id,
  );
  const timingThis = running !== undefined;
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
            onClick={() => running && stop.mutate(running.id)}
          >
            <Square aria-hidden="true" className="size-4" fill="currentColor" />
            Stop timer
          </button>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            disabled={start.isPending || timers.isPending}
            onClick={() => start.mutate({ subject })}
          >
            <Play aria-hidden="true" className="size-4" fill="currentColor" />
            Start timer
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}
