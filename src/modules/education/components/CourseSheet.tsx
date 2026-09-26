import { Plus, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  iconButton,
  inputClass,
  labelClass,
  primaryButton,
  textareaClass,
} from "../../../client/components/ui";
import {
  ASSESSMENT_KIND_LABELS,
  ASSESSMENT_KINDS,
  type AssessmentKind,
  COURSE_STATUS_LABELS,
  COURSE_STATUSES,
  type CourseStatus,
  type CourseUpdate,
} from "../../../shared/education";
import { TaskCheckbox } from "../../tasks/components/TaskList";
import {
  type Course,
  useAddAssessment,
  useCreateCourse,
  useDeleteAssessment,
  useDeleteCourse,
  useUpdateAssessment,
  useUpdateCourse,
} from "../queries";

/** "new" adds a course to `termId`; a course edits it; null is closed. */
export type CourseTarget =
  | { mode: "new"; termId: number }
  | { mode: "edit"; course: Course }
  | null;

type Draft = {
  code: string;
  title: string;
  credits: string;
  status: CourseStatus;
  plannedStart: string;
  plannedEnd: string;
  completedOn: string;
  notes: string;
};

function toDraft(course: Course | null): Draft {
  return {
    code: course?.code ?? "",
    title: course?.title ?? "",
    credits: course ? String(course.credits) : "3",
    status: course?.status ?? "not_started",
    plannedStart: course?.plannedStart ?? "",
    plannedEnd: course?.plannedEnd ?? "",
    completedOn: course?.completedOn ?? "",
    notes: course?.notes ?? "",
  };
}

