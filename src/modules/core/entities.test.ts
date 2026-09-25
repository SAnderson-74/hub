import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { EntityType } from "../../shared/entities";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const newProject = async (name: string) => body(await t.api.projects.$post({ json: { name } }));
const newTask = async (title: string, tags?: string[]) =>
  body(await t.api.tasks.$post({ json: { title, tags } }));
const linksOf = async (type: EntityType, id: number) =>
  body(await t.api.links.$get({ query: { type, id: String(id) } }));
const activityOf = async (type: EntityType, id: number) =>
  (await body(await t.api.activity.$get({ query: { type, id: String(id) } }))).entries;

describe("links API", () => {
  it("links two entities and lists the link from both ends", async () => {
    const project = await newProject("Stereo repair");
    const task = await newTask("Order capacitors");

    const created = await t.api.links.$post({
      json: { from: { type: "task", id: task.id }, to: { type: "project", id: project.id } },
    });
    expect(created.status).toBe(201);
    const link = await body(created);
    expect(link).toMatchObject({
      relation: "related",
      direction: "outgoing",
      entity: { type: "project", id: project.id, label: "Stereo repair" },
    });

    expect(await linksOf("project", project.id)).toEqual([
      {
        id: link.id,
        relation: "related",
        direction: "incoming",
        entity: { type: "task", id: task.id, label: "Order capacitors" },
        createdAt: link.createdAt,
      },
    ]);

    // Links show up on both timelines.
    expect((await activityOf("task", task.id))[0]).toMatchObject({
      action: "linked",
      details: { direction: "outgoing", other: { type: "project", label: "Stereo repair" } },
    });
    expect((await activityOf("project", project.id))[0]).toMatchObject({
      action: "linked",
      details: { direction: "incoming", other: { type: "task", label: "Order capacitors" } },
    });

    const removed = await t.api.links[":id"].$delete({ param: { id: String(link.id) } });
    expect(removed.status).toBe(204);
    expect(await linksOf("task", task.id)).toEqual([]);
    expect((await activityOf("task", task.id))[0]?.action).toBe("unlinked");
    expect((await t.api.links[":id"].$delete({ param: { id: String(link.id) } })).status).toBe(404);
  });

  it("rejects self links, duplicates, and missing entities", async () => {
    const a = await newTask("Sand panel");
    const b = await newTask("Paint panel");
    const link = (json: Parameters<typeof t.api.links.$post>[0]["json"]) =>
      t.api.links.$post({ json });

    const self = await failure(
      await link({ from: { type: "task", id: a.id }, to: { type: "task", id: a.id } }),
    );
    expect(self.status).toBe(400);

    const blocks = { from: { type: "task", id: a.id }, to: { type: "task", id: b.id } } as const;
    expect((await link({ ...blocks, relation: "Blocks" })).status).toBe(201);
    expect((await failure(await link({ ...blocks, relation: "blocks" }))).status).toBe(409);
    expect((await link(blocks)).status).toBe(201); // a different relation is a different link

    const missing = await failure(
      await link({ from: { type: "task", id: a.id }, to: { type: "project", id: 999 } }),
    );
    expect(missing).toEqual({
      status: 400,
      error: "That project doesn't exist. It may have been deleted.",
    });
    expect((await t.api.links.$get({ query: { type: "task", id: "999" } })).status).toBe(404);
    expect((await link({ ...blocks, relation: "no spaces" })).status).toBe(400);
  });

  it("removes links and tags when an entity is deleted, and notes it on the other end", async () => {
    const project = await newProject("Workbench");
    const task = await newTask("Build shelf", ["Wood"]);
    await t.api.links.$post({
      json: { from: { type: "project", id: project.id }, to: { type: "task", id: task.id } },
    });

    await t.api.tasks[":id"].$delete({ param: { id: String(task.id) } });

    expect(await linksOf("project", project.id)).toEqual([]);
    expect((await activityOf("project", project.id))[0]).toMatchObject({
      action: "unlinked",
      details: {
        direction: "outgoing",
        other: { type: "task", id: task.id, label: "Build shelf" },
      },
    });
    const tags = await body(await t.api.tags.$get());
    expect(tags).toEqual([{ id: expect.any(Number), name: "Wood", count: 0 }]);
  });
});

describe("tags API", () => {
  it("lists, renames, and deletes tags", async () => {
    const task = await newTask("Mail package", ["Errands", "Post office"]);
    await newTask("Buy milk", ["errands"]);

    const tags = await body(await t.api.tags.$get());
    expect(tags.map((tag) => [tag.name, tag.count])).toEqual([
      ["Errands", 2],
      ["Post office", 1],
    ]);
    const [errands, post] = tags;
    if (!errands || !post) throw new Error("Expected two tags");

    const clash = await failure(
      await t.api.tags[":id"].$patch({ param: { id: String(post.id) }, json: { name: "ERRANDS" } }),
    );
    expect(clash.status).toBe(409);

    const renamed = await body(
      await t.api.tags[":id"].$patch({ param: { id: String(post.id) }, json: { name: "Mail" } }),
    );
    expect(renamed).toEqual({ id: post.id, name: "Mail" });

    // Changing only the letter case of a tag's own name is fine.
    const recased = await t.api.tags[":id"].$patch({
      param: { id: String(errands.id) },
      json: { name: "errands" },
    });
    expect(recased.status).toBe(200);

    expect((await t.api.tags[":id"].$delete({ param: { id: String(errands.id) } })).status).toBe(
      204,
    );
    const detail = await body(await t.api.tasks[":id"].$get({ param: { id: String(task.id) } }));
    expect(detail.tags.map((tag) => tag.name)).toEqual(["Mail"]);
  });
});

describe("activity API", () => {
  it("records who changed what, newest first, with paging", async () => {
    const task = await newTask("Draft budget");
    await t.api.tasks[":id"].$patch({
      param: { id: String(task.id) },
      json: { title: "Draft monthly budget", status: "doing", tags: ["Money"] },
    });
    // Reordering alone isn't worth a timeline entry.
    await t.api.tasks[":id"].$patch({ param: { id: String(task.id) }, json: { sortOrder: 0.5 } });
    await t.api.tasks[":id"].$delete({ param: { id: String(task.id) } });

    const entries = await activityOf("task", task.id);
    expect(entries.map((entry) => entry.action)).toEqual(["deleted", "updated", "created"]);
    expect(entries[1]).toMatchObject({
      label: "Draft monthly budget",
      actor: "john.smith@example.com",
      details: {
        changes: {
          title: { from: "Draft budget", to: "Draft monthly budget" },
          status: { from: "todo", to: "doing" },
          tags: { from: [], to: ["Money"] },
        },
      },
    });
    expect(entries[0]?.label).toBe("Draft monthly budget"); // kept after deletion

    await newProject("Second");
    const first = await body(await t.api.activity.$get({ query: { limit: "2" } }));
    expect(first.entries.map((entry) => entry.action)).toEqual(["created", "deleted"]);
    expect(first.nextBefore).not.toBeNull();
    const rest = await body(
      await t.api.activity.$get({ query: { limit: "2", before: String(first.nextBefore) } }),
    );
    expect(rest.entries.map((entry) => entry.action)).toEqual(["updated", "created"]);
    expect(rest.nextBefore).toBeNull();

    expect((await t.api.activity.$get({ query: { id: "1" } })).status).toBe(400);
  });
});
