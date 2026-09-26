import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { EducationImport } from "../../shared/education";
import { timeEntries } from "../time/schema";
import { studyStreak } from "./streak.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

// The test app runs in UTC, which is what the server uses for "today".
const today = new Date().toISOString().slice(0, 10);

const newTerm = async () =>
  body(
    await t.api.education.terms.$post({
      json: { name: "Term 1", startDate: "2030-01-01", endDate: "2030-06-30", creditGoal: 6 },
    }),
  );
const courseParam = (id: number) => ({ param: { id: String(id) } });
const history = async (courseId: number) =>
  (await body(await t.api.activity.$get({ query: { type: "course", id: String(courseId) } })))
    .entries;

const plan: EducationImport = {
  format: "hub-education/v1",
  terms: [
    {
      name: "Term 1",
      startDate: "2030-01-01",
      endDate: "2030-06-30",
      creditGoal: 6,
      courses: [
        {
          code: "ABC101",
          title: "Introduction to Networks",
          credits: 3,
          status: "in_progress",
          plannedStart: "2030-01-01",
          plannedEnd: "2030-03-15",
          assessments: [
            { kind: "exam", label: "Exam" },
            { kind: "project", label: "Project" },
          ],
        },
        { code: "ABC102", title: "Operating Systems", credits: 3 },
      ],
    },
  ],
};

describe("terms and courses", () => {
  it("adds courses to terms and dates them when they're passed", async () => {
    const [term] = await newTerm();
    if (!term) throw new Error("Expected a term");
    const backwards = await failure(
      await t.api.education.terms.$post({
        json: { name: "Bad", startDate: "2030-06-30", endDate: "2030-01-01" },
      }),
    );
    expect(backwards).toMatchObject({
      status: 400,
      error: "That term isn't valid.",
      issues: [{ path: "endDate", message: "The term has to end after it starts." }],
    });

    const terms = await body(
      await t.api.education.courses.$post({
        json: { termId: term.id, code: "ABC101", title: "Intro to Networks", credits: 3 },
      }),
    );
    const course = terms[0]?.courses[0];
    expect(course).toMatchObject({ status: "not_started", completedOn: null, credits: 3 });
    if (!course) throw new Error("Expected a course");

    const passed = await body(
      await t.api.education.courses[":id"].$patch({
        ...courseParam(course.id),
        json: { status: "passed" },
      }),
    );
    expect(passed[0]?.courses[0]).toMatchObject({ status: "passed", completedOn: today });
    const reopened = await body(
      await t.api.education.courses[":id"].$patch({
        ...courseParam(course.id),
        json: { status: "in_progress" },
      }),
    );
    expect(reopened[0]?.courses[0]?.completedOn).toBeNull();
    expect((await history(course.id))[0]?.details).toEqual({
      changes: {
        status: { from: "passed", to: "in_progress" },
        completedOn: { from: today, to: null },
      },
    });

    const window = await failure(
      await t.api.education.courses[":id"].$patch({
        ...courseParam(course.id),
        json: { plannedStart: "2030-03-01", plannedEnd: "2030-02-01" },
      }),
    );
    expect(window.status).toBe(400);
    const orphan = await failure(
      await t.api.education.courses.$post({ json: { termId: 999, title: "Lost course" } }),
    );
    expect(orphan).toEqual({
      status: 400,
      error: "That term doesn't exist. It may have been deleted.",
    });
    const tooMany = await t.api.education.courses.$post({
      json: { termId: term.id, title: "Big course", credits: 2.25 },
    });
    expect(tooMany.status).toBe(400);
  });

  it("tracks assessments on the course's history", async () => {
    const [term] = await newTerm();
    const [withCourse] = await body(
      await t.api.education.courses.$post({ json: { termId: term?.id ?? 0, title: "Statistics" } }),
    );
    const courseId = withCourse?.courses[0]?.id ?? 0;
    await t.api.education.courses[":id"].assessments.$post({
      ...courseParam(courseId),
      json: { kind: "exam", label: "Final exam" },
    });
    const [after] = await body(
      await t.api.education.courses[":id"].assessments.$post({
        ...courseParam(courseId),
        json: { label: "Lab report" },
      }),
    );
    const [exam, lab] = after?.courses[0]?.assessments ?? [];
    expect([exam?.kind, lab?.kind]).toEqual(["exam", "other"]);

    await t.api.education.assessments[":id"].$patch({
      param: { id: String(exam?.id) },
      json: { done: true },
    });
    const [final] = await body(
      await t.api.education.assessments[":id"].$delete({ param: { id: String(lab?.id) } }),
    );
    expect(final?.courses[0]?.assessments).toEqual([
      { id: exam?.id, kind: "exam", label: "Final exam", done: true },
    ]);
    expect((await history(courseId)).map((entry) => entry.details)).toEqual([
      { changes: { assessments: { from: "1 of 2 done", to: "1 of 1 done" } } },
      { changes: { assessments: { from: "0 of 2 done", to: "1 of 2 done" } } },
      { changes: { assessments: { from: "0 of 1 done", to: "0 of 2 done" } } },
      { changes: { assessments: { from: "0 of 0 done", to: "0 of 1 done" } } },
      null,
    ]);
  });

  it("deletes a term with its courses, keeping time logged on them", async () => {
    const [term] = await newTerm();
    const [withCourse] = await body(
      await t.api.education.courses.$post({
        json: { termId: term?.id ?? 0, code: "ABC101", title: "Networks" },
      }),
    );
    const courseId = withCourse?.courses[0]?.id ?? 0;
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    const entry = await body(
      await t.api.time.entries.$post({
        json: {
          startedAt: minutesAgo(60),
          endedAt: minutesAgo(30),
          subject: { type: "course", id: courseId },
        },
      }),
    );
    expect(entry.subject).toEqual({ type: "course", id: courseId, label: "ABC101 Networks" });

    expect(
      (await t.api.education.terms[":id"].$delete({ param: { id: String(term?.id) } })).status,
    ).toBe(204);
    expect(await body(await t.api.education.terms.$get())).toEqual([]);
    const [kept] = await body(await t.api.time.entries.$get({ query: {} }));
    expect(kept).toMatchObject({ minutes: 30, subject: { type: "course", label: null } });
  });
});

