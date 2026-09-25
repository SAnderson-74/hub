import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { ProjectCreate, TaskCreate } from "../../shared/tasks";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const newProject = async (json: ProjectCreate) => body(await t.api.projects.$post({ json }));
const newTask = async (json: TaskCreate) => body(await t.api.tasks.$post({ json }));
const getTask = async (id: number) => t.api.tasks[":id"].$get({ param: { id: String(id) } });
const patchTask = (
  id: number,
  json: Parameters<(typeof t.api.tasks)[":id"]["$patch"]>[0]["json"],
) => t.api.tasks[":id"].$patch({ param: { id: String(id) }, json });
const listTasks = async (query: Record<string, string> = {}) =>
  body(await t.api.tasks.$get({ query }));
const titles = (tasks: Array<{ title: string }>) => tasks.map((task) => task.title);

describe("projects API", () => {
  it("creates, lists with task counts, archives, and restores projects", async () => {
    const course = await newProject({ name: "  Networking basics ", kind: "course" });
    expect(course).toMatchObject({
      name: "Networking basics",
      kind: "course",
      notes: "",
      archived: false,
      archivedAt: null,
      openTaskCount: 0,
    });
    const general = await newProject({ name: "Around the house" });
    expect(general.kind).toBe("general");
    expect(general.sortOrder).toBeGreaterThan(course.sortOrder);

    await newTask({ title: "Read chapter 1", projectId: course.id });
    await newTask({ title: "Read chapter 2", projectId: course.id, status: "done" });
    const parent = await newTask({ title: "Lab 1", projectId: course.id });
    await newTask({ title: "Set up lab", parentId: parent.id }); // subtasks aren't counted

    const listed = await body(await t.api.projects.$get());
    expect(listed.map((p) => [p.name, p.openTaskCount, p.doneTaskCount])).toEqual([
      ["Networking basics", 2, 1],
      ["Around the house", 0, 0],
    ]);

    const param = { id: String(course.id) };
    const archived = await body(
      await t.api.projects[":id"].$patch({ param, json: { archived: true } }),
    );
    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).not.toBeNull();
    const restored = await body(
      await t.api.projects[":id"].$patch({ param, json: { archived: false, notes: "Term 1" } }),
    );
    expect(restored).toMatchObject({ archived: false, archivedAt: null, notes: "Term 1" });
  });

  it("rejects invalid projects with a message for each problem", async () => {
    const res = await t.api.projects.$post({ json: { name: "   ", kind: "general" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "That project isn't valid.",
      issues: [{ path: "name", message: "Give the project a name." }],
    });

    const unknownField = await t.app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Garage", color: "red" }),
    });
    expect(unknownField.status).toBe(400);
  });

  it("only deletes empty projects", async () => {
    const project = await newProject({ name: "Garage" });
    const task = await newTask({ title: "Sort shelves", projectId: project.id });
    const param = { id: String(project.id) };

    const blocked = await failure(await t.api.projects[":id"].$delete({ param }));
    expect(blocked.status).toBe(409);
    expect(blocked.error).toContain("still has tasks");

    await patchTask(task.id, { projectId: null });
    expect((await t.api.projects[":id"].$delete({ param })).status).toBe(204);
    const gone = await failure(await t.api.projects[":id"].$get({ param }));
    expect(gone).toEqual({
      status: 404,
      error: "That project doesn't exist. It may have been deleted.",
    });
  });
});

