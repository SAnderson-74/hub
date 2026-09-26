import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import {
  type AssessmentCreate,
  type AssessmentKind,
  type AssessmentUpdate,
  type CourseCreate,
  type CourseStatus,
  type CourseUpdate,
  EARNED_STATUSES,
  type EducationImport,
  type ImportSummary,
  type TermCreate,
  type TermUpdate,
} from "../../shared/education";
import { changedFields, recordActivity } from "../core/activity.service";
import { detachEntities } from "../core/entities";
import { assessments, courses, terms } from "./schema";

type TermRow = typeof terms.$inferSelect;
type CourseRow = typeof courses.$inferSelect;
type AssessmentRow = typeof assessments.$inferSelect;

export type AssessmentJson = { id: number; kind: AssessmentKind; label: string; done: boolean };

export type CourseJson = {
  id: number;
  termId: number;
  code: string;
  title: string;
  credits: number;
  status: CourseStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  completedOn: string | null;
  notes: string;
  sortOrder: number;
  assessments: AssessmentJson[];
};

export type TermJson = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  creditGoal: number | null;
  /** Planned start first (unplanned last), then sort order. */
  courses: CourseJson[];
};

const courseOrder = [
  sql`${courses.plannedStart} is null`,
  asc(courses.plannedStart),
  asc(courses.sortOrder),
  asc(courses.id),
];

function toCourseJson(row: CourseRow, items: AssessmentRow[]): CourseJson {
  return {
    id: row.id,
    termId: row.termId,
    code: row.code,
    title: row.title,
    credits: row.credits,
    status: row.status,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    completedOn: row.completedOn,
    notes: row.notes,
    sortOrder: row.sortOrder,
    assessments: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      done: item.doneAt !== null,
    })),
  };
}

function coursesWithAssessments(db: Queryable, rows: CourseRow[]): CourseJson[] {
  const ids = rows.map((row) => row.id);
  const items =
    ids.length === 0
      ? []
      : db
          .select()
          .from(assessments)
          .where(inArray(assessments.courseId, ids))
          .orderBy(asc(assessments.id))
          .all();
  const byCourse = new Map<number, AssessmentRow[]>();
  for (const item of items)
    byCourse.set(item.courseId, [...(byCourse.get(item.courseId) ?? []), item]);
  return rows.map((row) => toCourseJson(row, byCourse.get(row.id) ?? []));
}

/** Every term, oldest first, with its courses and their assessments. */
export function listTerms(db: Queryable): TermJson[] {
  const termRows = db.select().from(terms).orderBy(asc(terms.startDate), asc(terms.id)).all();
  const courseRows = db
    .select()
    .from(courses)
    .orderBy(...courseOrder)
    .all();
  const all = coursesWithAssessments(db, courseRows);
  return termRows.map((term) => ({
    id: term.id,
    name: term.name,
    startDate: term.startDate,
    endDate: term.endDate,
    creditGoal: term.creditGoal,
    courses: all.filter((course) => course.termId === term.id),
  }));
}

// Terms

function requireTerm(db: Queryable, id: number, from: "path" | "body" = "path"): TermRow {
  const row = db.select().from(terms).where(eq(terms.id, id)).get();
  if (row) return row;
  const message = "That term doesn't exist. It may have been deleted.";
  throw from === "path" ? notFound(message) : badRequest(message);
}

function checkTermDates(startDate: string, endDate: string) {
  if (startDate > endDate) throw badRequest("The term has to end after it starts.");
}

export function createTerm(db: Db, input: TermCreate): TermJson[] {
  db.insert(terms)
    .values({
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      creditGoal: input.creditGoal ?? null,
    })
    .run();
  return listTerms(db);
}

export function updateTerm(db: Db, id: number, patch: TermUpdate): TermJson[] {
  const current = requireTerm(db, id);
  const next = {
    name: patch.name ?? current.name,
    startDate: patch.startDate ?? current.startDate,
    endDate: patch.endDate ?? current.endDate,
    creditGoal: patch.creditGoal !== undefined ? patch.creditGoal : current.creditGoal,
  };
  checkTermDates(next.startDate, next.endDate);
  db.update(terms)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(terms.id, id))
    .run();
  return listTerms(db);
}

