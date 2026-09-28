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

describe("timers", () => {
  it("run several at once, one per subject, and record minutes when they stop", async () => {
    expect(await body(await t.api.time.timers.$get())).toEqual({ timers: [] });
    expect(await body(await t.api.time.timer.$get())).toEqual({ timer: null });
    const task = await newTask("Write report");
    const subject = { type: "task" as const, id: task.id };

    const first = await body(await t.api.time.timer.$post({ json: { note: "Outline", subject } }));
    expect(first.stopped).toEqual([]);
    expect(first.timer).toMatchObject({
      endedAt: null,
      minutes: null,
      note: "Outline",
      subject: { type: "task", id: task.id, label: "Write report" },
    });

    // Another timer runs alongside it.
    const second = await body(await t.api.time.timer.$post({ json: { note: "Laundry" } }));
    expect(second.stopped).toEqual([]);
    const running = await body(await t.api.time.timers.$get());
    expect(running.timers.map((timer) => timer.id)).toEqual([first.timer.id, second.timer.id]);
    // The single-timer view shows the newest.
    expect((await body(await t.api.time.timer.$get())).timer?.id).toBe(second.timer.id);

    // Timing the same task again keeps its timer instead of starting a second one.
    const same = await body(await t.api.time.timer.$post({ json: { subject } }));
    expect(same.timer.id).toBe(first.timer.id);
    expect((await body(await t.api.time.timers.$get())).timers).toHaveLength(2);

    // Stopping one leaves the other running; even a quick one counts a minute.
    const stopped = await body(
      await t.api.time.entries[":id"].stop.$post({ param: { id: String(first.timer.id) } }),
    );
    expect(stopped).toMatchObject({ id: first.timer.id, minutes: 1 });
    expect(stopped.endedAt).not.toBeNull();
    expect(
      await failure(
        await t.api.time.entries[":id"].stop.$post({ param: { id: String(first.timer.id) } }),
      ),
    ).toEqual({ status: 409, error: "That timer has already stopped." });
    expect((await body(await t.api.time.timers.$get())).timers.map((timer) => timer.id)).toEqual([
      second.timer.id,
    ]);

    const all = await body(await t.api.time.timer.stop.$post());
    expect(all.stopped.map((timer) => timer.id)).toEqual([second.timer.id]);
    const again = await failure(await t.api.time.timer.stop.$post());
    expect(again).toEqual({ status: 404, error: "No timer is running. Start one first." });
  });

  it("can stop the others when starting, as when only one could run", async () => {
    const one = await body(await t.api.time.timer.$post({ json: { note: "One" } }));
    const two = await body(await t.api.time.timer.$post({ json: { note: "Two" } }));
    const three = await body(
      await t.api.time.timer.$post({ json: { note: "Three", stopOthers: true } }),
    );
    expect(three.stopped.map((timer) => timer.id)).toEqual([one.timer.id, two.timer.id]);
    expect((await body(await t.api.time.timers.$get())).timers.map((timer) => timer.id)).toEqual([
      three.timer.id,
    ]);
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
    const stopped = await body(await t.api.time.entries[":id"].stop.$post({ param }));
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
