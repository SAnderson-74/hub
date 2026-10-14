import { Square } from "lucide-react";
import { Link } from "react-router";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { ghostButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { formatMinutes } from "../../../shared/time";
import { useEntries, useStopTimer, useTimers } from "../queries";
import { addDaysLocal, entryMinutes, formatElapsed } from "../week";
import { subjectLabel } from "./SubjectSelect";

/** Time logged today, with running timers and a way to stop them. */
export function TimeWidget({ today, className }: { today: string; className?: string }) {
  // Seconds tick for the running timers.
  const now = useNow(1000);
  const start = new Date(`${today}T00:00:00`);
  const entries = useEntries({ from: start, to: addDaysLocal(start, 1) });
  const timers = useTimers();
  const stop = useStopTimer();
  const error = entries.error ?? timers.error;
  const minutes = (entries.data ?? []).reduce((sum, entry) => sum + entryMinutes(entry, now), 0);
  const running = timers.data ?? [];

  return (
    <Panel
      title="Time today"
      action={
        <Link to="/time" className={ghostButton}>
          Open time
        </Link>
      }
      className={className}
    >
      {error ? (
        <ErrorNote
          error={error}
          onRetry={() => void Promise.all([entries.refetch(), timers.refetch()])}
        />
      ) : !entries.data || !timers.data ? (
        <LoadingRows rows={2} />
      ) : (
        <div className="space-y-3">
          <p className="text-2xl font-bold tracking-[-0.02em] text-fg tabular-nums">
            {formatMinutes(minutes)}
            <span className="ml-2 text-sm font-semibold text-muted">logged today</span>
          </p>
          {running.length === 0 ? (
            <p className="text-sm text-muted">No timers running.</p>
          ) : (
            <ul className="space-y-2">
              {running.map((timer) => {
                const label = subjectLabel(timer.subject) ?? (timer.note || "Timer");
                return (
                  <li
                    key={timer.id}
                    className="flex items-center gap-2 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">{label}</span>
                      <span className="block text-xs font-semibold text-accent-text tabular-nums">
                        Running {formatElapsed(timer.startedAt, now)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => stop.mutate(timer.id)}
                      disabled={stop.isPending}
                      aria-label={`Stop the timer for ${label}`}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg"
                    >
                      <Square aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {stop.isError ? (
            <p role="alert" className="text-sm text-danger">
              {stop.error.message}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