/** Deletes the term with its courses and their assessments. Course history stays. */
export function deleteTerm(db: Db, id: number, actor: string): void {
  db.transaction((tx) => {
    requireTerm(tx, id);
    const doomed = tx
      .select({ id: courses.id, code: courses.code, title: courses.title })
      .from(courses)
      .where(eq(courses.termId, id))
      .all();
    detachEntities(
      tx,
      "course",
      doomed.map((course) => course.id),
      actor,
    );
    tx.delete(terms).where(eq(terms.id, id)).run();
    for (const course of doomed) {
      recordActivity(tx, {
        entity: { type: "course", id: course.id },
        action: "deleted",
        label: courseLabel(course),
        actor,
      });
    }
  });
}

// Courses

const courseLabel = (course: { code: string; title: string }) =>
  course.code ? `${course.code} ${course.title}` : course.title;

const earned = (status: CourseStatus) => EARNED_STATUSES.includes(status);

function requireCourse(db: Queryable, id: number): CourseRow {
  const row = db.select().from(courses).where(eq(courses.id, id)).get();
  if (!row) throw notFound("That course doesn't exist. It may have been deleted.");
  return row;
}

function checkWindow(start: string | null, end: string | null) {
  if (start && end && start > end) throw badRequest("The planned end has to be after the start.");
}

function lastCourseOrder(db: Queryable): number {
  const row = db
    .select({ last: sql<number | null>`max(${courses.sortOrder})` })
    .from(courses)
    .get();
  return row?.last ?? 0;
}

function insertCourse(tx: Queryable, input: CourseCreate, actor: string, today: string): CourseRow {
  requireTerm(tx, input.termId, "body");
  const status = input.status ?? "not_started";
  checkWindow(input.plannedStart ?? null, input.plannedEnd ?? null);
  const row = tx
    .insert(courses)
    .values({
      termId: input.termId,
      code: input.code ?? "",
      title: input.title,
      credits: input.credits ?? 0,
      status,
      plannedStart: input.plannedStart ?? null,
      plannedEnd: input.plannedEnd ?? null,
      completedOn: earned(status) ? today : null,
      sortOrder: lastCourseOrder(tx) + 1,
    })
    .returning()
    .get();
  recordActivity(tx, {
    entity: { type: "course", id: row.id },
    action: "created",
    label: courseLabel(row),
    actor,
  });
  return row;
}

const tracked = (row: CourseRow) => ({
  code: row.code,
  title: row.title,
  credits: row.credits,
  status: row.status,
  plannedStart: row.plannedStart,
  plannedEnd: row.plannedEnd,
  completedOn: row.completedOn,
  termId: row.termId,
  notes: row.notes,
});

/** Applies a change and logs it. Returns whether anything changed. */
function applyCourseUpdate(
  tx: Queryable,
  current: CourseRow,
  patch: CourseUpdate,
  actor: string,
  today: string,
): boolean {
  if (patch.termId !== undefined) requireTerm(tx, patch.termId, "body");
  const status = patch.status ?? current.status;
  // Passing (or transferring) a course dates it today unless a date is given;
  // moving it back to not earned clears the date.
  let completedOn = patch.completedOn !== undefined ? patch.completedOn : current.completedOn;
  if (patch.completedOn === undefined && earned(status) !== earned(current.status)) {
    completedOn = earned(status) ? today : null;
  }
  const next: CourseRow = {
    ...current,
    termId: patch.termId ?? current.termId,
    code: patch.code ?? current.code,
    title: patch.title ?? current.title,
    credits: patch.credits ?? current.credits,
    status,
    plannedStart: patch.plannedStart !== undefined ? patch.plannedStart : current.plannedStart,
    plannedEnd: patch.plannedEnd !== undefined ? patch.plannedEnd : current.plannedEnd,
    completedOn,
    notes: patch.notes ?? current.notes,
    sortOrder: patch.sortOrder ?? current.sortOrder,
  };
  checkWindow(next.plannedStart, next.plannedEnd);
  const changes = changedFields(tracked(current), tracked(next));
  if (Object.keys(changes).length === 0 && next.sortOrder === current.sortOrder) return false;
  const { id, createdAt: _createdAt, ...values } = next;
  tx.update(courses)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(courses.id, id))
    .run();
  if (Object.keys(changes).length > 0) {
    recordActivity(tx, {
      entity: { type: "course", id },
      action: "updated",
      label: courseLabel(next),
      details: { changes },
      actor,
    });
  }
  return true;
}

