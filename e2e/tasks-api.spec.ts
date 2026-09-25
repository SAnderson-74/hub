import { expect, test } from "@playwright/test";

// The tasks screens come later; until then this checks the tasks API end to end
// against the production build (migrations applied, routes mounted, auth in place).
test("tasks API: project, task, subtask, tag, link, and history", async ({ request }, testInfo) => {
  // All tests share one database, so names are unique per device project.
  const suffix = testInfo.project.name;

  const projectRes = await request.post("/api/projects", {
    data: { name: `Garden ${suffix}`, kind: "general" },
  });
  expect(projectRes.status()).toBe(201);
  const project = await projectRes.json();

  const taskRes = await request.post("/api/tasks", {
    data: { title: `Plant seeds ${suffix}`, projectId: project.id, tags: ["Outdoors"] },
  });
  expect(taskRes.status()).toBe(201);
  const task = await taskRes.json();
  expect(task.tags).toEqual([expect.objectContaining({ name: "Outdoors" })]);

  const subtaskRes = await request.post("/api/tasks", {
    data: { title: `Buy seeds ${suffix}`, parentId: task.id },
  });
  expect((await subtaskRes.json()).projectId).toBe(project.id);

  const done = await request.patch(`/api/tasks/${task.id}`, { data: { status: "done" } });
  expect((await done.json()).completedAt).not.toBeNull();

  const linkRes = await request.post("/api/links", {
    data: { from: { type: "task", id: task.id }, to: { type: "project", id: project.id } },
  });
  expect(linkRes.status()).toBe(201);

  const list = await (await request.get(`/api/tasks?projectId=${project.id}`)).json();
  expect(list).toEqual([
    expect.objectContaining({ id: task.id, status: "done", subtaskCount: 1, subtasksDone: 0 }),
  ]);

  const history = await (await request.get(`/api/activity?type=task&id=${task.id}`)).json();
  expect(history.entries.map((entry: { action: string }) => entry.action)).toEqual([
    "linked",
    "updated",
    "created",
  ]);

  const invalid = await request.post("/api/tasks", { data: { title: "" } });
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: "That task isn't valid." });
});
