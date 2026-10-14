import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { TaskCreate, TaskUpdate } from "../../shared/tasks";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const add = async (json: TaskCreate) => body(await t.api.tasks.$post({ json }));
const patch = (id: number, json: TaskUpdate) =>
  t.api.tasks[":id"].$patch({ param: { id: String(id) }, json });
const get = async (id: number) =>
  body(await t.api.tasks[":id"].$get({ param: { id: String(id) } }));

describe("start dates, Someday, This evening, and waiting on", () => {
  it("saves the planning fields and lists them", async () => {
    const task = await add({
      title: "Paint the fence",
      startDate: "2030-01-05",
      dueDate: "2030-01-10",
      evening: true,
    });
    expect(task).toMatchObject({
      startDate: "2030-01-05",
      someday: false,
      evening: true,
      waitingOn: [],
    });
    await body(await patch(task.id, { someday: true, startDate: null }));
    const [listed] = await body(await t.api.tasks.$get({ query: {} }));
    expect(listed).toMatchObject({ someday: true, startDate: null, evening: true });
  });

  it("won't start after it's due", async () => {
    expect(
      await failure(
        await t.api.tasks.$post({
          json: { title: "Backwards", startDate: "2030-02-01", dueDate: "2030-01-01" },
        }),
      ),
    ).toEqual({
      status: 400,
      error: "The start date can't be after the due date. Move one of them.",
    });
    const task = await add({ title: "Later", dueDate: "2030-01-10" });
    expect((await failure(await patch(task.id, { startDate: "2030-01-11" }))).status).toBe(400);
  });

  it("waits on other tasks until they're done", async () => {
    const quote = await add({ title: "Get a quote" });
    const order = await add({ title: "Order parts" });
    const fix = await add({ title: "Fix the sink", waitingOn: [quote.id] });
    expect(fix.waitingOn).toEqual([{ id: quote.id, title: "Get a quote", done: false }]);

    const both = await body(await patch(fix.id, { waitingOn: [quote.id, order.id] }));
    expect(both.waitingOn.map((item) => item.title)).toEqual(["Get a quote", "Order parts"]);
    await body(await patch(quote.id, { status: "done" }));
    expect((await get(fix.id)).waitingOn[0]).toMatchObject({ done: true });

    // Recorded on the timeline.
    const history = await body(
      await t.api.activity.$get({ query: { type: "task", id: String(fix.id) } }),
    );
    expect(history.entries[0]?.details).toEqual({
      changes: { waitingOn: { from: ["Get a quote"], to: ["Get a quote", "Order parts"] } },
    });

    // Deleting a task it waits on lets it go.
    await t.api.tasks[":id"].$delete({ param: { id: String(order.id) } });
    expect((await get(fix.id)).waitingOn.map((item) => item.title)).toEqual(["Get a quote"]);
    expect((await body(await patch(fix.id, { waitingOn: [] }))).waitingOn).toEqual([]);
  });

  it("refuses waiting on itself, on a missing task, or in a loop", async () => {
    const a = await add({ title: "A" });
    const b = await add({ title: "B", waitingOn: [a.id] });
    expect((await failure(await patch(a.id, { waitingOn: [a.id] }))).error).toBe(
      "A task can't wait on itself. Pick a different task.",
    );
    expect((await failure(await patch(a.id, { waitingOn: [999] }))).status).toBe(400);
    expect((await failure(await patch(a.id, { waitingOn: [b.id] }))).error).toBe(
      "Those tasks would wait on each other. Take one of them out of the other's list.",
    );
  });

  it("moves the start date with the next repeat", async () => {
    const task = await add({
      title: "Water plants",
      startDate: "2030-01-08",
      dueDate: "2030-01-10",
      evening: true,
      recurrence: { frequency: "weekly", interval: 1 },
    });
    await body(await patch(task.id, { status: "done" }));
    const open = await body(await t.api.tasks.$get({ query: { status: "todo" } }));
    expect(open[0]).toMatchObject({
      dueDate: "2030-01-17",
      startDate: "2030-01-15",
      evening: true,
    });
  });
});