export function createCourse(
  db: Db,
  input: CourseCreate,
  actor: string,
  today: string,
): TermJson[] {
  db.transaction((tx) => insertCourse(tx, input, actor, today));
  return listTerms(db);
}

export function updateCourse(
  db: Db,
  id: number,
  patch: CourseUpdate,
  actor: string,
  today: string,
): TermJson[] {
  db.transaction((tx) => applyCourseUpdate(tx, requireCourse(tx, id), patch, actor, today));
  return listTerms(db);
}

export function deleteCourse(db: Db, id: number, actor: string): TermJson[] {
  db.transaction((tx) => {
    const row = requireCourse(tx, id);
    detachEntities(tx, "course", [id], actor);
    tx.delete(courses).where(eq(courses.id, id)).run();
    recordActivity(tx, {
      entity: { type: "course", id },
      action: "deleted",
      label: courseLabel(row),
      actor,
    });
  });
  return listTerms(db);
}

// Assessments

function assessmentSummary(db: Queryable, courseId: number): string {
  const row = db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      done: sql<number>`count(${assessments.doneAt})`.mapWith(Number),
    })
    .from(assessments)
    .where(eq(assessments.courseId, courseId))
    .get();
  return `${row?.done ?? 0} of ${row?.total ?? 0} done`;
}

/** Runs a change to a course's assessments and logs it as "1 of 2 done" → "2 of 2 done". */
function changeAssessments(tx: Queryable, course: CourseRow, actor: string, change: () => void) {
  const before = assessmentSummary(tx, course.id);
  change();
  const after = assessmentSummary(tx, course.id);
  if (after === before) return;
  recordActivity(tx, {
    entity: { type: "course", id: course.id },
    action: "updated",
    label: courseLabel(course),
    details: { changes: { assessments: { from: before, to: after } } },
    actor,
  });
}

export function createAssessment(
  db: Db,
  courseId: number,
  input: AssessmentCreate,
  actor: string,
): TermJson[] {
  db.transaction((tx) => {
    const course = requireCourse(tx, courseId);
    changeAssessments(tx, course, actor, () =>
      tx
        .insert(assessments)
        .values({ courseId, kind: input.kind ?? "other", label: input.label })
        .run(),
    );
  });
  return listTerms(db);
}

function requireAssessment(db: Queryable, id: number): AssessmentRow {
  const row = db.select().from(assessments).where(eq(assessments.id, id)).get();
  if (!row) throw notFound("That assessment doesn't exist. It may have been deleted.");
  return row;
}

export function updateAssessment(
  db: Db,
  id: number,
  patch: AssessmentUpdate,
  actor: string,
): TermJson[] {
  db.transaction((tx) => {
    const current = requireAssessment(tx, id);
    const course = requireCourse(tx, current.courseId);
    let doneAt = current.doneAt;
    if (patch.done !== undefined && patch.done !== (current.doneAt !== null)) {
      doneAt = patch.done ? new Date() : null;
    }
    changeAssessments(tx, course, actor, () =>
      tx
        .update(assessments)
        .set({
          kind: patch.kind ?? current.kind,
          label: patch.label ?? current.label,
          doneAt,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, id))
        .run(),
    );
  });
  return listTerms(db);
}

export function deleteAssessment(db: Db, id: number, actor: string): TermJson[] {
  db.transaction((tx) => {
    const current = requireAssessment(tx, id);
    const course = requireCourse(tx, current.courseId);
    changeAssessments(tx, course, actor, () =>
      tx.delete(assessments).where(eq(assessments.id, id)).run(),
    );
  });
  return listTerms(db);
}

// Import

class DryRun extends Error {
  constructor(readonly summary: ImportSummary) {
    super("dry run");
  }
}

