import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { settings } from "../core/schema";
import { addCheckin } from "../goals/goals.service";
import { finishReview, getReview, tickStep } from "./review.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

// A Wednesday; its week starts Monday the 11th.
const today = "2030-03-13";

const step = (review: ReturnType<typeof getReview>, id: string) =>
  review.steps.find((item) => item.id === id);

describe("the calendar", () => {
  it("lists what's dated in a range, each with a link to open it", async () => {
    const task = await body(
      await t.api.tasks.$post({ json: { title: "Renew the lease", dueDate: "2030-03-20" } }),
    );
    await t.api.tasks.$post({ json: { title: "Later", dueDate: "2030-06-01" } });
    const goal = await body(
      await t.api.goals.$post({ json: { title: "Run a 10K", targetDate: "2030-03-30" } }),
    );

    const calendar = await body(
      await t.api.planner.calendar.$get({ query: { from: "2030-03-01", to: "2030-03-31" } }),
    );
    expect(calendar.items).toEqual([
      {
        key: `task:${task.id}`,
        kind: "task",
        title: "Renew the lease",
        date: "2030-03-20",
        href: `/tasks?task=${task.id}`,
      },
      {
        key: `goal:${goal.id}`,
        kind: "goal",
        title: "Run a 10K",
        date: "2030-03-30",
        href: `/goals?goal=${goal.id}`,
      },
    ]);
    expect(calendar.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("asks for a sensible range", async () => {
    const backwards = await t.api.planner.calendar.$get({
      query: { from: "2030-03-31", to: "2030-03-01" },
    });
    expect(await failure(backwards)).toMatchObject({
      status: 400,
      error: "Ask for dates like 2030-01-31.",
    });
    const tooLong = await t.api.planner.calendar.$get({
      query: { from: "2030-01-01", to: "2030-12-31" },
    });
    expect(tooLong.status).toBe(400);
  });
});

describe("the weekly review", () => {
  it("counts what needs a look in each module, with a link to each fix", async () => {
    await t.api.tasks.$post({ json: { title: "Pay the deposit", dueDate: "2030-03-10" } });
    await t.api.tasks.$post({ json: { title: "Loose idea" } });
    await t.api.tasks.$post({ json: { title: "Learn the banjo", someday: true } });
    await t.api.tasks.$post({ json: { title: "Dentist", dueDate: "2030-03-15" } });
    const goal = await body(await t.api.goals.$post({ json: { title: "Save for a bike" } }));
    await t.api.goals.$post({ json: { title: "Read 12 books" } });
    addCheckin(t.db, goal.id, { note: "" }, "2030-03-12");

    const review = getReview(t.db, today);
    expect(review.week).toBe("2030-03-11");
    expect(review.finishedAt).toBeNull();
    expect(step(review, "overdue")).toMatchObject({
      kind: "fix",
      count: 1,
      summary: "1 task past due. Do, move, or drop each one.",
      href: "/tasks?list=today",
      done: false,
    });
    // The overdue task, the dated one, and the loose one have no project; Someday doesn't count.
    expect(step(review, "inbox")).toMatchObject({ count: 3, href: "/tasks?project=inbox" });
    expect(step(review, "someday")).toMatchObject({ count: 1 });
    expect(step(review, "week-ahead")).toMatchObject({
      count: 1,
      summary: "1 dated thing in the next 7 days.",
      href: "/calendar",
    });
    // One goal has a check-in this week; the other doesn't.
    expect(step(review, "goals")).toMatchObject({ count: 1, done: false });
    // Nothing to fix counts as done; a look still needs ticking.
    expect(step(review, "uncategorized")).toMatchObject({ count: 0, done: true });
    expect(step(review, "time")).toMatchObject({ kind: "look", count: null, done: false });
  });

  it("ticks steps off and finishes, for this week only", async () => {
    tickStep(t.db, today, "time", true);
    tickStep(t.db, today, "inbox", true);
    let review = tickStep(t.db, today, "inbox", false);
    expect(step(review, "time")?.done).toBe(true);
    expect(step(review, "inbox")?.done).toBe(false);

    review = finishReview(t.db, today, true);
    expect(review.finishedAt).not.toBeNull();
    // Next week starts fresh, and remembers when the last one was finished.
    const next = getReview(t.db, "2030-03-18");
    expect(next).toMatchObject({
      week: "2030-03-18",
      finishedAt: null,
      lastFinished: "2030-03-11",
    });
    expect(step(next, "time")?.done).toBe(false);
  });

  it("leaves out modules that are off", async () => {
    t.db
      .insert(settings)
      .values({ key: "modules", value: { money: false, resale: false }, updatedAt: new Date() })
      .run();
    const ids = getReview(t.db, today).steps.map((item) => item.id);
    expect(ids).not.toContain("uncategorized");
    expect(ids).not.toContain("resale-aging");
    expect(ids).toContain("overdue");
  });

  it("is ticked through the API, which checks the step", async () => {
    const ticked = await body(
      await t.api.planner.review.steps[":step"].$put({
        param: { step: "time" },
        json: { done: true },
      }),
    );
    expect(ticked.steps.find((item) => item.id === "time")?.done).toBe(true);
    const unknown = await t.api.planner.review.steps[":step"].$put({
      // @ts-expect-error: not a step
      param: { step: "laundry" },
      json: { done: true },
    });
    expect(await failure(unknown)).toMatchObject({
      status: 400,
      error: "That review step doesn't exist.",
    });
    const finished = await body(
      await t.api.planner.review.finished.$put({ json: { finished: true } }),
    );
    expect(finished.finishedAt).not.toBeNull();
    const fetched = await body(await t.api.planner.review.$get());
    expect(fetched.finishedAt).toBe(finished.finishedAt);
  });
});
