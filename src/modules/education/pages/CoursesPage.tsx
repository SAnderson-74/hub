import { CalendarPlus, FileUp, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { COURSE_STATUS_LABELS } from "../../../shared/education";
import { formatShortDate, localDate } from "../../tasks/dates";
import { CourseSheet, type CourseTarget } from "../components/CourseSheet";
import { ImportSheet } from "../components/ImportSheet";
import { PacingTimeline, TermSummary } from "../components/Pacing";
import { StreakSettingsLink, StudyStreakSummary } from "../components/StudyStreak";
import { TermSheet, type TermTarget } from "../components/TermSheet";
import { defaultTerm, formatCredits } from "../pacing";
import { type Course, type Term, useTerms } from "../queries";

export function CoursesPage() {
  const terms = useTerms();
  const today = localDate(useNow());
  const [params, setParams] = useSearchParams();
  const [termSheet, setTermSheet] = useState<TermTarget>(null);
  const [courseSheet, setCourseSheet] = useState<CourseTarget>(null);
  const [importing, setImporting] = useState(false);

  const list = terms.data ?? [];
  const requested = Number(params.get("term"));
  const term = list.find((item) => item.id === requested) ?? defaultTerm(list, today);
  const selectTerm = (id: number) => setParams({ term: String(id) }, { replace: true });
  // The sheet shows the latest copy of a course after each save.
  const openCourse =
    courseSheet?.mode === "edit"
      ? list.flatMap((item) => item.courses).find((course) => course.id === courseSheet.course.id)
      : undefined;

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={
          term
            ? `${term.name}: ${formatShortDate(term.startDate, today)} to ${formatShortDate(term.endDate, today)}.`
            : "Plan terms and courses and see how you're pacing."
        }
      />

      {terms.isPending ? (
        <LoadingRows rows={3} />
      ) : terms.isError ? (
        <ErrorNote error={terms.error} onRetry={() => void terms.refetch()} />
      ) : !term ? (
        <Panel
          title="Start your plan"
          description="Add a term by hand, or import a hub-education/v1 plan."
        >
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryButton} onClick={() => setTermSheet("new")}>
              <CalendarPlus aria-hidden="true" className="size-5" />
              New term
            </button>
            <button type="button" className={secondaryButton} onClick={() => setImporting(true)}>
              <FileUp aria-hidden="true" className="size-4" />
              Import a plan
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <div className="flex w-full min-w-0 items-center gap-1 sm:w-auto sm:max-w-sm sm:flex-1">
              <label htmlFor="course-term" className="sr-only">
                Term
              </label>
              <select
                id="course-term"
                value={String(term.id)}
                onChange={(event) => selectTerm(Number(event.target.value))}
                className={`${inputClass} min-w-0 font-semibold`}
              >
                {list.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={iconButton}
                aria-label={`Edit term ${term.name}`}
                onClick={() => setTermSheet(term)}
              >
                <Pencil aria-hidden="true" className="size-5" />
              </button>
              <button
                type="button"
                className={iconButton}
                aria-label="New term"
                onClick={() => setTermSheet("new")}
              >
                <CalendarPlus aria-hidden="true" className="size-5" />
              </button>
            </div>
            <button type="button" className={secondaryButton} onClick={() => setImporting(true)}>
              <FileUp aria-hidden="true" className="size-4" />
              Import
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
            <div className="grid grid-cols-1 gap-4 lg:col-span-5 lg:gap-6">
              <Panel title="Credits">
                <TermSummary term={term} today={today} />
              </Panel>
              <Panel
                title="Study streak"
                description="Days with enough time logged on courses."
                action={<StreakSettingsLink />}
              >
                <StudyStreakSummary />
              </Panel>
            </div>
            <Panel
              title="Pacing"
              description="Each course's planned window across the term."
              className="lg:col-span-7"
            >
              <PacingTimeline
                term={term}
                today={today}
                onOpen={(course) => setCourseSheet({ mode: "edit", course })}
              />
            </Panel>
            <Panel
              title="Courses"
              className="lg:col-span-12"
              action={
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setCourseSheet({ mode: "new", termId: term.id })}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add course
                </button>
              }
            >
              <CourseList
                term={term}
                onOpen={(course) => setCourseSheet({ mode: "edit", course })}
              />
            </Panel>
          </div>
        </>
      )}

      <TermSheet
        target={termSheet}
        onClose={() => setTermSheet(null)}
        onCreated={(id) => {
          setTermSheet(null);
          selectTerm(id);
        }}
      />
      <CourseSheet
        target={
          openCourse
            ? { mode: "edit", course: openCourse }
            : courseSheet?.mode === "new"
              ? courseSheet
              : null
        }
        onClose={() => setCourseSheet(null)}
      />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

function CourseList({ term, onOpen }: { term: Term; onOpen: (course: Course) => void }) {
  if (term.courses.length === 0) {
    return <p className="text-muted">No courses in this term yet.</p>;
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {term.courses.map((course) => {
        const done = course.assessments.filter((item) => item.done).length;
        return (
          <li key={course.id}>
            <button
              type="button"
              onClick={() => onOpen(course)}
              className="block w-full rounded-tile bg-base/80 p-4 text-left ring-1 ring-surface-0/50 hover:ring-surface-1"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  {course.code ? (
                    <span className="block text-sm font-semibold text-accent-text">
                      {course.code}
                    </span>
                  ) : null}
                  <span className="block font-semibold break-words text-fg">{course.title}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-muted tabular-nums">
                  {formatCredits(course.credits)}
                </span>
              </span>
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                <span>{COURSE_STATUS_LABELS[course.status]}</span>
                {course.assessments.length > 0 ? (
                  <span>
                    {done} of {course.assessments.length} assessments done
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
