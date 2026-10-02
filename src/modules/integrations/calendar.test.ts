import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { buildCalendar, escapeText, foldLine } from "./calendar.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const status = async () => body(await t.api.integrations.calendar.$get());
const feed = (path: string) => t.app.request(path);
const today = () => new Date().toISOString().slice(0, 10);

describe("ICS text", () => {
  it("escapes special characters", () => {
    expect(escapeText("Call; then, email\\fax\nlater")).toBe(
      String.raw`Call\; then\, email\\fax\nlater`,
    );
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldLine(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const [index, part] of folded.entries()) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
      if (index > 0) expect(part.startsWith(" ")).toBe(true);
    }
    expect(folded.map((part, index) => (index > 0 ? part.slice(1) : part)).join("")).toBe(line);
    expect(foldLine("SHORT:line")).toBe("SHORT:line");
  });

  it("makes an all-day event per item, with a stable id", () => {
    const text = buildCalendar(
      [{ key: "task:12", kind: "task", title: "Renew the lease, again", date: "2030-03-31" }],
      { now: new Date("2030-03-01T12:00:00Z"), timeZone: "UTC" },
    );
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.split("\r\n")).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "UID:task:12@hub",
        "DTSTAMP:20300301T120000Z",
        "DTSTART;VALUE=DATE:20300331",
        "DTEND;VALUE=DATE:20300401",
        "SUMMARY:Renew the lease\\, again",
        "CATEGORIES:Task",
        "END:VCALENDAR",
      ]),
    );
  });
});

describe("the calendar feed", () => {
  it("is off until turned on, and a new address replaces the old one", async () => {
    expect(await status()).toEqual({ enabled: false, path: null });
    expect(
      await failure(await feed("/api/integrations/calendar/feed/abcdefghijklmnop.ics")),
    ).toMatchObject({
      status: 404,
    });

    const on = await body(await t.api.integrations.calendar.$post());
    expect(on.enabled).toBe(true);
    expect(on.path).toMatch(/^\/api\/integrations\/calendar\/feed\/[A-Za-z0-9_-]{32}\.ics$/);
    // Not part of the settings the browser reads or writes.
    expect(JSON.stringify(await body(await t.api.settings.$get()))).not.toContain(
      on.path?.split("/").at(-1)?.replace(".ics", "") ?? "missing",
    );

    await t.api.tasks.$post({ json: { title: "Pay rent", dueDate: today() } });
    const res = await feed(on.path ?? "");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    const text = await res.text();
    expect(text).toContain("SUMMARY:Pay rent");
    expect(text).toContain(`DTSTART;VALUE=DATE:${today().replace(/-/g, "")}`);

    const renewed = await body(await t.api.integrations.calendar.$post());
    expect(renewed.path).not.toBe(on.path);
    expect((await feed(on.path ?? "")).status).toBe(404);
    expect((await feed(renewed.path ?? "")).status).toBe(200);

    expect(await body(await t.api.integrations.calendar.$delete())).toEqual({
      enabled: false,
      path: null,
    });
    expect((await feed(renewed.path ?? "")).status).toBe(404);
  });

  it("leaves out finished things and anything far away", async () => {
    const on = await body(await t.api.integrations.calendar.$post());
    const done = await body(
      await t.api.tasks.$post({ json: { title: "Finished", dueDate: today() } }),
    );
    await t.api.tasks[":id"].$patch({ param: { id: String(done.id) }, json: { status: "done" } });
    await t.api.tasks.$post({ json: { title: "Long ago", dueDate: "2001-01-01" } });
    const text = await (await feed(on.path ?? "")).text();
    expect(text).not.toContain("Finished");
    expect(text).not.toContain("Long ago");
  });
});
