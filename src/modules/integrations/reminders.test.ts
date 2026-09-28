import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { defaultReminders, type ReminderSettings } from "../../shared/reminders";
import { resetDeliveryStatus } from "./homeAssistant.service";
import {
  dueSoonReminder,
  localClock,
  previewReminders,
  recentReminders,
  resetReminderTries,
  runReminders,
} from "./reminders.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
  resetDeliveryStatus();
  resetReminderTries();
});
afterEach(() => {
  vi.restoreAllMocks();
  t.close();
});

const HOOK = "http://192.0.2.10:8123/api/webhook/hub-reminder-test";
const UTC = { timeZone: "UTC" };
const DAY = "2025-03-10";
const at = (time: string, date = DAY) => new Date(`${date}T${time}:00Z`);

const configure = async (reminders: Partial<ReminderSettings> = {}, reminderUrl = HOOK) =>
  body(
    await t.api.settings.$put({
      json: {
        homeAssistant: { summaryUrl: "", reminderUrl, summaryMinutes: 15 },
        reminders: { ...defaultReminders, ...reminders },
      },
    }),
  );
const task = async (title: string, extra: object = {}) =>
  body(await t.api.tasks.$post({ json: { title, ...extra } }));
const accept = () =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 200 }));
const sentBodies = (mock: ReturnType<typeof accept>) =>
  mock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

describe("localClock", () => {
  it("gives the date and minutes past midnight in the time zone", () => {
    expect(localClock(new Date("2025-03-10T02:30:00Z"), "America/New_York")).toEqual({
      date: "2025-03-09",
      // Daylight saving time started the day before.
      minutes: 22 * 60 + 30,
    });
  });
});