describe("hub-education/v1 import", () => {
  it("previews, imports, and re-imports without duplicates", async () => {
    const preview = await body(
      await t.api.education.import.$post({ query: { dryRun: "true" }, json: plan }),
    );
    expect(preview).toEqual({
      termsCreated: 1,
      termsUpdated: 0,
      coursesCreated: 2,
      coursesUpdated: 0,
      assessmentsAdded: 2,
    });
    expect(await body(await t.api.education.terms.$get())).toEqual([]);

    await body(await t.api.education.import.$post({ query: {}, json: plan }));
    const [term] = await body(await t.api.education.terms.$get());
    expect(term).toMatchObject({ name: "Term 1", creditGoal: 6 });
    expect(
      term?.courses.map((course) => [course.code, course.status, course.assessments.length]),
    ).toEqual([
      ["ABC101", "in_progress", 2],
      ["ABC102", "not_started", 0],
    ]);

    // The same plan again, with a course passed, a date moved, and one more assessment.
    const [first] = plan.terms;
    if (!first?.courses?.[0]) throw new Error("Expected a course in the plan");
    const updated: EducationImport = {
      ...plan,
      terms: [
        {
          ...first,
          name: "term 1",
          endDate: "2030-07-31",
          courses: [
            {
              ...first.courses[0],
              status: "passed",
              assessments: [
                { kind: "exam", label: "exam" },
                { kind: "other", label: "Discussion posts" },
              ],
            },
          ],
        },
      ],
    };
    const again = await body(await t.api.education.import.$post({ query: {}, json: updated }));
    expect(again).toEqual({
      termsCreated: 0,
      termsUpdated: 1,
      coursesCreated: 0,
      coursesUpdated: 1,
      assessmentsAdded: 1,
    });
    const [after] = await body(await t.api.education.terms.$get());
    expect(after).toMatchObject({ endDate: "2030-07-31" });
    expect(after?.courses[0]).toMatchObject({
      code: "ABC101",
      status: "passed",
      completedOn: today,
    });
    expect(after?.courses[0]?.assessments.map((item) => item.label)).toEqual([
      "Exam",
      "Project",
      "Discussion posts",
    ]);
  });

  it("explains files it can't import", async () => {
    const wrong = await failure(
      await t.app.request("/api/education/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "something-else", terms: [] }),
      }),
    );
    expect(wrong).toMatchObject({ status: 400, error: "That file can't be imported." });
    const empty = await t.api.education.import.$post({
      query: {},
      json: { format: "hub-education/v1", terms: [] },
    });
    expect(empty.status).toBe(400);
  });
});

