import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const param = (id: number) => ({ param: { id: String(id) } });
const overview = async () => body(await t.api.business.$get());
const phase = async (name: string) => body(await t.api.business.phases.$post({ json: { name } }));
const step = async (phaseId: number, title: string, extra: object = {}) =>
  body(await t.api.business.steps.$post({ json: { phaseId, title, ...extra } }));

describe("plan", () => {
  it("starts with three phases, once", async () => {
    const phases = await body(await t.api.business.phases.starter.$post());
    expect(phases.map((row) => row.name)).toEqual(["Research", "Set up", "Launch"]);
    const again = await failure(await t.api.business.phases.starter.$post());
    expect(again).toMatchObject({ status: 409 });
    const duplicate = await failure(
      await t.api.business.phases.$post({ json: { name: "launch" } }),
    );
    expect(duplicate.error).toContain('already a phase called "launch"');
  });

  it("keeps steps in order, moves them, and tracks cost", async () => {
    const research = await phase("Research");
    const setUp = await phase("Set up");
    const license = await step(research.id, "Look up license rules", { estimateCents: 0 });
    const insurance = await step(research.id, "Get insurance quotes", {
      estimateCents: 60_000,
      dueOn: "2030-02-01",
    });
    await step(research.id, "Price the competition");

    await t.api.business.steps[":id"].move.$post({
      ...param(insurance.id),
      json: { to: "earlier" },
    });
    // Already first: nothing changes.
    await t.api.business.steps[":id"].move.$post({
      ...param(insurance.id),
      json: { to: "earlier" },
    });
    let plan = await overview();
    expect(plan.phases[0]?.steps.map((row) => row.title)).toEqual([
      "Get insurance quotes",
      "Look up license rules",
      "Price the competition",
    ]);

    const updated = await body(
      await t.api.business.steps[":id"].$patch({
        ...param(insurance.id),
        json: { done: true, spentCents: 55_000 },
      }),
    );
    expect(updated).toMatchObject({ done: true, spentCents: 55_000, estimateCents: 60_000 });

    // Moving to another phase puts it at the end there.
    await step(setUp.id, "Open a business bank account");
    await t.api.business.steps[":id"].$patch({ ...param(license.id), json: { phaseId: setUp.id } });
    plan = await overview();
    expect(plan.phases.map((row) => row.steps.map((item) => item.title))).toEqual([
      ["Get insurance quotes", "Price the competition"],
      ["Open a business bank account", "Look up license rules"],
    ]);

    // Deleting a phase takes its steps with it.
    expect((await t.api.business.phases[":id"].$delete(param(research.id))).status).toBe(204);
    plan = await overview();
    expect(plan.phases.map((row) => row.name)).toEqual(["Set up"]);
    expect(
      (await t.api.business.steps[":id"].$patch({ ...param(insurance.id), json: { done: false } }))
        .status,
    ).toBe(404);
  });

  it("refuses steps for a missing phase and empty titles", async () => {
    expect(
      (await failure(await t.api.business.steps.$post({ json: { phaseId: 99, title: "X" } })))
        .status,
    ).toBe(400);
    const research = await phase("Research");
    const empty = await failure(
      await t.api.business.steps.$post({ json: { phaseId: research.id, title: "  " } }),
    );
    expect(empty).toMatchObject({ status: 400 });
  });
});

describe("gear, skills, leads, and notes", () => {
  it("sort each list the way the page shows it", async () => {
    await t.api.business.gear.$post({ json: { name: "Tripod", status: "have", costCents: 8_000 } });
    await t.api.business.gear.$post({ json: { name: "Camera", costCents: 90_000 } });
    await t.api.business.gear.$post({ json: { name: "Backup drive", status: "ordered" } });

    await t.api.business.skills.$post({ json: { name: "Networking basics", status: "learning" } });
    await t.api.business.skills.$post({
      json: {
        name: "First aid",
        kind: "certification",
        status: "have",
        earnedOn: "2029-05-01",
        expiresOn: "2031-05-01",
      },
    });

    await t.api.business.leads.$post({ json: { name: "John Smith", status: "won" } });
    await t.api.business.leads.$post({
      json: { name: "Example Bakery", nextStep: "Send a quote", nextStepOn: "2030-03-10" },
    });
    await t.api.business.leads.$post({
      json: { name: "Example Garage", nextStepOn: "2030-03-02", valueCents: 150_000 },
    });

    const first = await body(
      await t.api.business.notes.$post({ json: { title: "Names to consider" } }),
    );
    await t.api.business.notes.$post({ json: { title: "Pricing ideas", body: "Start simple." } });
    await t.api.business.notes[":id"].$patch({ ...param(first.id), json: { pinned: true } });

    const all = await overview();
    expect(all.gear.map((row) => [row.name, row.status])).toEqual([
      ["Camera", "need"],
      ["Backup drive", "ordered"],
      ["Tripod", "have"],
    ]);
    expect(all.skills.map((row) => [row.name, row.kind])).toEqual([
      ["First aid", "certification"],
      ["Networking basics", "skill"],
    ]);
    expect(all.leads.map((row) => row.name)).toEqual([
      "Example Garage",
      "Example Bakery",
      "John Smith",
    ]);
    expect(all.notes.map((row) => [row.title, row.pinned])).toEqual([
      ["Names to consider", true],
      ["Pricing ideas", false],
    ]);
  });

  it("check dates and missing records, and delete", async () => {
    const backwards = await failure(
      await t.api.business.skills.$post({
        json: { name: "First aid", earnedOn: "2030-05-01", expiresOn: "2029-05-01" },
      }),
    );
    expect(backwards).toMatchObject({ status: 400 });
    expect(backwards.error).toContain("expiry date is before");

    const skill = await body(
      await t.api.business.skills.$post({ json: { name: "First aid", earnedOn: "2030-05-01" } }),
    );
    const early = await failure(
      await t.api.business.skills[":id"].$patch({
        ...param(skill.id),
        json: { expiresOn: "2030-01-01" },
      }),
    );
    expect(early).toMatchObject({ status: 400 });

    for (const res of [
      await t.api.business.gear[":id"].$patch({ ...param(99), json: { name: "X" } }),
      await t.api.business.leads[":id"].$delete(param(99)),
      await t.api.business.notes[":id"].$delete(param(99)),
      await t.api.business.skills[":id"].$delete(param(99)),
    ]) {
      expect(res.status).toBe(404);
    }

    expect((await t.api.business.skills[":id"].$delete(param(skill.id))).status).toBe(204);
    expect((await overview()).skills).toEqual([]);
  });
});

describe("rate settings", () => {
  it("save the calculator's inputs and check them", async () => {
    const rate = {
      incomeCents: 6_000_000,
      overheadCents: 400_000,
      taxPercent: 25,
      hoursPerWeek: 20,
      weeksPerYear: 48,
    };
    const saved = await body(await t.api.settings.$put({ json: { businessRate: rate } }));
    expect(saved.businessRate).toEqual(rate);
    const bad = await failure(
      await t.api.settings.$put({ json: { businessRate: { ...rate, weeksPerYear: 60 } } }),
    );
    expect(bad).toMatchObject({ status: 400 });
  });
});