/**
 * Loads a `hub-education/v1` plan. Terms match existing ones by name and courses by
 * code (or by title within the term when there's no code), so importing an updated
 * plan changes what's there instead of duplicating it. Assessments are only added.
 * With `dryRun`, nothing is saved and the summary says what would happen.
 */
export function importEducation(
  db: Db,
  data: EducationImport,
  actor: string,
  today: string,
  dryRun: boolean,
): ImportSummary {
  const summary: ImportSummary = {
    termsCreated: 0,
    termsUpdated: 0,
    coursesCreated: 0,
    coursesUpdated: 0,
    assessmentsAdded: 0,
  };
  try {
    db.transaction((tx) => {
      for (const termInput of data.terms) {
        let term = tx
          .select()
          .from(terms)
          .where(sql`lower(${terms.name}) = lower(${termInput.name})`)
          .get();
        if (term) {
          const next = {
            startDate: termInput.startDate,
            endDate: termInput.endDate,
            creditGoal: termInput.creditGoal ?? term.creditGoal,
          };
          if (
            next.startDate !== term.startDate ||
            next.endDate !== term.endDate ||
            next.creditGoal !== term.creditGoal
          ) {
            tx.update(terms)
              .set({ ...next, updatedAt: new Date() })
              .where(eq(terms.id, term.id))
              .run();
            summary.termsUpdated += 1;
          }
        } else {
          term = tx
            .insert(terms)
            .values({
              name: termInput.name,
              startDate: termInput.startDate,
              endDate: termInput.endDate,
              creditGoal: termInput.creditGoal ?? null,
            })
            .returning()
            .get();
          summary.termsCreated += 1;
        }

        for (const courseInput of termInput.courses ?? []) {
          const code = courseInput.code ?? "";
          const existing = code
            ? tx.select().from(courses).where(sql`lower(${courses.code}) = lower(${code})`).get()
            : tx
                .select()
                .from(courses)
                .where(
                  and(
                    eq(courses.termId, term.id),
                    sql`lower(${courses.title}) = lower(${courseInput.title})`,
                  ),
                )
                .get();
          let course: CourseRow;
          if (existing) {
            const changed = applyCourseUpdate(
              tx,
              existing,
              {
                termId: term.id,
                title: courseInput.title,
                ...(courseInput.credits !== undefined && { credits: courseInput.credits }),
                ...(courseInput.status && { status: courseInput.status }),
                ...(courseInput.plannedStart && { plannedStart: courseInput.plannedStart }),
                ...(courseInput.plannedEnd && { plannedEnd: courseInput.plannedEnd }),
              },
              actor,
              today,
            );
            if (changed) summary.coursesUpdated += 1;
            course = requireCourse(tx, existing.id);
          } else {
            course = insertCourse(
              tx,
              {
                termId: term.id,
                code,
                title: courseInput.title,
                credits: courseInput.credits,
                status: courseInput.status,
                plannedStart: courseInput.plannedStart ?? null,
                plannedEnd: courseInput.plannedEnd ?? null,
              },
              actor,
              today,
            );
            summary.coursesCreated += 1;
          }

          const known = new Set(
            tx
              .select({ label: assessments.label })
              .from(assessments)
              .where(eq(assessments.courseId, course.id))
              .all()
              .map((item) => item.label.toLowerCase()),
          );
          const added = (courseInput.assessments ?? []).filter((item) => {
            const key = item.label.toLowerCase();
            if (known.has(key)) return false;
            known.add(key);
            return true;
          });
          if (added.length > 0) {
            changeAssessments(tx, course, actor, () =>
              tx
                .insert(assessments)
                .values(
                  added.map((item) => ({
                    courseId: course.id,
                    kind: item.kind ?? "other",
                    label: item.label,
                  })),
                )
                .run(),
            );
            summary.assessmentsAdded += added.length;
          }
        }
      }
      // Rolling back is how a preview stays exactly in step with a real import.
      if (dryRun) throw new DryRun(summary);
    });
  } catch (error) {
    if (error instanceof DryRun) return error.summary;
    throw error;
  }
  return summary;
}
