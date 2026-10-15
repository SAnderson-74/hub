import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { TaskCreate } from "../../shared/tasks";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const add = async (json: TaskCreate) => body(await t.api.tasks.$post({ json }));
const use = async (id: number, json: { date: string; projectId?: number | null }) =>
  body(await t.api.templates[":id"].use.$post({ param: { id: String(id) }, json }));
const task = async (id: number) =>
  body(await t.api.tasks[":id"].$get({ param: { id: String(id) } }));

describe("templates", () => {
  it("save a task with its checklist and reuse it on another day", async () => {
    const listing = await add({
      title: "List an item",
      dueDate: "2030-01-12",
      priority: 2,
      estimateMinutes: 45,
      tags: ["resale"],
    });
    await add({ title: "Take photos", parentId: listing.id, dueDate: "2030-01-10" });
    await add({ title: "Write the description", parentId: listing.id });

    const saved = await body(
      await t.api.templates.from.$post({ json: { name: "List an item", taskId: listing.id } }),
    );
    // Days count from the earliest due date: the photos.
    expect(saved).toMatchObject({
      name: "List an item",
      taskCount: 3,
      body: {
        project: null,
        tasks: [
          {
            title: "List an item",
            priority: 2,
            dueIn: 2,
            estimateMinutes: 45,
            tags: ["resale"],
            subtasks: [
              { title: "Take photos", dueIn: 0 },
              { title: "Write the description", dueIn: null },
            ],
          },
        ],
      },
    });

    const home = await body(await t.api.projects.$post({ json: { name: "Home" } }));
    const result = await use(saved.id, { date: "2030-03-01", projectId: home.id });
    const created = await task(result.taskIds[0] ?? 0);
    expect(created).toMatchObject({
      title: "List an item",
      dueDate: "2030-03-03",
      projectId: home.id,
      priority: 2,
      estimateMinutes: 45,
      tags: [{ name: "resale" }],
    });
    expect(created.subtasks.map((sub) => [sub.title, sub.dueDate])).toEqual([
      ["Take photos", "2030-03-01"],
      ["Write the description", null],
    ]);
  });

  it("save a project's open tasks and make a new project when used", async () => {
    const trip = await body(
      await t.api.projects.$post({ json: { name: "Trip prep", kind: "general" } }),
    );
    await add({ title: "Book the hotel", projectId: trip.id, dueDate: "2030-05-01" });
    await add({ title: "Pack", projectId: trip.id, dueDate: "2030-05-10" });
    await add({ title: "Old idea", projectId: trip.id, status: "done" });
    const saved = await body(
      await t.api.templates.from.$post({ json: { name: "Trip prep", projectId: trip.id } }),
    );
    expect(saved.body.tasks.map((item) => [item.title, item.dueIn])).toEqual([
      ["Book the hotel", 0],
      ["Pack", 9],
    ]);
    const result = await use(saved.id, { date: "2030-07-01" });
    expect(result.projectId).not.toBe(trip.id);
    const tasks = await body(
      await t.api.tasks.$get({ query: { projectId: String(result.projectId) } }),
    );
    expect(tasks.map((item) => [item.title, item.dueDate])).toEqual([
      ["Book the hotel", "2030-07-01"],
      ["Pack", "2030-07-10"],
    ]);
  });

  it("can be renamed, listed, and deleted", async () => {
    const made = await body(
      await t.api.templates.$post({
        json: { name: "Monthly close", body: { project: null, tasks: [{ title: "Reconcile" }] } },
      }),
    );
    const param = { param: { id: String(made.id) } };
    await body(await t.api.templates[":id"].$patch({ ...param, json: { name: "Month end" } }));
    expect((await body(await t.api.templates.$get())).map((item) => item.name)).toEqual([
      "Month end",
    ]);
    expect((await t.api.templates[":id"].$delete(param)).status).toBe(204);
    expect(
      (
        await failure(
          await t.api.templates[":id"].use.$post({ ...param, json: { date: "2030-01-01" } }),
        )
      ).status,
    ).toBe(404);
  });

  it("refuse empty templates and empty projects", async () => {
    expect(
      (
        await failure(
          await t.api.templates.$post({
            json: { name: "Empty", body: { project: null, tasks: [] } },
          }),
        )
      ).status,
    ).toBe(400);
    const empty = await body(await t.api.projects.$post({ json: { name: "Empty" } }));
    expect(
      await failure(
        await t.api.templates.from.$post({ json: { name: "Empty", projectId: empty.id } }),
      ),
    ).toEqual({ status: 400, error: "That project has no open tasks to save. Add some first." });
  });
});