describe("study streak", () => {
  /** Midday UTC some days back, so entries land on that day in the test time zone. */
  const daysAgo = (days: number, minutes: number) => {
    const start = new Date(`${today}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - days);
    return {
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
    };
  };

  it("counts days meeting the minimum from time logged on courses", async () => {
    const [term] = await newTerm();
    if (!term) throw new Error("Expected a term");
    const [withCourse] = await body(
      await t.api.education.courses.$post({ json: { termId: term.id, title: "Networks" } }),
    );
    const course = withCourse?.courses[0];
    if (!course) throw new Error("Expected a course");
    const subject = { type: "course" as const, id: course.id };
    const project = await body(await t.api.projects.$post({ json: { name: "Garden" } }));

    for (const json of [
      { ...daysAgo(3, 45), subject },
      { ...daysAgo(2, 30), subject },
      { ...daysAgo(1, 20), subject },
      { ...daysAgo(1, 20), subject },
      // Time on anything else doesn't count.
      { ...daysAgo(1, 90), subject: { type: "project" as const, id: project.id } },
      { ...daysAgo(2, 90) },
    ]) {
      expect((await t.api.time.entries.$post({ json })).status).toBe(201);
    }

    const streak = await body(await t.api.education.streak.$get());
    expect(streak).toMatchObject({
      minimum: 30,
      today,
      todayMinutes: 0,
      current: 3,
      longest: 3,
    });
    expect(streak.days.at(-1)).toEqual({ date: today, minutes: 0 });
    expect(streak.days.at(-2)?.minutes).toBe(40);
    expect(streak.days.length).toBeGreaterThanOrEqual(22);
    expect(streak.days.length).toBeLessThanOrEqual(28);
    expect(new Date(`${streak.days[0]?.date}T00:00:00Z`).getUTCDay()).toBe(1);

    // A higher minimum is applied to every day, and a running course timer counts today.
    await t.api.settings.$put({ json: { studyMinimumMinutes: 45 } });
    await t.api.time.timer.$post({ json: { subject } });
    expect(await body(await t.api.education.streak.$get())).toMatchObject({
      minimum: 45,
      todayMinutes: 0,
      current: 0,
      longest: 1,
    });

    const invalid = await failure(await t.api.settings.$put({ json: { studyMinimumMinutes: 2 } }));
    expect(invalid).toMatchObject({
      status: 400,
      issues: [{ path: "studyMinimumMinutes", message: "Use at least 5 minutes a day." }],
    });
  });
});

describe("studyStreak", () => {
  it("dates entries in the owner's time zone and counts a running timer", () => {
    const at = (iso: string) => new Date(iso);
    t.db
      .insert(timeEntries)
      .values([
        // 10:30 PM on Jan 9 in New York, although it's already Jan 10 in UTC.
        {
          startedAt: at("2030-01-10T03:30:00Z"),
          endedAt: at("2030-01-10T04:10:00Z"),
          minutes: 40,
          subjectType: "course",
          subjectId: 99,
        },
        // Running since 10 AM on Jan 10 in New York.
        { startedAt: at("2030-01-10T15:00:00Z"), subjectType: "course", subjectId: 99 },
      ])
      .run();
    const streak = studyStreak(t.db, {
      now: at("2030-01-10T15:35:00Z"),
      timeZone: "America/New_York",
      minimum: 30,
    });
    expect(streak).toMatchObject({ today: "2030-01-10", todayMinutes: 35, current: 2, longest: 2 });
    expect(streak.days.slice(-2)).toEqual([
      { date: "2030-01-09", minutes: 40 },
      { date: "2030-01-10", minutes: 35 },
    ]);
  });
});
