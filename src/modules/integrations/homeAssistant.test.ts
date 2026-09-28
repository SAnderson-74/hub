import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDateParts } from "../../server/db/backup";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { addDays } from "../../shared/recurrence";
import { resetDeliveryStatus, summaryDue, summaryPayload } from "./homeAssistant.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
  resetDeliveryStatus();
});
afterEach(() => {
  vi.restoreAllMocks();
  t.close();
});

const today = () => localDateParts(new Date(), "UTC").date;
const task = async (title: string, extra: object = {}) =>
  body(await t.api.tasks.$post({ json: { title, ...extra } }));
const configure = (homeAssistant: {
  summaryUrl?: string;
  reminderUrl?: string;
  summaryMinutes?: 15 | 30 | 60;
}) =>
  t.api.settings.$put({
    json: {
      homeAssistant: { summaryUrl: "", reminderUrl: "", summaryMinutes: 15, ...homeAssistant },
    },
  });
const HOOK = "http://192.0.2.10:8123/api/webhook/hub-summary-test";
const REMINDER_HOOK = "http://192.0.2.10:8123/api/webhook/hub-reminder-test";

describe("the summary", () => {
  it("holds the streak, today's tasks, and dates in the next two weeks", async () => {
    const day = today();
    await task("Pay the phone bill", { dueDate: addDays(day, -2) });
    await task("Read chapter 4", { dueDate: day, priority: 2 });
    await task("Fix the fence", { status: "doing" });
    const finished = await task("Water plants", { dueDate: day });
    await t.api.tasks[":id"].$patch({
      param: { id: String(finished.id) },
      json: { status: "done" },
    });
    await task("Book a dentist visit", { dueDate: addDays(day, 3) });
    await task("Far away", { dueDate: addDays(day, 20) });
    const goal = await body(
      await t.api.goals.$post({ json: { title: "Emergency fund", targetDate: addDays(day, 10) } }),
    );
    await t.api.goals[":id"].milestones.$post({
      param: { id: String(goal.id) },
      json: { title: "First $500", targetDate: addDays(day, 5) },
    });
    const phase = await body(await t.api.business.phases.$post({ json: { name: "Set up" } }));
    await t.api.business.steps.$post({
      json: { phaseId: phase.id, title: "Register the name", dueOn: addDays(day, 1) },
    });
    await t.api.business.leads.$post({
      json: { name: "Example Bakery", nextStep: "Send a quote", nextStepOn: addDays(day, 2) },
    });
    await t.api.business.leads.$post({
      json: { name: "Closed one", status: "lost", nextStepOn: addDays(day, 2) },
    });

    const summary = summaryPayload(t.db, { timeZone: "UTC" });
    expect(summary).toMatchObject({
      type: "hub_summary",
      date: day,
      study_streak: { days: 0, state: "none", today_minutes: 0, minimum_minutes: 30 },
      tasks_today: {
        open: 3,
        overdue: 1,
        done: 1,
        summary: "3 tasks for today, 1 overdue, 1 done.",
        titles: ["Pay the phone bill", "Read chapter 4", "Fix the fence"],
      },
    });
    expect(summary.upcoming).toEqual([
      { date: addDays(day, 1), kind: "business_step", title: "Register the name" },
      { date: addDays(day, 2), kind: "lead", title: "Send a quote: Example Bakery" },
      { date: addDays(day, 3), kind: "task", title: "Book a dentist visit" },
      { date: addDays(day, 5), kind: "milestone", title: "First $500 (Emergency fund)" },
      { date: addDays(day, 10), kind: "goal", title: "Emergency fund" },
    ]);
    expect(summary.message).toBe(
      `3 tasks for today, 1 overdue, 1 done. Next: Register the name on ${addDays(day, 1)}.`,
    );

    // The API shows the same thing, for building Home Assistant templates.
    const shown = await body(await t.api.integrations["home-assistant"].summary.$get());
    expect(shown.tasks_today.open).toBe(3);
  });

  it("is short when there's nothing on", () => {
    expect(summaryPayload(t.db, { timeZone: "UTC" })).toMatchObject({
      message: "Nothing due today.",
      tasks_today: { open: 0, titles: [] },
      upcoming: [],
    });
  });
});

describe("sending", () => {
  it("posts the summary as JSON and remembers how it went", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    await configure({ summaryUrl: HOOK });

    const sent = await body(await t.api.integrations["home-assistant"].summary.send.$post());
    expect(sent).toMatchObject({ ok: true, detail: "Sent. Home Assistant answered 200." });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(HOOK);
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toMatchObject({ type: "hub_summary" });

    const status = await body(await t.api.integrations["home-assistant"].$get());
    expect(status).toMatchObject({
      summary: { configured: true, last: { ok: true } },
      reminder: { configured: false, last: null },
    });
  });

  it("says what went wrong", async () => {
    await configure({ summaryUrl: HOOK });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 404 }));
    const refused = await failure(await t.api.integrations["home-assistant"].summary.send.$post());
    expect(refused).toMatchObject({ status: 502 });
    expect(refused.error).toBe("Home Assistant answered 404. Check the webhook address.");

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    const unreachable = await failure(
      await t.api.integrations["home-assistant"].summary.send.$post(),
    );
    expect(unreachable.error).toContain("Couldn't reach Home Assistant");

    const status = await body(await t.api.integrations["home-assistant"].$get());
    expect(status.summary.last).toMatchObject({ ok: false });
  });

  it("needs an address first", async () => {
    const none = await failure(await t.api.integrations["home-assistant"].summary.send.$post());
    expect(none).toMatchObject({ status: 400 });
    expect(none.error).toContain("Add the summary webhook address");
    const noReminder = await failure(
      await t.api.integrations["home-assistant"].reminder.test.$post(),
    );
    expect(noReminder.error).toContain("Add the reminder webhook address");
  });

  it("sends a test reminder to the reminder address", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    await configure({ reminderUrl: REMINDER_HOOK });
    await body(await t.api.integrations["home-assistant"].reminder.test.$post());
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(REMINDER_HOOK);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      type: "hub_reminder",
      title: "Test reminder from Hub",
    });
  });
});

describe("the schedule", () => {
  it("sends when the interval has passed since the last summary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const now = new Date();
    expect(summaryDue(t.db, now)).toBe(false); // no address yet
    await configure({ summaryUrl: HOOK });
    expect(summaryDue(t.db, now)).toBe(true);

    await t.api.integrations["home-assistant"].summary.send.$post();
    const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
    expect(summaryDue(t.db, later(1))).toBe(false);
    expect(summaryDue(t.db, later(15))).toBe(true);
    await configure({ summaryUrl: HOOK, summaryMinutes: 60 });
    expect(summaryDue(t.db, later(15))).toBe(false);
    expect(summaryDue(t.db, later(60))).toBe(true);
  });
});

describe("settings", () => {
  it("accept webhook addresses and refuse anything else", async () => {
    expect((await configure({ summaryUrl: HOOK })).status).toBe(200);
    for (const bad of ["ftp://192.0.2.10/hook", "not a url", "http://"]) {
      const refused = await failure(await configure({ summaryUrl: bad }));
      expect(refused).toMatchObject({ status: 400 });
    }
    const saved = await body(await t.api.settings.$get());
    expect(saved.homeAssistant.summaryUrl).toBe(HOOK);
  });
});
