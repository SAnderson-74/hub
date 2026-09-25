import { Play, Square } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { inputClass, labelClass, primaryButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { useStartTimer, useStopTimer, useTimer } from "../queries";
import { formatClock, formatElapsed } from "../week";
import { parseSubject, SubjectSelect, subjectLabel } from "./SubjectSelect";

export function TimerPanel({ className = "" }: { className?: string }) {
  const timer = useTimer();
  const running = timer.data ?? null;
  return (
    <Panel
      title="Timer"
      className={className}
      description={
        running ? `Running since ${formatClock(new Date(running.startedAt))}.` : undefined
      }
    >
      {timer.isPending ? (
        <LoadingRows rows={1} />
      ) : timer.isError ? (
        <ErrorNote error={timer.error} onRetry={() => void timer.refetch()} />
      ) : running ? (
        <RunningTimer timer={running} />
      ) : (
        <StartTimerForm />
      )}
    </Panel>
  );
}

function RunningTimer({ timer }: { timer: NonNullable<ReturnType<typeof useTimer>["data"]> }) {
  const now = useNow(1000);
  const stop = useStopTimer();
  const label = subjectLabel(timer.subject);
  return (
    <div className="space-y-4">
      <div>
        <p
          className="text-5xl font-bold tracking-[-0.03em] tabular-nums text-fg"
          aria-hidden="true"
        >
          {formatElapsed(timer.startedAt, now)}
        </p>
        {label ? <p className="mt-2 font-semibold text-accent-text">{label}</p> : null}
        {timer.note ? <p className="mt-1 text-muted">{timer.note}</p> : null}
      </div>
      <button
        type="button"
        className={primaryButton}
        disabled={stop.isPending}
        onClick={() => stop.mutate(undefined)}
      >
        <Square aria-hidden="true" className="size-4" fill="currentColor" />
        Stop timer
      </button>
      {stop.isError ? (
        <p role="alert" className="text-sm text-danger">
          {stop.error.message}
        </p>
      ) : null}
    </div>
  );
}

function StartTimerForm() {
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
      <button type="submit" className={primaryButton} disabled={start.isPending}>
        <Play aria-hidden="true" className="size-4" fill="currentColor" />
        Start timer
      </button>
      {start.isError ? (
        <p role="alert" className="text-sm text-danger">
          {start.error.message}
        </p>
      ) : null}
    </form>
  );
}
