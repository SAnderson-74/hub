import { Play, Plus, Square } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import {
  type RunningTimer,
  useStartTimer,
  useStopAllTimers,
  useStopTimer,
  useTimers,
} from "../queries";
import { formatClock, formatElapsed } from "../week";
import { parseSubject, SubjectSelect, subjectLabel } from "./SubjectSelect";

/** Running timers, each with its own stop button, and a form to start another. */
export function TimerPanel({ className = "" }: { className?: string }) {
  const timers = useTimers();
  const running = timers.data ?? [];
  const stopAll = useStopAllTimers();
  const [adding, setAdding] = useState(false);
  const showForm = running.length === 0 || adding;

  return (
    <Panel
      title="Timers"
      className={className}
      description={
        running.length === 0
          ? undefined
          : running.length === 1
            ? "1 running."
            : `${running.length} running. Each counts its own time.`
      }
    >
      {timers.isPending ? (
        <LoadingRows rows={1} />
      ) : timers.isError ? (
        <ErrorNote error={timers.error} onRetry={() => void timers.refetch()} />
      ) : (
        <div className="space-y-5">
          {running.length > 0 ? (
            <ul className="space-y-3">
              {running.map((timer) => (
                <RunningTimerRow key={timer.id} timer={timer} />
              ))}
            </ul>
          ) : null}
          {showForm ? (
            <StartTimerForm
              another={running.length > 0}
              onStarted={() => setAdding(false)}
              onCancel={running.length > 0 ? () => setAdding(false) : undefined}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Start another timer
              </button>
              {running.length > 1 ? (
                <button
                  type="button"
                  className={ghostButton}
                  disabled={stopAll.isPending}
                  onClick={() => stopAll.mutate(undefined)}
                >
                  <Square aria-hidden="true" className="size-4" fill="currentColor" />
                  Stop all
                </button>
              ) : null}
            </div>
          )}
          {stopAll.isError ? (
            <p role="alert" className="text-sm text-danger">
              {stopAll.error.message}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function RunningTimerRow({ timer }: { timer: RunningTimer }) {
  const now = useNow(1000);
  const stop = useStopTimer();
  const label = subjectLabel(timer.subject);
  const name = label || timer.note || "Timer";
  return (
    <li
      aria-label={name}
      className="flex items-center gap-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-3xl font-bold tracking-[-0.03em] tabular-nums text-fg"
          aria-hidden="true"
        >
          {formatElapsed(timer.startedAt, now)}
        </p>
        {label ? <p className="mt-1 font-semibold break-words text-accent-text">{label}</p> : null}
        {timer.note ? <p className="mt-0.5 break-words text-muted">{timer.note}</p> : null}
        <p className="mt-0.5 text-sm text-muted">Since {formatClock(new Date(timer.startedAt))}</p>
        {stop.isError ? (
          <p role="alert" className="mt-1 text-sm text-danger">
            {stop.error.message}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className={primaryButton}
        disabled={stop.isPending}
        onClick={() => stop.mutate(timer.id)}
        aria-label={`Stop timer: ${name}`}
      >
        <Square aria-hidden="true" className="size-4" fill="currentColor" />
        Stop
      </button>
    </li>
  );
}

function StartTimerForm({
  another,
  onStarted,
  onCancel,
}: {
  another: boolean;
  onStarted: () => void;
  onCancel?: (() => void) | undefined;
}) {
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("");
  const start = useStartTimer();
  const ids = useId();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    start.mutate(
      { note: note.trim(), subject: parseSubject(subject) },
      {
        onSuccess: () => {
          setNote("");
          setSubject("");
          onStarted();
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`${ids}-note`} className={labelClass}>
          What are you working on?
        </label>
        <input
          id={`${ids}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="Optional note"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${ids}-subject`} className={labelClass}>
          For
        </label>
        <SubjectSelect id={`${ids}-subject`} value={subject} onChange={setSubject} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={start.isPending}>
          <Play aria-hidden="true" className="size-4" fill="currentColor" />
          {another ? "Start another timer" : "Start timer"}
        </button>
        {onCancel ? (
          <button type="button" className={ghostButton} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      {start.isError ? (
        <p role="alert" className="text-sm text-danger">
          {start.error.message}
        </p>
      ) : null}
    </form>
  );
}