describe("the daily digest", () => {
  it("goes out once, in its window, with today's tasks and what's coming", async () => {
    await configure();
    await task("Pay the phone bill", { dueDate: "2025-03-08" });
    await task("Read chapter 4", { dueDate: DAY });
    await task("Book a dentist visit", { dueDate: "2025-03-12" });
    const fetchMock = accept();

    expect(await runReminders(t.db, UTC, at("07:00"))).toEqual([]);
    expect(await runReminders(t.db, UTC, at("07:31"))).toEqual([
      { kind: "digest", ok: true, detail: "Sent. Home Assistant answered 200." },
    ]);
    expect(sentBodies(fetchMock)[0]).toMatchObject({
      type: "hub_reminder",
      kind: "digest",
      title: "Today: 2 tasks, 1 overdue",
      message:
        "2 tasks for today, 1 overdue: Pay the phone bill, Read chapter 4. Coming up: Book a dentist visit (Wed, Mar 12).",
    });
    // Not again today.
    expect(await runReminders(t.db, UTC, at("08:00"))).toEqual([]);
    expect(recentReminders(t.db)).toEqual([
      expect.objectContaining({ kind: "digest", title: "Today: 2 tasks, 1 overdue" }),
    ]);
  });

  it("isn't sent hours late, on a quiet day, when off, or without an address", async () => {
    await task("Read chapter 4", { dueDate: DAY });
    const fetchMock = accept();
    await configure({}, "");
    expect(await runReminders(t.db, UTC, at("07:31"))).toEqual([]);
    await configure({ digest: { enabled: false, time: "07:30" } });
    expect(await runReminders(t.db, UTC, at("07:31"))).toEqual([]);
    await configure();
    // Past the three-hour window.
    expect(await runReminders(t.db, UTC, at("10:31"))).toEqual([]);
    // A quiet day, with nothing due or overdue: nothing sent.
    expect(await runReminders(t.db, UTC, at("07:31", "2025-03-01"))).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries again after a failure, but not every minute", async () => {
    await configure();
    await task("Read chapter 4", { dueDate: DAY });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect((await runReminders(t.db, UTC, at("07:30")))[0]?.ok).toBe(false);
    expect(await runReminders(t.db, UTC, at("07:40"))).toEqual([]);
    expect((await runReminders(t.db, UTC, at("07:46")))[0]?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("due soon", () => {
  it("names each thing coming due once, whatever it is", async () => {
    await configure({ digest: { enabled: false, time: "07:30" } });
    await task("Submit the report", { dueDate: DAY });
    await task("Renew the lease", { dueDate: "2025-03-11" });
    await task("Later", { dueDate: "2025-03-14" });
    const done = await task("Already done", { dueDate: DAY });
    await t.api.tasks[":id"].$patch({ param: { id: String(done.id) }, json: { status: "done" } });
    await t.api.business.leads.$post({
      json: { name: "Example Bakery", nextStep: "Send a quote", nextStepOn: "2025-03-11" },
    });
    const fetchMock = accept();

    expect(await runReminders(t.db, UTC, at("18:05"))).toEqual([
      expect.objectContaining({ kind: "due_soon", ok: true }),
    ]);
    expect(sentBodies(fetchMock)[0]).toMatchObject({
      kind: "due_soon",
      title: "3 things due soon",
      message:
        "Submit the report, today. Renew the lease, tomorrow. Send a quote: Example Bakery, tomorrow.",
    });

    // The next day, only what's newly due comes up.
    await task("Pick up the keys", { dueDate: "2025-03-12" });
    expect(dueSoonReminder(t.db, "2025-03-11", 1)?.reminder).toEqual({
      kind: "due_soon",
      title: "Due tomorrow: Pick up the keys",
      message: "Pick up the keys, tomorrow.",
    });
  });
});

describe("the streak reminder", () => {
  it("nudges only when there's a streak and today isn't done", async () => {
    await configure({ digest: { enabled: false, time: "07:30" } });
    const [term] = await body(
      await t.api.education.terms.$post({
        json: { name: "Term 1", startDate: "2025-01-01", endDate: "2025-06-30" },
      }),
    );
    const [withCourse] = await body(
      await t.api.education.courses.$post({
        json: { termId: term?.id ?? 0, code: "ABC101", title: "Networks" },
      }),
    );
    const courseId = withCourse?.courses[0]?.id ?? 0;
    await body(
      await t.api.time.entries.$post({
        json: {
          startedAt: "2025-03-09T10:00:00.000Z",
          endedAt: "2025-03-09T10:45:00.000Z",
          subject: { type: "course", id: courseId },
        },
      }),
    );
    const fetchMock = accept();
    expect(await runReminders(t.db, UTC, at("20:10"))).toEqual([
      expect.objectContaining({ kind: "streak", ok: true }),
    ]);
    expect(sentBodies(fetchMock)[0]).toMatchObject({
      kind: "streak",
      title: "Keep your 1-day study streak",
      message: "Study 30 more minutes today to keep it going.",
    });

    // Once today's minimum is met, there's nothing to say.
    await body(
      await t.api.time.entries.$post({
        json: {
          startedAt: "2025-03-11T09:00:00.000Z",
          endedAt: "2025-03-11T09:40:00.000Z",
          subject: { type: "course", id: courseId },
        },
      }),
    );
    const previews = previewReminders(t.db, UTC, at("20:10", "2025-03-11"));
    expect(previews.find((entry) => entry.kind === "streak")?.reminder).toBeNull();
  });
});

describe("reminder routes", () => {
  it("preview each reminder, and send one now", async () => {
    await task("Submit the report", { dueDate: new Date().toISOString().slice(0, 10) });
    const overview = await body(await t.api.integrations.reminders.$get());
    expect(overview.configured).toBe(false);
    expect(overview.previews.map((entry) => entry.kind)).toEqual(["digest", "due_soon", "streak"]);
    expect(overview.recent).toEqual([]);

    const send = (kind: "digest" | "due_soon" | "streak") =>
      t.api.integrations.reminders[":kind"].send.$post({ param: { kind } });
    expect(await failure(await send("digest"))).toMatchObject({ status: 400 });
    await configure();
    accept();
    expect((await send("due_soon")).status).toBe(200);
    // Counted as sent, so nothing is left to say.
    expect(await failure(await send("due_soon"))).toEqual({
      status: 400,
      error: "Due soon has nothing to say right now, so nothing was sent.",
    });
    expect(await failure(await send("streak"))).toMatchObject({ status: 400 });
    const after = await body(await t.api.integrations.reminders.$get());
    expect(after.recent.map((entry) => entry.kind)).toEqual(["due_soon"]);
  });
});
