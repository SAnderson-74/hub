import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { TasksDocument } from "../../shared/tasksImport";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const run = async (document: TasksDocument, dryRun = false) =>
  body(
    await t.api.tasks.import.$post({ query: dryRun ? { dryRun: "true" } : {}, json: { document } }),
  );

const plan: TasksDocument = {
  format: "hub-tasks/v1",
  projects: [{ name: "Garage cleanup", notes: "Before winter." }],
  tasks: [
    {
      title: "Sort the shelves",
      project: "Garage cleanup",
      due: "2030-04-01",
      priority: "high",
      subtasks: ["Empty the top shelf", "Label the bins"],
    },
    { title: "Call the hardware store", notes: "Ask about shelf brackets." },
  ],
  goals: [
    {
      title: "Run a 10K",
      targetDate: "Sep 1, 2030",
      milestones: [{ title: "Run 5K without stopping", targetDate: "2030-05-01" }],
    },
  ],
};

describe("tasks pasted from the Claude Project", () => {
  it("preview without changing anything, then add projects, tasks, subtasks, and goals", async () => {
    const preview = await run(plan, true);
    expect(preview).toMatchObject({
      projectsCreated: ["Garage cleanup"],
      created: { tasks: 2, subtasks: 2, goals: 1, milestones: 1 },
    });
    expect(await body(await t.api.projects.$get())).toEqual([]);
    expect(await body(await t.api.tasks.$get({ query: {} }))).toEqual([]);

    expect(await run(plan)).toMatchObject({ created: { tasks: 2, subtasks: 2, goals: 1 } });
    const [project] = await body(await t.api.projects.$get());
    expect(project).toMatchObject({ name: "Garage cleanup", notes: "Before winter." });
    const tasks = await body(await t.api.tasks.$get({ query: {} }));
    const shelves = tasks.find((task) => task.title === "Sort the shelves");
    expect(shelves).toMatchObject({ projectId: project?.id, dueDate: "2030-04-01", priority: 3 });
    const detail = await body(
      await t.api.tasks[":id"].$get({ param: { id: String(shelves?.id ?? 0) } }),
    );
    expect(detail.subtasks.map((subtask) => subtask.title)).toEqual([
      "Empty the top shelf",
      "Label the bins",
    ]);
    expect(tasks.find((task) => task.title === "Call the hardware store")).toMatchObject({
      projectId: null,
      notes: "Ask about shelf brackets.",
    });
    const [goal] = await body(await t.api.goals.$get());
    expect(goal).toMatchObject({ title: "Run a 10K", targetDate: "2030-09-01" });

    // The same answer again adds nothing.
    const again = await run(plan, true);
    expect(again.projectsCreated).toEqual([]);
    expect(again.created).toEqual({ tasks: 0, subtasks: 0, goals: 0, milestones: 0 });
    expect([...again.tasks, ...again.goals].map((item) => item.outcome)).toEqual([
      "duplicate",
      "duplicate",
      "duplicate",
    ]);
  });

  it("use projects already in Hub, and only skip open tasks in the same place", async () => {
    const project = await body(await t.api.projects.$post({ json: { name: "Garage Cleanup" } }));
    await body(
      await t.api.tasks.$post({ json: { title: "Sort the shelves", projectId: project.id } }),
    );
    await body(
      await t.api.tasks.$post({ json: { title: "Call the hardware store", status: "done" } }),
    );
    const result = await run({
      format: "hub-tasks/v1",
      tasks: [
        { title: "sort the shelves", project: "garage cleanup" },
        { title: "Sort the shelves" },
        { title: "Call the hardware store" },
      ],
    });
    expect(result.projectsCreated).toEqual([]);
    expect(result.tasks.map((task) => task.outcome)).toEqual(["duplicate", "create", "create"]);
  });

  it("leave off dates they can't read, and ask to check long numbers", async () => {
    const result = await run(
      {
        format: "hub-tasks/v1",
        tasks: [
          { title: "Renew the license", due: "someday" },
          { title: "Pay the bill", notes: "Account 000123456789" },
        ],
      },
      true,
    );
    expect(result.tasks[0]).toMatchObject({
      dueDate: null,
      notices: ["Due \"someday\" isn't a date Hub can read, so it's left off."],
    });
    expect(result.tasks[1]?.notices).toEqual([
      "It has a long number. Check it isn't an account, card, or ID number before adding it.",
    ]);
  });

  it("refuse what doesn't fit the format", async () => {
    const tooMany = Array.from({ length: 201 }, (_, index) => ({ title: `Task ${index}` }));
    for (const document of [
      { format: "hub-tasks/v1", tasks: tooMany },
      { format: "hub-tasks/v1", tasks: [{ title: "Done already", status: "done" }] },
      { format: "hub-tasks/v1" },
      { format: "hub-receipt/v1", tasks: [{ title: "A" }] },
    ]) {
      expect(
        await failure(
          await t.api.tasks.import.$post({ query: {}, json: { document: document as never } }),
        ),
      ).toMatchObject({ status: 400 });
    }
    expect(await body(await t.api.tasks.$get({ query: {} }))).toEqual([]);
  });
});
