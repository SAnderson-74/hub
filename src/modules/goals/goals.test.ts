import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { GoalCreate } from "../../shared/goals";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const newGoal = async (json: GoalCreate) => body(await t.api.goals.$post({ json }));
const getGoal = (id: number) => t.api.goals[":id"].$get({ param: { id: String(id) } });
const patchGoal = (
  id: number,
  json: Parameters<(typeof t.api.goals)[":id"]["$patch"]>[0]["json"],
) => t.api.goals[":id"].$patch({ param: { id: String(id) }, json });
const addMilestone = async (goalId: number, title: string, targetDate?: string | null) =>
  body(
    await t.api.goals[":id"].milestones.$post({
      param: { id: String(goalId) },
      json: { title, targetDate },
    }),
  );
const milestone = (goalId: number, milestoneId: number) => ({
  param: { id: String(goalId), milestoneId: String(milestoneId) },
});

describe("goals API", () => {
  it("tracks progress from milestones, in date order, on the goal's timeline", async () => {
    const goal = await newGoal({ title: "Run a 10K", targetDate: "2030-06-01" });
    expect(goal).toMatchObject({
      status: "active",
      progressMode: "milestones",
      progress: { percent: 0, summary: "No milestones yet" },
      milestones: [],
      tasks: [],
    });

    await addMilestone(goal.id, "Race day", null);
    await addMilestone(goal.id, "Run 5K without stopping", "2030-03-01");
    const withMilestones = await addMilestone(goal.id, "Run 3K", "2030-02-01");
    expect(withMilestones.milestones.map((item) => item.title)).toEqual([
      "Run 3K",
      "Run 5K without stopping",
      "Race day",
    ]);

    const first = withMilestones.milestones[0];
    if (!first) throw new Error("Expected a milestone");
    const done = await body(
      await t.api.goals[":id"].milestones[":milestoneId"].$patch({
        ...milestone(goal.id, first.id),
        json: { done: true },
      }),
    );
    expect(done.progress).toEqual({ percent: 33, summary: "1 of 3 milestones" });
    expect(done.milestones[0]).toMatchObject({ done: true, doneAt: expect.any(String) });

    const history = await body(
      await t.api.activity.$get({ query: { type: "goal", id: String(goal.id) } }),
    );
    expect(history.entries[0]?.details).toEqual({
      changes: { milestones: { from: "0 of 3 done", to: "1 of 3 done" } },
    });

    const removed = await body(
      await t.api.goals[":id"].milestones[":milestoneId"].$delete(milestone(goal.id, first.id)),
    );
    expect(removed.progress.summary).toBe("0 of 2 milestones");
  });

  it("tracks progress from linked tasks", async () => {
    const goal = await newGoal({ title: "Pass the exam", progressMode: "tasks" });
    const task = async (title: string) => body(await t.api.tasks.$post({ json: { title } }));
    const a = await task("Read chapters 1-4");
    const b = await task("Practice test");
    // Links count in either direction.
    await t.api.links.$post({
      json: {
        from: { type: "task", id: a.id },
        to: { type: "goal", id: goal.id },
        relation: "goal",
      },
    });
    await t.api.links.$post({
      json: { from: { type: "goal", id: goal.id }, to: { type: "task", id: b.id } },
    });
    await t.api.tasks[":id"].$patch({ param: { id: String(a.id) }, json: { status: "done" } });

    const detail = await body(await getGoal(goal.id));
    expect(detail.progress).toEqual({ percent: 50, summary: "1 of 2 tasks" });
    expect(detail.linkedTaskCount).toBe(2);
    expect(detail.tasks.map((item) => [item.title, item.status])).toEqual([
      ["Read chapters 1-4", "done"],
      ["Practice test", "todo"],
    ]);

    // Unlinking uses the links API; deleting a task drops it from the count.
    const [first] = detail.tasks;
    await t.api.links[":id"].$delete({ param: { id: String(first?.linkId) } });
    await t.api.tasks[":id"].$delete({ param: { id: String(b.id) } });
    const after = await body(await getGoal(goal.id));
    expect(after).toMatchObject({ linkedTaskCount: 0, tasks: [] });
    expect(after.progress.summary).toBe("No linked tasks yet");
  });

  it("tracks progress from an amount or by hand, and records status changes", async () => {
    const saving = await newGoal({
      title: "Emergency fund",
      progressMode: "amount",
      targetCents: 500_000,
      currentCents: 125_000,
    });
    expect(saving.progress).toEqual({ percent: 25, summary: "$1,250 of $5,000" });
    const over = await body(await patchGoal(saving.id, { currentCents: 600_000 }));
    expect(over.progress.percent).toBe(100);
    const noTarget = await body(await patchGoal(saving.id, { targetCents: null }));
    expect(noTarget.progress).toEqual({ percent: 0, summary: "$6,000 saved, no target yet" });

    const manual = await body(
      await patchGoal(saving.id, { progressMode: "manual", manualPercent: 40 }),
    );
    expect(manual.progress).toEqual({ percent: 40, summary: "Set by hand" });

    const achieved = await body(await patchGoal(saving.id, { status: "achieved" }));
    expect(achieved.closedAt).not.toBeNull();
    const reopened = await body(await patchGoal(saving.id, { status: "active" }));
    expect(reopened.closedAt).toBeNull();

    const history = await body(
      await t.api.activity.$get({ query: { type: "goal", id: String(saving.id) } }),
    );
    expect(history.entries.find((entry) => entry.action === "updated")?.details).toEqual({
      changes: { status: { from: "achieved", to: "active" } },
    });
    const amountChange = history.entries.at(-2)?.details;
    expect(amountChange).toEqual({ changes: { current: { from: "$1,250", to: "$6,000" } } });
  });

  it("deletes a goal with its milestones but keeps linked tasks", async () => {
    const goal = await newGoal({ title: "Learn to juggle" });
    const kept = await body(await t.api.tasks.$post({ json: { title: "Buy juggling balls" } }));
    await t.api.links.$post({
      json: {
        from: { type: "task", id: kept.id },
        to: { type: "goal", id: goal.id },
        relation: "goal",
      },
    });
    await addMilestone(goal.id, "Three-ball cascade");

    expect((await t.api.goals[":id"].$delete({ param: { id: String(goal.id) } })).status).toBe(204);
    expect(await failure(await getGoal(goal.id))).toEqual({
      status: 404,
      error: "That goal doesn't exist. It may have been deleted.",
    });
    expect((await t.api.tasks[":id"].$get({ param: { id: String(kept.id) } })).status).toBe(200);
    expect(
      await body(await t.api.links.$get({ query: { type: "task", id: String(kept.id) } })),
    ).toEqual([]);
  });

  it("validates goals and milestones", async () => {
    const blank = await failure(await t.api.goals.$post({ json: { title: " " } }));
    expect(blank).toMatchObject({ status: 400, error: "That goal isn't valid." });
    const goal = await newGoal({ title: "Read 20 books" });
    expect((await patchGoal(goal.id, { manualPercent: 101 })).status).toBe(400);
    expect((await patchGoal(goal.id, { currentCents: -1 })).status).toBe(400);
    expect((await patchGoal(goal.id, { targetDate: "2030-13-01" })).status).toBe(400);

    const other = await newGoal({ title: "Other goal" });
    const withOne = await addMilestone(goal.id, "First five");
    const [first] = withOne.milestones;
    const wrongGoal = await t.api.goals[":id"].milestones[":milestoneId"].$patch({
      ...milestone(other.id, first?.id ?? 0),
      json: { done: true },
    });
    expect(wrongGoal.status).toBe(404);
  });
});
