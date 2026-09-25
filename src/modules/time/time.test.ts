import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { TimeEntryCreate } from "../../shared/time";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const newTask = async (title: string) => body(await t.api.tasks.$post({ json: { title } }));
const addEntry = (json: TimeEntryCreate) => t.api.time.entries.$post({ json });

describe("timer", () => {
  it("runs one timer at a time and records minutes when it stops", async () => {
    expect(await body(await t.api.time.timer.$get())).toEqual({ timer: null });
    const task = await newTask("Write report");

    const first = await body(
      await t.api.time.timer.$post({
        json: { note: "Outline", subject: { type: "task", id: task.id } },
      }),
    );
    expect(first.stopped).toBeNull();
    expect(first.timer).toMatchObject({
      endedAt: null,
      minutes: null,
      note: "Outline",
      subject: { type: "task", id: task.id, label: "Write report" },
    });

    // Starting another timer stops the running one; even a quick one counts a minute.
    const second = await body(await t.api.time.timer.$post({ json: {} }));
    expect(second.stopped).toMatchObject({ id: first.timer.id, minutes: 1 });
    expect(second.stopped?.endedAt).not.toBeNull();
    expect((await body(await t.api.time.timer.$get())).timer?.id).toBe(second.timer.id);

    const stopped = await body(await t.api.time.timer.stop.$post());
    expect(stopped).toMatchObject({ id: second.timer.id, minutes: 1, subject: null });
    const again = await failure(await t.api.time.timer.stop.$post());
    expect(again).toEqual({ status: 404, error: "No timer is running. Start one first." });
  });

  it("lets a running timer be edited but not given an end", async () => {
    const { timer } = await body(await t.api.time.timer.$post({ json: {} }));
    const param = { id: String(timer.id) };
    const moved = await body(
      await t.api.time.entries[":id"].$patch({
        param,
        json: { startedAt: minutesAgo(30), note: "Started earlier" },
      }),
    );
    expect(moved).toMatchObject({ endedAt: null, note: "Started earlier" });
    const ended = await failure(
      await t.api.time.entries[":id"].$patch({ param, json: { endedAt: minutesAgo(0) } }),
    );
    expect(ended.error).toContain("Stop the timer first");
    const stopped = await body(await t.api.time.timer.stop.$post());
    expect(stopped.minutes).toBe(30);
  });
});

describe("time entries", () => {
  it("adds, lists, edits, and deletes entries", async () => {
    const task = await newTask("Study chapter 3");
    const created = await addEntry({
      startedAt: minutesAgo(120),
      endedAt: minutesAgo(75),
      note: "Reading",
      subject: { type: "task", id: task.id },
    });
    expect(created.status).toBe(201);
    const entry = await body(created);
    expect(entry).toMatchObject({ minutes: 45, note: "Reading" });
    await body(await addEntry({ startedAt: minutesAgo(60 * 30), endedAt: minutesAgo(60 * 29) }));

    // Filtered by when they started, newest first, and by subject.
    const recent = await body(
      await t.api.time.entries.$get({ query: { from: minutesAgo(60 * 24) } }),
    );
    expect(recent.map((item) => item.id)).toEqual([entry.id]);
    const all = await body(await t.api.time.entries.$get({ query: {} }));
    expect(all).toHaveLength(2);
    const forTask = await body(
      await t.api.time.entries.$get({ query: { type: "task", id: String(task.id) } }),
    );
    expect(forTask.map((item) => item.minutes)).toEqual([45]);

    const param = { id: String(entry.id) };
    const edited = await body(
      await t.api.time.entries[":id"].$patch({
        param,
        json: { endedAt: minutesAgo(60), note: "Reading and notes", subject: null },
      }),
    );
    expect(edited).toMatchObject({ minutes: 60, note: "Reading and notes", subject: null });

    expect((await t.api.time.entries[":id"].$delete({ param })).status).toBe(204);
    expect((await t.api.time.entries[":id"].$delete({ param })).status).toBe(404);
  });

  it("rejects entries that end first, are in the future, or run over a day", async () => {
    const backwards = await failure(
      await addEntry({ startedAt: minutesAgo(10), endedAt: minutesAgo(20) }),
    );
    expect(backwards).toEqual({
      status: 400,
      error: "The end time has to be after the start time.",
    });
    const future = await failure(
      await addEntry({ startedAt: minutesAgo(10), endedAt: minutesAgo(-30) }),
    );
    expect(future.error).toContain("can't be in the future");
    const long = await failure(
      await addEntry({ startedAt: minutesAgo(60 * 25), endedAt: minutesAgo(0) }),
    );
    expect(long.error).toContain("24 hours");
    const missing = await failure(
      await addEntry({
        startedAt: minutesAgo(20),
        endedAt: minutesAgo(10),
        subject: { type: "project", id: 999 },
      }),
    );
    expect(missing).toMatchObject({ status: 400, error: expect.stringContaining("project") });
    const badDate = await addEntry({ startedAt: "yesterday", endedAt: minutesAgo(10) });
    expect(badDate.status).toBe(400);
    const halfFilter = await t.api.time.entries.$get({ query: { type: "task" } });
    expect(halfFilter.status).toBe(400);
  });

  it("keeps logged time when its task is deleted", async () => {
    const task = await newTask("Old errand");
    await addEntry({
      startedAt: minutesAgo(40),
      endedAt: minutesAgo(10),
      subject: { type: "task", id: task.id },
    });
    await t.api.tasks[":id"].$delete({ param: { id: String(task.id) } });
    const [entry] = await body(await t.api.time.entries.$get({ query: {} }));
    expect(entry).toMatchObject({
      minutes: 30,
      subject: { type: "task", id: task.id, label: null },
    });
  });
});
