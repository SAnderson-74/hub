import { useEffect, useId, useRef, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import {
  BREAK_CHOICES,
  blockEntry,
  countdown,
  type FocusState,
  loadFocus,
  saveFocus,
  WORK_CHOICES,
} from "../focus";
import { useSaveEntry } from "../queries";
import { parseSubject, SubjectSelect } from "./SubjectSelect";

const MINUTE = 60_000;

/**
 * Work and break blocks on a task, course, or anything else. Each finished work block
 * is saved as a time entry, so it counts toward the week and, on a course, the study
 * streak. It keeps going across a reload, and catches up on blocks that ended while
 * the page was closed.
 */
export function FocusPanel({ className }: { className?: string }) {
  const ids = useId();
  const save = useSaveEntry();
  const [state, setStateRaw] = useState<FocusState | null>(loadFocus);
  const [subject, setSubject] = useState(state?.subject ?? "");
  const [workMinutes, setWork] = useState(state?.workMinutes ?? 25);
  const [breakMinutes, setBreak] = useState(state?.breakMinutes ?? 5);
  const [message, setMessage] = useState("");
  const now = useNow(state && state.phase !== "ready" ? 1_000 : 60_000).getTime();
  const saving = useRef(false);

  const setState = (next: FocusState | null) => {
    saveFocus(next);
    setStateRaw(next);
  };

  const logBlock = (startedAt: number, endedAt: number, done: string) => {
    const minutes = Math.round((endedAt - startedAt) / MINUTE);
    if (minutes < 1) {
      setMessage("Under a minute, so nothing was saved.");
      return;
    }
    save.mutate(
      {
        id: null,
        json: {
          ...blockEntry(startedAt, endedAt),
          note: "Focus",
          subject: parseSubject(state?.subject ?? subject),
        },
      },
      {
        onSuccess: () => setMessage(done),
        onError: () => setMessage("Couldn't save that block. Add it by hand with Log time, below."),
      },
    );
  };

  // When a phase runs out: save the work block and start the break, or end the break.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs as time passes; logBlock and setState are stable enough for this
  useEffect(() => {
    if (!state || state.phase === "ready" || now < state.endsAt || saving.current) return;
    if (state.phase === "work") {
      saving.current = true;
      const breakEnds = state.endsAt + state.breakMinutes * MINUTE;
      const rounds = state.rounds + 1;
      setState(
        now >= breakEnds
          ? { ...state, phase: "ready", rounds, startedAt: breakEnds, endsAt: breakEnds }
          : { ...state, phase: "break", rounds, startedAt: state.endsAt, endsAt: breakEnds },
      );
      logBlock(
        state.startedAt,
        state.endsAt,
        `Work block saved: ${state.workMinutes} minutes. Take a break.`,
      );
      navigator.vibrate?.(200);
      saving.current = false;
    } else {
      setState({ ...state, phase: "ready", startedAt: state.endsAt });
      setMessage("Break's over. Start the next block when you're ready.");
      navigator.vibrate?.(200);
    }
  }, [now, state]);

  const start = () => {
    const at = Date.now();
    setMessage("");
    setState({
      phase: "work",
      startedAt: at,
      endsAt: at + workMinutes * MINUTE,
      workMinutes,
      breakMinutes,
      subject,
      rounds: state?.rounds ?? 0,
    });
  };

  const stopAndSave = () => {
    if (!state) return;
    const at = Date.now();
    setState(null);
    logBlock(state.startedAt, at, "Focus time saved.");
  };

  const running = state !== null && state.phase !== "ready";
  const left = state ? state.endsAt - now : 0;

  return (
    <Panel
      title="Focus"
      description="Work in blocks with breaks between. Each work block is saved as time."
      className={className}
    >
      <div className="space-y-4">
        {running ? (
          <div className="rounded-tile bg-base/80 p-4 text-center ring-1 ring-surface-0/50">
            <p className="text-sm font-semibold text-muted">
              {state.phase === "work" ? "Working" : "Break"}
              {state.rounds > 0 ? ` · ${state.rounds} done` : ""}
            </p>
            <p
              role="timer"
              aria-label={`${state.phase === "work" ? "Work" : "Break"}: ${countdown(left)} left`}
              className="mt-1 text-5xl font-bold tracking-[-0.03em] text-fg tabular-nums"
            >
              {countdown(left)}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label htmlFor={`${ids}-subject`} className={labelClass}>
              On
            </label>
            {running ? (
              <p className="text-sm text-fg">
                {state.subject
                  ? "The task or course picked when it started."
                  : "Nothing in particular."}
              </p>
            ) : (
              <SubjectSelect id={`${ids}-subject`} value={subject} onChange={setSubject} />
            )}
          </div>
          {running ? null : (
            <>
              <div>
                <label htmlFor={`${ids}-work`} className={labelClass}>
                  Work
                </label>
                <select
                  id={`${ids}-work`}
                  value={String(workMinutes)}
                  onChange={(event) => setWork(Number(event.target.value))}
                  className={inputClass}
                >
                  {WORK_CHOICES.map((minutes) => (
                    <option key={minutes} value={String(minutes)}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${ids}-break`} className={labelClass}>
                  Break
                </label>
                <select
                  id={`${ids}-break`}
                  value={String(breakMinutes)}
                  onChange={(event) => setBreak(Number(event.target.value))}
                  className={inputClass}
                >
                  {BREAK_CHOICES.map((minutes) => (
                    <option key={minutes} value={String(minutes)}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {state === null ? (
            <button type="button" className={primaryButton} onClick={start}>
              Start focus
            </button>
          ) : state.phase === "work" ? (
            <>
              <button
                type="button"
                className={primaryButton}
                disabled={save.isPending}
                onClick={stopAndSave}
              >
                Stop and save
              </button>
              <button
                type="button"
                className={ghostButton}
                onClick={() => {
                  setState(null);
                  setMessage("Block cancelled. Nothing was saved.");
                }}
              >
                Cancel block
              </button>
            </>
          ) : state.phase === "break" ? (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setState({ ...state, phase: "ready", endsAt: Date.now() })}
            >
              Skip break
            </button>
          ) : (
            <>
              <button type="button" className={primaryButton} onClick={start}>
                Start the next block
              </button>
              <button
                type="button"
                className={ghostButton}
                onClick={() => {
                  setState(null);
                  setMessage(
                    `Done for now: ${state.rounds} ${state.rounds === 1 ? "block" : "blocks"}.`,
                  );
                }}
              >
                Finish
              </button>
            </>
          )}
        </div>
        <p role="status" className="text-sm font-semibold text-ok empty:hidden">
          {message}
        </p>
      </div>
    </Panel>
  );
}