describe("tasks API", () => {
  it("creates tasks with defaults and tracks completion", async () => {
    const task = await newTask({ title: " Renew library card " });
    expect(task).toMatchObject({
      title: "Renew library card",
      notes: "",
      status: "todo",
      priority: 0,
      dueDate: null,
      projectId: null,
      parentId: null,
      completedAt: null,
      tags: [],
      subtasks: [],
    });

    const done = await body(await patchTask(task.id, { status: "done" }));
    expect(done.completedAt).not.toBeNull();
    const reopened = await body(await patchTask(task.id, { status: "doing", priority: 3 }));
    expect(reopened).toMatchObject({ status: "doing", priority: 3, completedAt: null });

    const startsDone = await newTask({ title: "Already done", status: "done" });
    expect(startsDone.completedAt).not.toBeNull();
  });

  it("lists top-level tasks in order with filters", async () => {
    const project = await newProject({ name: "Garden" });
    const soil = await newTask({ title: "Buy soil", projectId: project.id, dueDate: "2030-04-01" });
    await newTask({ title: "Plant seeds", projectId: project.id, status: "doing" });
    await newTask({ title: "Order hose", dueDate: "2030-05-01", tags: ["Errands"] });
    await newTask({ title: "Old chore", status: "done" });
    await newTask({ title: "Compare prices", parentId: soil.id, status: "done" });
    await newTask({ title: "Load car", parentId: soil.id });

    const all = await listTasks();
    expect(titles(all)).toEqual(["Buy soil", "Plant seeds", "Order hose", "Old chore"]);
    expect(all[0]).toMatchObject({ subtaskCount: 2, subtasksDone: 1 });

    expect(titles(await listTasks({ projectId: String(project.id) }))).toEqual([
      "Buy soil",
      "Plant seeds",
    ]);
    expect(titles(await listTasks({ projectId: "inbox" }))).toEqual(["Order hose", "Old chore"]);
    expect(titles(await listTasks({ status: "doing,done" }))).toEqual(["Plant seeds", "Old chore"]);
    expect(titles(await listTasks({ tag: "errands" }))).toEqual(["Order hose"]);
    expect(titles(await listTasks({ dueBy: "2030-04-15" }))).toEqual(["Buy soil"]);

    const bad = await t.api.tasks.$get({ query: { status: "someday" } });
    expect(bad.status).toBe(400);
  });

  it("reorders with fractional sort order", async () => {
    const a = await newTask({ title: "A" });
    const b = await newTask({ title: "B" });
    const c = await newTask({ title: "C" });
    await patchTask(c.id, { sortOrder: (a.sortOrder + b.sortOrder) / 2 });
    expect(titles(await listTasks())).toEqual(["A", "C", "B"]);
  });

  it("validates input and ids", async () => {
    const blank = await failure(await t.api.tasks.$post({ json: { title: "" } }));
    expect(blank).toMatchObject({ status: 400, error: "That task isn't valid." });

    const badDate = await t.api.tasks.$post({ json: { title: "Pay bill", dueDate: "2030-02-30" } });
    expect(badDate.status).toBe(400);

    const priority = await t.app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Pay bill", priority: 7 }),
    });
    expect(priority.status).toBe(400);

    const malformed = await t.app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toHaveProperty("error");

    expect((await t.app.request("/api/tasks/abc")).status).toBe(400);
    expect(await failure(await getTask(999))).toEqual({
      status: 404,
      error: "That task doesn't exist. It may have been deleted.",
    });
    const missingProject = await failure(
      await t.api.tasks.$post({ json: { title: "Pay bill", projectId: 999 } }),
    );
    expect(missingProject).toMatchObject({
      status: 400,
      error: expect.stringContaining("project"),
    });
  });
});

describe("subtasks", () => {
  it("keep subtasks one level deep and in their parent's project", async () => {
    const home = await newProject({ name: "Home" });
    const shed = await newProject({ name: "Shed" });
    const parent = await newTask({ title: "Paint fence", projectId: home.id });
    const child = await newTask({ title: "Buy paint", parentId: parent.id });
    expect(child).toMatchObject({ parentId: parent.id, projectId: home.id });

    const detail = await body(await getTask(parent.id));
    expect(titles(detail.subtasks)).toEqual(["Buy paint"]);

    const nested = await failure(
      await t.api.tasks.$post({ json: { title: "Pick color", parentId: child.id } }),
    );
    expect(nested).toMatchObject({ status: 400, error: expect.stringContaining("Subtasks can't") });

    const wrongProject = await failure(await patchTask(child.id, { projectId: shed.id }));
    expect(wrongProject.status).toBe(400);

    const self = await failure(await patchTask(parent.id, { parentId: parent.id }));
    expect(self.status).toBe(400);

    const other = await newTask({ title: "Clean gutters", projectId: home.id });
    const hasChildren = await failure(await patchTask(parent.id, { parentId: other.id }));
    expect(hasChildren.error).toContain("has subtasks");

    // Moving the parent takes its subtasks along.
    await patchTask(parent.id, { projectId: shed.id });
    expect((await body(await getTask(child.id))).projectId).toBe(shed.id);

    // A subtask can be promoted to a top-level task in another project.
    const promoted = await body(await patchTask(child.id, { parentId: null, projectId: home.id }));
    expect(promoted).toMatchObject({ parentId: null, projectId: home.id });

    // And a childless top-level task can become a subtask, joining the parent's project.
    const demoted = await body(await patchTask(other.id, { parentId: parent.id }));
    expect(demoted).toMatchObject({ parentId: parent.id, projectId: shed.id });
  });

  it("are deleted with their parent", async () => {
    const parent = await newTask({ title: "Plan trip" });
    const child = await newTask({ title: "Book hotel", parentId: parent.id });
    const res = await t.api.tasks[":id"].$delete({ param: { id: String(parent.id) } });
    expect(res.status).toBe(204);
    expect((await getTask(child.id)).status).toBe(404);
    expect(await listTasks()).toEqual([]);
  });
});

describe("task tags", () => {
  it("creates tags by name, ignoring letter case and repeats", async () => {
    const task = await newTask({
      title: "Return books",
      tags: ["Library", " errands ", "library"],
    });
    expect(task.tags.map((tag) => tag.name)).toEqual(["errands", "Library"]);

    const second = await newTask({ title: "Buy stamps", tags: ["ERRANDS"] });
    expect(second.tags).toEqual([task.tags[0]]); // reuses the existing tag

    const cleared = await body(await patchTask(task.id, { tags: ["Library"] }));
    expect(cleared.tags.map((tag) => tag.name)).toEqual(["Library"]);

    const tooLong = await t.api.tasks.$post({ json: { title: "x", tags: ["a".repeat(41)] } });
    expect(tooLong.status).toBe(400);
  });
});
