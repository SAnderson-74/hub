import { ProgressBar } from "../../../client/components/ProgressBar";
import { COURSE_STATUS_LABELS, EARNED_STATUSES, termPacing } from "../../../shared/education";
import { formatShortDate } from "../../tasks/dates";
import { courseBar, monthTicks, termPercent } from "../pacing";
import type { Course, Term } from "../queries";

/** Credits earned against the goal, with the pacing summary in words. */
export function TermSummary({ term, today }: { term: Term; today: string }) {
  const pacing = termPacing(term, term.courses, today);
  const percent =
    pacing.goal > 0 ? Math.min(100, Math.floor((pacing.earned / pacing.goal) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center gap-3">
        <ProgressBar
          percent={percent}
          label="Credits earned"
          complete={pacing.state === "reached"}
        />
        <span className="shrink-0 text-sm font-semibold text-fg tabular-nums">
          {pacing.earned} / {pacing.goal}
        </span>
      </div>
      <p
        className={`mt-2 text-sm font-semibold ${
          pacing.state === "behind"
            ? "text-warn"
            : pacing.state === "reached"
              ? "text-ok"
              : "text-muted"
        }`}
      >
        {pacing.summary}
      </p>
    </div>
  );
}

type Tone = { bar: string; text: string; label: string };

function courseTone(course: Course, today: string): Tone {
  if (EARNED_STATUSES.includes(course.status)) {
    return { bar: "bg-ok", text: "text-ok", label: COURSE_STATUS_LABELS[course.status] };
  }
  if (course.plannedEnd && course.plannedEnd < today) {
    return { bar: "bg-danger", text: "text-danger", label: "Past planned end" };
  }
  if (course.status === "in_progress") {
    return { bar: "bg-accent", text: "text-accent-text", label: "In progress" };
  }
  return { bar: "bg-surface-2", text: "text-muted", label: "Not started" };
}

/**
 * Each course's planned window as a bar across the term, with today marked. Every
 * row says its status and dates in words; the bars only show the same thing.
 */
export function PacingTimeline({
  term,
  today,
  onOpen,
}: {
  term: Term;
  today: string;
  onOpen: (course: Course) => void;
}) {
  const ticks = monthTicks(term.startDate, term.endDate);
  const inTerm = term.startDate <= today && today <= term.endDate;
  const todayLeft = termPercent(today, term.startDate, term.endDate);
  const plannedWindow = (course: Course) =>
    course.plannedStart || course.plannedEnd
      ? `${course.plannedStart ? formatShortDate(course.plannedStart, today) : "Start of term"} – ${
          course.plannedEnd ? formatShortDate(course.plannedEnd, today) : "end of term"
        }`
      : "Not planned yet";

  if (term.courses.length === 0) {
    return <p className="text-muted">Add courses to see them across the term.</p>;
  }

  return (
    <div>
      <div aria-hidden="true" className="relative mb-2 h-5 text-xs text-faint">
        {ticks.map((tick) => (
          <span
            key={tick.date}
            className="absolute -translate-x-1/2"
            style={{ left: `${tick.left}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <ul className="space-y-3">
          {term.courses.map((course) => {
            const tone = courseTone(course, today);
            const bar = courseBar(course, term);
            return (
              <li key={course.id}>
                <button
                  type="button"
                  onClick={() => onOpen(course)}
                  className="block w-full rounded-control py-1 text-left hover:bg-surface-0/40"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-fg">
                      {course.code ? `${course.code} ` : ""}
                      {course.title}
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${tone.text}`}>
                      {tone.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">{plannedWindow(course)}</span>
                  <span
                    aria-hidden="true"
                    className="relative mt-1.5 block h-2.5 rounded-full bg-surface-0"
                  >
                    <span
                      className={`absolute inset-y-0 rounded-full ${tone.bar} ${bar.planned ? "" : "opacity-40"}`}
                      style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                    />
                    {/* Today, marked on each track so it never crosses the text. */}
                    {inTerm ? (
                      <span
                        className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-accent"
                        style={{ left: `${todayLeft}%` }}
                      />
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-4 text-sm text-muted">
        {inTerm
          ? `The marks on each bar show today, ${formatShortDate(today, today)}.`
          : today < term.startDate
            ? `This term starts ${formatShortDate(term.startDate, today)}.`
            : `This term ended ${formatShortDate(term.endDate, today)}.`}
      </p>
    </div>
  );
}
