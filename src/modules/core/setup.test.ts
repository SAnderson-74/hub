import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { defaultModules } from "../../shared/modules";
import { budgetMonth } from "../money/budget.service";
import { seedDemo } from "./demo.service";
import { isEmpty } from "./setup.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const status = async () => body(await t.api.setup.$get());
const finish = (json: { modules?: typeof defaultModules; timeZone?: string; demo?: boolean }) =>
  t.api.setup.$post({
    json: { modules: defaultModules, timeZone: "", demo: false, ...json },
  });

describe("first-run setup", () => {
  it("is needed on a new, empty install until it's done", async () => {
    expect(await status()).toEqual({ needed: true, serverTimeZone: "UTC", demo: false });
    const saved = await body(
      await finish({
        modules: { ...defaultModules, resale: false, taxes: false },
        timeZone: "America/Chicago",
      }),
    );
    expect(saved).toMatchObject({
      setupDone: true,
      timeZone: "America/Chicago",
      modules: { resale: false, taxes: false, money: true },
    });
    expect((await status()).needed).toBe(false);
    // The chosen time zone is in use right away.
    expect((await body(await t.api.system.$get())).timeZone).toBe("America/Chicago");
    await body(await t.api.settings.$put({ json: { timeZone: "" } }));
    expect((await body(await t.api.system.$get())).timeZone).toBe("UTC");
  });

  it("isn't needed once Hub has data, even if it was never done", async () => {
    await t.api.tasks.$post({ json: { title: "Already here" } });
    expect((await status()).needed).toBe(false);
    // Example data only goes into an empty install.
    expect(await failure(await finish({ demo: true }))).toMatchObject({ status: 409 });
  });

  it("refuses a time zone that doesn't exist", async () => {
    expect(await failure(await finish({ timeZone: "Mars/Olympus_Mons" }))).toMatchObject({
      status: 400,
    });
  });
});

describe("example data", () => {
  it("fills every module, and comes out again completely", async () => {
    await body(await finish({ demo: true }));
    expect((await status()).demo).toBe(true);
    expect(isEmpty(t.db)).toBe(false);

    const tasks = await body(await t.api.tasks.$get({ query: {} }));
    expect(tasks.map((task) => task.title)).toContain("Replace the smoke detector batteries");
    const goals = await body(await t.api.goals.$get());
    expect(goals.map((goal) => goal.title)).toEqual(
      expect.arrayContaining(["Emergency fund", "Run a 10K"]),
    );
    const [term] = await body(await t.api.education.terms.$get());
    expect(term?.courses.map((course) => course.code)).toEqual(["ABC101", "ABC102"]);
    const [book] = await body(await t.api.money.books.$get());
    expect(book?.name).toBe("Example book");

    expect(await body(await t.api.setup.demo.remove.$post())).toEqual({
      removed: expect.any(Number),
      kept: 0,
    });
    expect(isEmpty(t.db)).toBe(true);
    expect((await status()).demo).toBe(false);
  });

  it("has a budget and spending this month, even on the 1st", async () => {
    seedDemo(t.db, "tester", "2030-03-01", new Date("2030-03-01T20:00:00Z"));
    const [book] = await body(await t.api.money.books.$get());
    const march = budgetMonth(t.db, book?.id ?? 0, "2030-03");
    expect(march.totals).toMatchObject({ incomeCents: 420_000, spentBudgetedCents: 145_000 });
    expect(march.totals.budgetedCents).toBeGreaterThan(0);
    expect(march.history).toHaveLength(6);
    for (const month of march.history) expect(month.spentCents).toBeGreaterThan(0);
    const [term] = await body(await t.api.education.terms.$get());
    for (const course of term?.courses ?? []) expect(course.plannedStart).not.toBeNull();
  });

  it("keeps what was added to it since", async () => {
    await body(await finish({ demo: true }));
    const [book] = await body(await t.api.money.books.$get());
    const [account] = await body(
      await t.api.money.accounts.$get({ query: { bookId: String(book?.id) } }),
    );
    await body(
      await t.api.money.transactions.$post({
        json: { accountId: account?.id ?? 0, date: "2030-01-01", amountCents: -100, payee: "Mine" },
      }),
    );
    const result = await body(await t.api.setup.demo.remove.$post());
    expect(result.kept).toBe(2); // the account, and the book holding it
    const left = await body(
      await t.api.money.transactions.$get({ query: { bookId: String(book?.id) } }),
    );
    expect(left.transactions.map((row) => row.payee)).toEqual(["Mine"]);
  });
});