export function CourseSheet({ target, onClose }: { target: CourseTarget; onClose: () => void }) {
  const course = target?.mode === "edit" ? target.course : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={course ? "Course" : "Add course"}
      description={course ? undefined : "You can add assessments once the course is saved."}
    >
      {target === null ? null : (
        <CourseForm
          key={course?.id ?? "new"}
          course={course}
          termId={target.mode === "new" ? target.termId : target.course.termId}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function CourseForm({
  course,
  termId,
  onDone,
}: {
  course: Course | null;
  termId: number;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(course));
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tried, setTried] = useState(false);
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const remove = useDeleteCourse();
  const ids = useId();
  const credits = Number(draft.credits);
  const creditsInvalid =
    draft.credits.trim() === "" || !Number.isFinite(credits) || credits < 0 || credits > 60;
  const titleMissing = draft.title.trim() === "";
  const windowInvalid =
    draft.plannedStart !== "" && draft.plannedEnd !== "" && draft.plannedStart > draft.plannedEnd;
  const blocked = titleMissing || creditsInvalid || windowInvalid;
  const error = create.error ?? update.error ?? remove.error;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked) return;
    const fields = {
      code: draft.code.trim(),
      title: draft.title.trim(),
      credits,
      status: draft.status,
      plannedStart: draft.plannedStart || null,
      plannedEnd: draft.plannedEnd || null,
    };
    if (!course) {
      create.mutate({ termId, ...fields }, { onSuccess: onDone });
      return;
    }
    const patch: CourseUpdate = { ...fields, notes: draft.notes };
    // Only send a completion date someone typed; otherwise the server dates it.
    if (draft.completedOn !== (course.completedOn ?? ""))
      patch.completedOn = draft.completedOn || null;
    update.mutate(
      { id: course.id, patch },
      {
        onSuccess: (terms) => {
          const saved = terms
            ?.flatMap((term) => term.courses)
            .find((item) => item.id === course.id);
          if (saved) setDraft(toDraft(saved));
          setMessage("Course saved");
        },
      },
    );
  };

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <div>
            <label htmlFor={`${ids}-code`} className={labelClass}>
              Code
            </label>
            <input
              id={`${ids}-code`}
              value={draft.code}
              onChange={(event) => set("code", event.target.value)}
              maxLength={40}
              placeholder="ABC101"
              autoCapitalize="characters"
              className={`${inputClass} min-w-0`}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-title`} className={labelClass}>
              Title
            </label>
            <input
              id={`${ids}-title`}
              value={draft.title}
              onChange={(event) => set("title", event.target.value)}
              maxLength={200}
              aria-invalid={tried && titleMissing}
              className={`${inputClass} min-w-0`}
            />
            {tried && titleMissing ? (
              <p className="mt-1.5 text-sm text-danger">Give the course a title.</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${ids}-credits`} className={labelClass}>
              Credits
            </label>
            <input
              id={`${ids}-credits`}
              value={draft.credits}
              onChange={(event) => set("credits", event.target.value)}
              inputMode="decimal"
              aria-invalid={creditsInvalid}
              className={inputClass}
            />
            {creditsInvalid ? (
              <p className="mt-1.5 text-sm text-danger">Use a number from 0 to 60.</p>
            ) : null}
          </div>
          <div>
            <label htmlFor={`${ids}-status`} className={labelClass}>
              Status
            </label>
            <select
              id={`${ids}-status`}
              value={draft.status}
              onChange={(event) => set("status", event.target.value as CourseStatus)}
              className={inputClass}
            >
              {COURSE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {COURSE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>Planned window</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="sr-only">Planned start</span>
              <input
                type="date"
                value={draft.plannedStart}
                onChange={(event) => set("plannedStart", event.target.value)}
                aria-label="Planned start"
                className={`${inputClass} [color-scheme:dark]`}
              />
            </label>
            <label className="block">
              <span className="sr-only">Planned end</span>
              <input
                type="date"
                value={draft.plannedEnd}
                onChange={(event) => set("plannedEnd", event.target.value)}
                aria-label="Planned end"
                aria-invalid={windowInvalid}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </label>
          </div>
          <p className={`mt-1.5 text-sm ${windowInvalid ? "text-danger" : "text-muted"}`}>
            {windowInvalid
              ? "The planned end has to be after the start."
              : "When you plan to start and finish. Leave empty to span the term."}
          </p>
        </fieldset>

        {course && (draft.status === "passed" || draft.status === "transferred") ? (
          <div>
            <label htmlFor={`${ids}-completed`} className={labelClass}>
              Completed on
            </label>
            <input
              id={`${ids}-completed`}
              type="date"
              value={draft.completedOn}
              onChange={(event) => set("completedOn", event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
        ) : null}

        {course ? (
          <div>
            <label htmlFor={`${ids}-notes`} className={labelClass}>
              Notes
            </label>
            <textarea
              id={`${ids}-notes`}
              value={draft.notes}
              onChange={(event) => set("notes", event.target.value)}
              rows={3}
              className={textareaClass}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={primaryButton}
            disabled={(tried && blocked) || create.isPending || update.isPending}
          >
            {course ? "Save course" : "Add course"}
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        ) : null}
      </form>

      {course ? <Assessments course={course} /> : null}

      {course ? (
        confirmDelete ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">
              Delete this course and its assessments? Time logged on it stays. This can't be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(course.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                Delete course
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
                Keep course
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-surface-0/70 pt-4">
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete course
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

function Assessments({ course }: { course: Course }) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AssessmentKind>("exam");
  const add = useAddAssessment();
  const update = useUpdateAssessment();
  const remove = useDeleteAssessment();
  const headingId = useId();
  const done = course.assessments.filter((item) => item.done).length;
  const error = add.error ?? update.error ?? remove.error;

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    // Clear now so the next assessment can be typed while this one saves.
    setLabel("");
    add.mutate(
      { courseId: course.id, json: { kind, label: trimmed } },
      { onError: () => setLabel((current) => current || trimmed) },
    );
  };

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <h3 id={headingId} className="flex items-baseline gap-2 font-semibold text-fg">
        Assessments
        {course.assessments.length > 0 ? (
          <span className="text-sm text-muted tabular-nums">
            {done} of {course.assessments.length} done
          </span>
        ) : null}
      </h3>
      {course.assessments.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {course.assessments.map((item) => (
            <li key={item.id} className="flex items-center gap-1">
              <TaskCheckbox
                task={{ title: item.label, status: item.done ? "done" : "todo" }}
                onToggle={(isDone) =>
                  update
                    .mutateAsync({ id: item.id, patch: { done: isDone } })
                    .catch(() => undefined)
                }
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-semibold break-words ${
                    item.done ? "text-muted line-through decoration-surface-2" : "text-fg"
                  }`}
                >
                  {item.label}
                </span>
                <span className="block text-sm text-muted">
                  {ASSESSMENT_KIND_LABELS[item.kind]}
                </span>
              </span>
              <button
                type="button"
                className={iconButton}
                aria-label={`Delete assessment ${item.label}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.id)}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={onAdd} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor={`${headingId}-kind`}>
          Assessment kind
        </label>
        <select
          id={`${headingId}-kind`}
          value={kind}
          onChange={(event) => setKind(event.target.value as AssessmentKind)}
          className={`${inputClass} w-28 shrink-0`}
        >
          {ASSESSMENT_KINDS.map((value) => (
            <option key={value} value={value}>
              {ASSESSMENT_KIND_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Add an assessment"
          aria-label="New assessment"
          maxLength={200}
          className={`${inputClass} min-w-0`}
        />
        <button
          type="submit"
          disabled={!label.trim() || add.isPending}
          aria-label="Add assessment"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-0 text-fg hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}
