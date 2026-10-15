import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { searchAmountCents, searchWords } from "../../shared/search";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const find = async (q: string, limit?: number) =>
  body(
    await t.api.search.$get({ query: limit === undefined ? { q } : { q, limit: String(limit) } }),
  );
const kinds = (result: Awaited<ReturnType<typeof find>>) =>
  result.groups.map((group) => group.kind);
const titles = (result: Awaited<ReturnType<typeof find>>, kind: string) =>
  result.groups.find((group) => group.kind === kind)?.results.map((item) => item.title) ?? [];

describe("search words and amounts", () => {
  it("splits on spaces, ignores case, and drops repeats", () => {
    expect(searchWords("  Smoke  DETECTOR smoke ")).toEqual(["smoke", "detector"]);
  });

  it("reads amounts in or out, with or without a dollar sign", () => {
    expect(searchAmountCents("42.18")).toBe(4218);
    expect(searchAmountCents("$42.18")).toBe(4218);
    expect(searchAmountCents("-42.18")).toBe(4218);
    expect(searchAmountCents("1,250")).toBe(125_000);
    expect(searchAmountCents("lamp")).toBeNull();
    expect(searchAmountCents("0")).toBeNull();
  });
});

describe("GET /api/search", () => {
  it("finds matches in every module, grouped, each with where it opens", async () => {
    const project = await body(await t.api.projects.$post({ json: { name: "Home repairs" } }));
    const task = await body(
      await t.api.tasks.$post({
        json: { title: "Replace the smoke detector batteries", projectId: project.id },
      }),
    );
    await t.api.tasks.$post({ json: { title: "Call about the detector", dueDate: "2030-01-20" } });
    const goal = await body(await t.api.goals.$post({ json: { title: "Run a 10K" } }));
    await t.api.goals[":id"].milestones.$post({
      param: { id: String(goal.id) },
      json: { title: "Buy running shoes" },
    });
    const [term] = await body(
      await t.api.education.terms.$post({
        json: { name: "Term 1", startDate: "2030-01-01", endDate: "2030-06-30", creditGoal: 6 },
      }),
    );
    await body(
      await t.api.education.courses.$post({
        json: { termId: term?.id ?? 0, code: "ABC101", title: "Introduction to Networks" },
      }),
    );
    const item = await body(
      await t.api.resale.items.$post({
        json: { title: "Road bike", category: "Bikes", sku: "BIKE-01", spot: "Garage rack" },
      }),
    );
    const lead = await body(
      await t.api.business.leads.$post({ json: { name: "Example Bakery", notes: "Wants shoes" } }),
    );

    const detector = await find("detector");
    expect(kinds(detector)).toEqual(["task"]);
    // Neither title starts with it, so the one changed last comes first.
    expect(titles(detector, "task")).toEqual([
      "Call about the detector",
      "Replace the smoke detector batteries",
    ]);
    expect(detector.groups[0]?.results[1]).toEqual({
      id: task.id,
      title: "Replace the smoke detector batteries",
      detail: "Home repairs · To do",
      date: null,
      amountCents: null,
      href: `/tasks?task=${task.id}`,
    });
    // A title that starts with the search comes first.
    expect(titles(await find("replace detector"), "task")).toEqual([
      "Replace the smoke detector batteries",
    ]);
    expect(titles(await find("call"), "task")).toEqual(["Call about the detector"]);

    // Every word has to match, in any field; a milestone finds its goal.
    expect(kinds(await find("SMOKE batteries"))).toEqual(["task"]);
    expect(kinds(await find("smoke lamp"))).toEqual([]);
    const shoes = await find("shoes");
    expect(kinds(shoes)).toEqual(["goal", "lead"]);
    expect(shoes.groups[0]?.results[0]?.href).toBe(`/goals?goal=${goal.id}`);
    expect(shoes.groups[1]?.results[0]?.href).toBe(`/business?do=leads&lead=${lead.id}`);

    const course = await find("abc101");
    expect(course.groups[0]?.results[0]).toMatchObject({
      title: "ABC101 Introduction to Networks",
      detail: "Term 1 · Not started",
    });
    expect((await find("repairs")).groups.map((group) => group.kind)).toEqual(["project"]);
    expect((await find("bikes")).groups[0]?.results[0]).toMatchObject({
      title: "Road bike",
      href: `/resale?item=${item.id}`,
    });
    // A SKU typed from its label, or where it's kept.
    expect((await find("bike-01")).groups[0]?.results[0]).toMatchObject({
      title: "Road bike",
      detail: "Acquired · Bikes · BIKE-01",
    });
    expect(kinds(await find("garage rack"))).toEqual(["resale_item"]);
  });

  it("finds transactions by payee or amount, newest first", async () => {
    const book = await body(
      await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
    );
    const account = await body(
      await t.api.money.accounts.$post({
        json: { bookId: book.id, name: "Checking", kind: "checking", openingBalanceCents: 0 },
      }),
    );
    const add = async (date: string, amountCents: number, payee: string) =>
      body(
        await t.api.money.transactions.$post({
          json: { accountId: account.id, date, amountCents, payee },
        }),
      );
    const older = await add("2030-01-02", -4218, "Corner Market");
    const newer = await add("2030-01-09", -1250, "Corner Market");
    await add("2030-01-05", 4218, "Refund from Example Store");

    const market = await find("corner");
    expect(market.groups[0]?.results.map((row) => row.id)).toEqual([newer.id, older.id]);
    expect(market.groups[0]?.results[0]).toMatchObject({
      detail: "Checking · Uncategorized",
      date: "2030-01-09",
      amountCents: -1250,
      href: `/money?book=${book.id}&transaction=${newer.id}`,
    });
    // Money in or out.
    expect(titles(await find("$42.18"), "transaction")).toEqual([
      "Refund from Example Store",
      "Corner Market",
    ]);
    // Wildcards are searched for as typed.
    expect(kinds(await find("%"))).toEqual([]);
  });

  it("says when there are more than it sent", async () => {
    for (const n of [1, 2, 3]) await t.api.tasks.$post({ json: { title: `Lamp ${n}` } });
    const two = await find("lamp", 2);
    expect(two.groups[0]?.results).toHaveLength(2);
    expect(two.groups[0]?.more).toBe(true);
    expect((await find("lamp")).groups[0]?.more).toBe(false);
  });

  it("leaves out modules that are turned off", async () => {
    await t.api.tasks.$post({ json: { title: "Desk lamp" } });
    await t.api.resale.items.$post({ json: { title: "Desk lamp" } });
    expect(kinds(await find("lamp"))).toEqual(["task", "resale_item"]);
    await t.api.settings.$put({
      json: {
        modules: {
          tasks: true,
          time: true,
          goals: true,
          courses: true,
          resale: false,
          money: true,
          tithing: true,
          taxes: true,
          business: true,
        },
      },
    });
    expect(kinds(await find("lamp"))).toEqual(["task"]);
  });

  it("asks for something to search for", async () => {
    expect(await failure(await t.api.search.$get({ query: { q: "  " } }))).toMatchObject({
      status: 400,
      error: "That search isn't valid.",
    });
  });
});
