import { z } from "zod";

export const COURSE_STATUSES = ["not_started", "in_progress", "passed", "transferred"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  passed: "Passed",
  transferred: "Transferred",
};

/** Statuses whose credits count as earned. */
export const EARNED_STATUSES: readonly CourseStatus[] = ["passed", "transferred"];

export const ASSESSMENT_KINDS = ["exam", "project", "other"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  exam: "Exam",
  project: "Project",
  other: "Other",
};

const date = z.iso.date("Use a date like 2030-01-31.");
const name = (what: string) =>
  z.string().trim().min(1, `Give the ${what} a name.`).max(200, "Keep names under 200 characters.");
const credits = z
  .number()
  .min(0, "Credits can't be negative.")
  .max(60, "Use 60 credits or fewer.")
  .refine((value) => Number.isInteger(value * 10), "Use at most one decimal place for credits.");
const creditGoal = z.number().int().min(0).max(1000);
const code = z.string().trim().max(40, "Keep course codes under 40 characters.");
const notes = z.string().max(20_000, "Keep notes under 20,000 characters.");

/** A start must come before an end when both are set. */
function ordered<T extends { [key: string]: unknown }>(
  start: keyof T,
  end: keyof T,
  message: string,
) {
  return (value: T, ctx: z.RefinementCtx) => {
    const a = value[start];
    const b = value[end];
    if (typeof a === "string" && typeof b === "string" && a > b) {
      ctx.addIssue({ code: "custom", message, path: [String(end)] });
    }
  };
}

export const termCreateSchema = z
  .object({
    name: name("term"),
    startDate: date,
    endDate: date,
    creditGoal: creditGoal.nullable().optional(),
  })
  .strict()
  .superRefine(ordered("startDate", "endDate", "The term has to end after it starts."));
export type TermCreate = z.infer<typeof termCreateSchema>;

export const termUpdateSchema = z
  .object({ name: name("term"), startDate: date, endDate: date, creditGoal: creditGoal.nullable() })
  .partial()
  .strict();
export type TermUpdate = z.infer<typeof termUpdateSchema>;

export const courseCreateSchema = z
  .object({
    termId: z.number().int().positive(),
    code: code.optional(),
    title: name("course"),
    credits: credits.optional(),
    status: z.enum(COURSE_STATUSES).optional(),
    plannedStart: date.nullable().optional(),
    plannedEnd: date.nullable().optional(),
  })
  .strict()
  .superRefine(ordered("plannedStart", "plannedEnd", "The planned end has to be after the start."));
export type CourseCreate = z.infer<typeof courseCreateSchema>;

export const courseUpdateSchema = z
  .object({
    termId: z.number().int().positive(),
    code,
    title: name("course"),
    credits,
    status: z.enum(COURSE_STATUSES),
    plannedStart: date.nullable(),
    plannedEnd: date.nullable(),
    /** Set automatically when a course is passed or transferred; editable afterward. */
    completedOn: date.nullable(),
    notes,
    sortOrder: z.number(),
  })
  .partial()
  .strict();
export type CourseUpdate = z.infer<typeof courseUpdateSchema>;

export const assessmentCreateSchema = z
  .object({ kind: z.enum(ASSESSMENT_KINDS).optional(), label: name("assessment") })
  .strict();
export type AssessmentCreate = z.infer<typeof assessmentCreateSchema>;

export const assessmentUpdateSchema = z
  .object({ kind: z.enum(ASSESSMENT_KINDS), label: name("assessment"), done: z.boolean() })
  .partial()
  .strict();
export type AssessmentUpdate = z.infer<typeof assessmentUpdateSchema>;

/** The `hub-education/v1` format (see docs/PLAN.md). Unknown fields are ignored. */
export const educationImportSchema = z.object({
  format: z.literal("hub-education/v1", {
    error: 'This isn\'t a hub-education/v1 file. Its "format" should be "hub-education/v1".',
  }),
  terms: z
    .array(
      z
        .object({
          name: name("term"),
          startDate: date,
          endDate: date,
          creditGoal: creditGoal.optional(),
          courses: z
            .array(
              z
                .object({
                  code: code.optional(),
                  title: name("course"),
                  credits: credits.optional(),
                  status: z.enum(COURSE_STATUSES).optional(),
                  plannedStart: date.optional(),
                  plannedEnd: date.optional(),
                  assessments: z
                    .array(
                      z.object({
                        kind: z.enum(ASSESSMENT_KINDS).optional(),
                        label: name("assessment"),
                      }),
                    )
                    .max(50)
                    .optional(),
                })
                .superRefine(
                  ordered(
                    "plannedStart",
                    "plannedEnd",
                    "A course's planned end is before its start.",
                  ),
                ),
            )
            .max(200)
            .optional(),
        })
        .superRefine(ordered("startDate", "endDate", "A term ends before it starts.")),
    )
    .min(1, "The file has no terms.")
    .max(50),
});
export type EducationImport = z.infer<typeof educationImportSchema>;

export type ImportSummary = {
  termsCreated: number;
  termsUpdated: number;
  coursesCreated: number;
  coursesUpdated: number;
  assessmentsAdded: number;
};

export type PacingState = "reached" | "ahead" | "on_pace" | "behind" | "early";

/**
 * How a term is going: credits earned against the goal, and against the credits of
 * courses planned to finish before today.
 */
export function termPacing(
  term: { creditGoal: number | null },
  courses: Array<{ credits: number; status: CourseStatus; plannedEnd: string | null }>,
  today: string,
): { earned: number; goal: number; planned: number; state: PacingState; summary: string } {
  const sum = (list: typeof courses) =>
    Math.round(list.reduce((total, course) => total + course.credits, 0) * 10) / 10;
  const earned = sum(courses.filter((course) => EARNED_STATUSES.includes(course.status)));
  const goal = term.creditGoal ?? sum(courses);
  const planned = sum(
    courses.filter((course) => course.plannedEnd !== null && course.plannedEnd < today),
  );
  const of = `${earned} of ${goal} credits`;
  if (goal > 0 && earned >= goal) {
    return { earned, goal, planned, state: "reached", summary: `Credit goal reached: ${of}.` };
  }
  if (planned === 0) {
    return {
      earned,
      goal,
      planned,
      state: "early",
      summary: `${of} so far. Nothing was planned to finish yet.`,
    };
  }
  const gap = Math.round((earned - planned) * 10) / 10;
  if (gap > 0) {
    return {
      earned,
      goal,
      planned,
      state: "ahead",
      summary: `Ahead by ${gap} ${credit(gap)}: ${of}, ${planned} planned by now.`,
    };
  }
  if (gap === 0) {
    return { earned, goal, planned, state: "on_pace", summary: `On pace: ${of}, as planned.` };
  }
  return {
    earned,
    goal,
    planned,
    state: "behind",
    summary: `Behind by ${-gap} ${credit(-gap)}: ${of}, ${planned} planned by now.`,
  };
}

const credit = (amount: number) => (amount === 1 ? "credit" : "credits");
