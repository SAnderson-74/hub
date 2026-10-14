import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localDateParts } from "../../server/db/backup";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const quick = (text: string, projectId?: number) =>
  t.api.tasks.quick.$post({ json: projectId === undefined ? { text } : { text, projectId } });

describe("POST /api/tasks/quick", () => {
  it("reads the line into a task", async () => {
    const car = await body(await t.api.projects.$post({ json: { name: "Car" } }));
    const task = await body(
      await quick("Renew registration tomorrow !high #renewals @car every year"),
    );
    const today = localDateParts(new Date(), t.config.timeZone).date;
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(task).toMatchObject({
      title: "Renew registration",
      dueDate: tomorrow.toISOString().slice(0, 10),
      priority: 3,
      tags: [{ name: "renewals" }],
      projectId: car.id,
      recurrence: { frequency: "monthly", interval: 12 },
    });
  });

  it("uses the given project unless the text names one", async () => {
    const home = await body(await t.api.projects.$post({ json: { name: "Home" } }));
    expect((await body(await quick("Fix the gate", home.id))).projectId).toBe(home.id);
    expect((await body(await quick("Fix the gate"))).projectId).toBeNull();
  });

  it("needs words for the title", async () => {
    expect(await failure(await quick("tomorrow #home"))).toEqual({
      status: 400,
      error: "Add a few words for the title, not just a date or tags.",
    });
    expect((await failure(await quick("   "))).status).toBe(400);
  });
});
