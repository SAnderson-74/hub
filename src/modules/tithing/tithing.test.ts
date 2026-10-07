import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const param = (id: number) => ({ param: { id: String(id) } });

async function setup() {
  const book = await body(
    await t.api.money.books.$post({
      json: { name: "Personal", kind: "personal", starterCategories: true },
    }),
  );
  const categories = await body(
    await t.api.money.categories.$get({ query: { bookId: String(book.id) } }),
  );
  const category = (name: string) => {
    const found = categories.find((entry) => entry.name === name);
    if (!found) throw new Error(`No ${name}`);
    return found.id;
  };
  const checking = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Checking", kind: "checking" },
    }),
  );
  const savings = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Savings", kind: "savings" },
    }),
  );
  return {
    book,
    checking,
    savings,
    paycheck: category("Paycheck"),
    groceries: category("Groceries"),
  };
}

const add = async (
  accountId: number,
  date: string,
  amountCents: number,
  extra: { payee?: string; categoryId?: number } = {},
) =>
  body(
    await t.api.money.transactions.$post({
      json: { accountId, date, amountCents, payee: extra.payee ?? "", ...extra },
    }),
  );

const overview = async (year?: number) =>
  body(
    await t.api.tithing.overview.$get({ query: year === undefined ? {} : { year: String(year) } }),
  );

const setIncome = (id: number, json: { applies: boolean; baseCents?: number | null }) =>
  t.api.tithing.income[":id"].$put({ ...param(id), json });

const pay = (
  accountId: number,
  amountCents: number,
  extra: {
    date?: string;
    links?: Array<{ incomeTransactionId: number; amountCents: number }>;
  } = {},
) =>
  t.api.tithing.payments.$post({
    json: { accountId, date: extra.date ?? "2030-02-01", amountCents, ...extra },
  });

describe("tithing on money in", () => {
  it("is a tenth of all money in, except transfers and refunds", async () => {
    const { checking, savings, paycheck, groceries } = await setup();
    const pay1 = await add(checking.id, "2030-01-15", 200_000, { categoryId: paycheck });
    const refund = await add(checking.id, "2030-01-16", 5_000, { categoryId: groceries });
    const loose = await add(checking.id, "2030-01-17", 1_234);
    const out = await add(checking.id, "2030-01-18", -9_000);
    await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          date: "2030-01-19",
          amountCents: 10_000,
        },
      }),
    );

    const page = await overview(2030);
    expect(page.income.map((row) => [row.id, row.applies, row.owedCents, row.status])).toEqual([
      [loose.id, true, 123, "unpaid"],
      [refund.id, false, 0, null],
      [pay1.id, true, 20_000, "unpaid"],
    ]);
    // Money out and transfers aren't income.
    expect(page.income.some((row) => row.id === out.id)).toBe(false);
    expect(page.summary.unpaidCents).toBe(20_123);
    expect(page.summary.incomeYearCents).toBe(206_234);
    expect(page.summary.exemptYearCents).toBe(5_000);
    expect(page.open.map((row) => row.id)).toEqual([pay1.id, loose.id]);
  });

  it("shows on each transaction as it's listed", async () => {
    const { book, checking } = await setup();
    const income = await add(checking.id, "2030-01-15", 50_000);
    const spent = await add(checking.id, "2030-01-16", -4_000);
    const listed = (
      await body(await t.api.money.transactions.$get({ query: { bookId: String(book.id) } }))
    ).transactions;
    const byId = new Map(listed.map((row) => [row.id, row.tithing]));
    expect(byId.get(income.id)).toMatchObject({
      kind: "income",
      applies: true,
      baseCents: 50_000,
      owedCents: 5_000,
      paidCents: 0,
      status: "unpaid",
    });
    expect(byId.get(spent.id)).toBeNull();
  });

  it("can be switched off, or figured on a different amount, and go back to the default", async () => {
    const { checking } = await setup();
    const sale = await add(checking.id, "2030-01-15", 100_000);

    expect((await setIncome(sale.id, { applies: false })).status).toBe(204);
    let row = (await overview(2030)).income[0];
    expect([row?.applies, row?.owedCents, row?.status]).toEqual([false, 0, null]);

    // Tithe on the $400 profit instead of the whole sale.
    await setIncome(sale.id, { applies: true, baseCents: 40_000 });
    row = (await overview(2030)).income[0];
    expect([row?.applies, row?.baseCents, row?.customBase, row?.owedCents]).toEqual([
      true,
      40_000,
      true,
      4_000,
    ]);

    // Choosing what Hub would do anyway forgets the choice.
    await setIncome(sale.id, { applies: true, baseCents: null });
    row = (await overview(2030)).income[0];
    expect([row?.baseCents, row?.customBase, row?.owedCents]).toEqual([100_000, false, 10_000]);
  });

  it("turns a refund on when asked", async () => {
    const { checking, groceries } = await setup();
    const refund = await add(checking.id, "2030-01-16", 5_000, { categoryId: groceries });
    await setIncome(refund.id, { applies: true });
    const row = (await overview(2030)).income[0];
    expect([row?.applies, row?.owedCents]).toEqual([true, 500]);
  });

  it("refuses money out and transfers", async () => {
    const { checking, savings } = await setup();
    const out = await add(checking.id, "2030-01-18", -9_000);
    expect(await failure(await setIncome(out.id, { applies: true }))).toMatchObject({
      status: 400,
      error: expect.stringContaining("money coming in"),
    });
    const transfer = await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          date: "2030-01-19",
          amountCents: 10_000,
        },
      }),
    );
    const into = [transfer.from, transfer.to].find((side) => side.amountCents > 0);
    expect(await failure(await setIncome(into?.id ?? 0, { applies: true }))).toMatchObject({
      status: 400,
      error: expect.stringContaining("transfer"),
    });
  });

  it("is figured on a sale's profit when linked to a resale item", async () => {
    const { checking } = await setup();
    const item = await body(
      await t.api.resale.items.$post({
        json: {
          title: "Desk lamp",
          purchasedOn: "2030-01-02",
          purchaseCents: 30_000,
          status: "sold",
          soldOn: "2030-01-15",
          saleCents: 100_000,
        },
      }),
    );
    await t.api.resale.items[":id"].costs.$post({
      ...param(item.id),
      json: { kind: "fees", amountCents: 10_000 },
    });
    const sale = await add(checking.id, "2030-01-15", 100_000, { payee: "Buyer" });
    await t.api.resale.items[":id"].transactions.$post({
      ...param(item.id),
      json: { transactionId: sale.id, role: "sale" },
    });

    const page = await overview(2030);
    const row = page.income[0];
    // $1,000 sale less $300 paid and $100 of fees: $600 profit, $60 tithing.
    expect([row?.source, row?.baseCents, row?.customBase, row?.owedCents]).toEqual([
      "Resale",
      60_000,
      false,
      6_000,
    ]);
  });
});

describe("tithing payments", () => {
  it("add a transaction, and linking them turns income from unpaid to paid", async () => {
    const { checking } = await setup();
    const first = await add(checking.id, "2030-01-15", 200_000);
    const second = await add(checking.id, "2030-01-31", 100_000);
    const created = await body(
      await pay(checking.id, 25_000, {
        links: [
          { incomeTransactionId: first.id, amountCents: 20_000 },
          { incomeTransactionId: second.id, amountCents: 5_000 },
        ],
      }),
    );

    const page = await overview(2030);
    const status = new Map(page.income.map((row) => [row.id, [row.status, row.paidCents]]));
    expect(status.get(first.id)).toEqual(["paid", 20_000]);
    expect(status.get(second.id)).toEqual(["partial", 5_000]);
    expect(page.summary).toMatchObject({
      unpaidCents: 5_000,
      unpaidCount: 1,
      owedYearCents: 30_000,
      paidYearCents: 25_000,
      unlinkedCents: 0,
      balanceCents: 5_000,
    });
    expect(page.payments).toMatchObject([
      { id: created.id, amountCents: 25_000, fund: "tithing", linkedCents: 25_000 },
    ]);

    // It's a money-out transaction in a Tithing and offerings category.
    const listed = (
      await body(
        await t.api.money.transactions.$get({ query: { bookId: String(page.income[0]?.book.id) } }),
      )
    ).transactions.find((row) => row.id === created.id);
    expect(listed).toMatchObject({
      amountCents: -25_000,
      category: { name: "Tithing and offerings", kind: "expense" },
      tithing: { kind: "payment", fund: "tithing", linkedCents: 25_000 },
    });
  });

  it("can be linked later, changed, and unmarked", async () => {
    const { checking } = await setup();
    const income = await add(checking.id, "2030-01-15", 100_000);
    const spent = await add(checking.id, "2030-02-01", -10_000, { payee: "Church" });

    const put = (json: object) =>
      t.api.tithing.payments[":id"].$put({ ...param(spent.id), json: json as never });
    expect((await put({ fund: "tithing" })).status).toBe(204);
    let page = await overview(2030);
    expect(page.summary.unlinkedCents).toBe(10_000);
    expect(page.unlinkedPayments.map((row) => row.id)).toEqual([spent.id]);

    await put({
      fund: "tithing",
      links: [{ incomeTransactionId: income.id, amountCents: 10_000 }],
    });
    page = await overview(2030);
    expect(page.income[0]?.status).toBe("paid");
    expect(page.summary.unlinkedCents).toBe(0);

    // Relinking replaces the old links.
    await put({ fund: "tithing", links: [] });
    page = await overview(2030);
    expect(page.income[0]?.status).toBe("unpaid");

    await put({ fund: "tithing", links: [{ incomeTransactionId: income.id, amountCents: 4_000 }] });
    expect((await overview(2030)).income[0]?.status).toBe("partial");

    // Unmarking leaves the transaction and frees the income.
    expect((await t.api.tithing.payments[":id"].$delete(param(spent.id))).status).toBe(204);
    page = await overview(2030);
    expect(page.payments).toEqual([]);
    expect(page.income[0]?.status).toBe("unpaid");
    const kept = (
      await body(
        await t.api.money.transactions.$get({ query: { bookId: String(page.income[0]?.book.id) } }),
      )
    ).transactions.find((row) => row.id === spent.id);
    expect(kept?.tithing).toBeNull();
  });

  it("only link what's owed", async () => {
    const { checking, groceries } = await setup();
    const income = await add(checking.id, "2030-01-15", 100_000);
    const refund = await add(checking.id, "2030-01-16", 5_000, { categoryId: groceries });
    const spent = await add(checking.id, "2030-02-01", -50_000);
    const link = (incomeTransactionId: number, amountCents: number, more: object[] = []) =>
      t.api.tithing.payments[":id"].$put({
        ...param(spent.id),
        json: {
          fund: "tithing",
          links: [{ incomeTransactionId, amountCents }, ...more] as never,
        },
      });

    expect(await failure(await link(income.id, 10_001))).toMatchObject({
      status: 400,
      error: expect.stringContaining("more than that income still owes"),
    });
    expect(await failure(await link(refund.id, 100))).toMatchObject({
      status: 400,
      error: expect.stringContaining("doesn't apply"),
    });
    expect(
      await failure(
        await link(income.id, 6_000, [{ incomeTransactionId: income.id, amountCents: 1 }]),
      ),
    ).toMatchObject({ status: 400, error: expect.stringContaining("linked once") });
    // More than the payment itself.
    const small = await add(checking.id, "2030-02-02", -1_000);
    expect(
      await failure(
        await t.api.tithing.payments[":id"].$put({
          ...param(small.id),
          json: {
            fund: "tithing",
            links: [{ incomeTransactionId: income.id, amountCents: 2_000 }],
          },
        }),
      ),
    ).toMatchObject({ status: 400, error: expect.stringContaining("more than the payment") });
    // Other funds aren't linked to income.
    expect(
      await failure(
        await t.api.tithing.payments[":id"].$put({
          ...param(small.id),
          json: {
            fund: "fast_offering",
            links: [{ incomeTransactionId: income.id, amountCents: 500 }],
          },
        }),
      ),
    ).toMatchObject({ status: 400, error: expect.stringContaining("Only tithing") });

    // Another payment can't take what the first one already covers.
    await link(income.id, 8_000);
    const other = await add(checking.id, "2030-02-03", -5_000);
    expect(
      await failure(
        await t.api.tithing.payments[":id"].$put({
          ...param(other.id),
          json: {
            fund: "tithing",
            links: [{ incomeTransactionId: income.id, amountCents: 3_000 }],
          },
        }),
      ),
    ).toMatchObject({ status: 400, error: expect.stringContaining("still owes") });
  });

  it("turning tithing off for income frees the payments linked to it", async () => {
    const { checking } = await setup();
    const income = await add(checking.id, "2030-01-15", 100_000);
    await pay(checking.id, 10_000, {
      links: [{ incomeTransactionId: income.id, amountCents: 10_000 }],
    });
    await setIncome(income.id, { applies: false });
    const page = await overview(2030);
    expect(page.summary.unlinkedCents).toBe(10_000);
    expect(page.income[0]?.status).toBeNull();
  });

  it("go when their transaction does", async () => {
    const { checking } = await setup();
    const income = await add(checking.id, "2030-01-15", 100_000);
    const created = await body(
      await pay(checking.id, 10_000, {
        links: [{ incomeTransactionId: income.id, amountCents: 10_000 }],
      }),
    );
    await t.api.money.transactions[":id"].$delete(param(created.id));
    const page = await overview(2030);
    expect(page.payments).toEqual([]);
    expect(page.income[0]?.status).toBe("unpaid");

    // And so does a choice about income that's deleted.
    await setIncome(income.id, { applies: false });
    await t.api.money.transactions[":id"].$delete(param(income.id));
    expect((await overview(2030)).income).toEqual([]);
  });

  it("keep other funds apart from what's owed", async () => {
    const { checking } = await setup();
    await add(checking.id, "2030-01-15", 100_000);
    await body(
      await t.api.tithing.payments.$post({
        json: {
          accountId: checking.id,
          date: "2030-01-20",
          amountCents: 2_500,
          fund: "fast_offering",
        },
      }),
    );
    await body(
      await t.api.tithing.payments.$post({
        json: { accountId: checking.id, date: "2030-01-21", amountCents: 1_000, fund: "other" },
      }),
    );
    const { summary } = await overview(2030);
    expect(summary).toMatchObject({
      paidYearCents: 0,
      fastOfferingYearCents: 2_500,
      otherYearCents: 1_000,
      unpaidCents: 10_000,
      balanceCents: 10_000,
    });
  });
});

describe("the year's picture", () => {
  it("has months with a running balance, sources, and years", async () => {
    const { checking, paycheck } = await setup();
    await add(checking.id, "2029-12-15", 100_000, { categoryId: paycheck });
    await add(checking.id, "2030-01-15", 200_000, { categoryId: paycheck });
    await add(checking.id, "2030-03-01", 50_000);
    await pay(checking.id, 15_000, { date: "2030-02-10" });

    const page = await overview(2030);
    expect(page.years).toEqual([2030, 2029]);
    // The balance carries December's $100 owed into the year.
    expect(
      page.months.map((row) => [
        row.month.slice(5),
        row.owedCents,
        row.paidCents,
        row.balanceCents,
      ]),
    ).toEqual([
      ["01", 20_000, 0, 30_000],
      ["02", 0, 15_000, 15_000],
      ["03", 5_000, 0, 20_000],
      ["04", 0, 0, 20_000],
      ["05", 0, 0, 20_000],
      ["06", 0, 0, 20_000],
      ["07", 0, 0, 20_000],
      ["08", 0, 0, 20_000],
      ["09", 0, 0, 20_000],
      ["10", 0, 0, 20_000],
      ["11", 0, 0, 20_000],
      ["12", 0, 0, 20_000],
    ]);
    expect(page.sources).toEqual([
      { source: "Paycheck", incomeCents: 200_000, tithableCents: 200_000 },
      { source: "Other income", incomeCents: 50_000, tithableCents: 50_000 },
    ]);
    // Income from earlier years that's unpaid stays in the open list.
    expect(page.open).toHaveLength(3);
    expect(page.summary.unpaidCents).toBe(35_000);
  });

  it("finds bank lines that look like donations", async () => {
    const { checking } = await setup();
    const line = await add(checking.id, "2030-02-01", -20_000, { payee: "Church of Jesus Christ" });
    await add(checking.id, "2030-02-02", -500, { payee: "Goldfish store" });
    const page = await overview(2030);
    expect(page.suggestions.map((row) => [row.id, row.amountCents])).toEqual([[line.id, 20_000]]);
    await t.api.tithing.payments[":id"].$put({ ...param(line.id), json: { fund: "tithing" } });
    expect((await overview(2030)).suggestions).toEqual([]);
  });
});

describe("pasted tithing", () => {
  const document = (extra: object) => ({
    format: "hub-tithing/v1" as const,
    payments: [],
    income: [],
    ...extra,
  });
  const run = async (doc: object, accountId: number, dryRun: boolean, more: object = {}) =>
    t.api.tithing.imports.$post({
      query: { dryRun: dryRun ? "true" : "false" },
      json: { document: doc, accountId, ...more } as never,
    });

  it("marks the bank line a donation matches, and adds one when there is none", async () => {
    const { checking } = await setup();
    const bankLine = await add(checking.id, "2030-02-03", -25_000, { payee: "Online donation" });
    const doc = document({
      payments: [
        { date: "2030-02-01", amount: 250, fund: "Tithing" },
        { date: "2030-02-10", amount: 40, fund: "Fast offering" },
      ],
    });

    const preview = await body(await run(doc, checking.id, true));
    expect(preview.payments.map((row) => [row.outcome, row.match?.id ?? null])).toEqual([
      ["mark", bankLine.id],
      ["create", null],
    ]);
    expect(await overview(2030)).toMatchObject({ payments: [] }); // a preview changes nothing

    const done = await body(await run(doc, checking.id, false));
    expect([done.marked, done.created]).toEqual([1, 1]);
    const page = await overview(2030);
    expect(page.payments.map((row) => [row.amountCents, row.fund]).sort()).toEqual([
      [25_000, "tithing"],
      [4_000, "fast_offering"],
    ]);

    // Pasting it again finds both already there.
    const again = await body(await run(doc, checking.id, false));
    expect(again.payments.map((row) => row.outcome)).toEqual(["duplicate", "duplicate"]);
    expect([again.created, again.marked]).toEqual([0, 0]);
  });

  it("keeps two identical gifts apart", async () => {
    const { checking } = await setup();
    const doc = document({
      payments: [
        { date: "2030-02-01", amount: 100 },
        { date: "2030-02-01", amount: 100 },
      ],
    });
    expect((await body(await run(doc, checking.id, false))).created).toBe(2);
    expect((await overview(2030)).payments).toHaveLength(2);
    expect((await body(await run(doc, checking.id, false))).created).toBe(0);
  });

  it("sets the tithing base from a paycheck's gross pay or tithing amount", async () => {
    const { checking } = await setup();
    const first = await add(checking.id, "2030-02-15", 200_000);
    const second = await add(checking.id, "2030-03-01", 150_000);
    const doc = document({
      income: [
        { date: "2030-02-15", source: "Example Employer", deposit: 2000, gross: 2600 },
        { date: "2030-03-01", source: "Example Employer", deposit: 1500, tithing: 200 },
        { date: "2030-04-01", source: "Example Employer", deposit: 1500, gross: 2000 },
      ],
    });
    const preview = await body(await run(doc, checking.id, true));
    expect(preview.income.map((row) => [row.outcome, row.baseCents])).toEqual([
      ["set", 260_000],
      ["set", 200_000],
      ["unmatched", 200_000],
    ]);

    await run(doc, checking.id, false);
    const rows = new Map((await overview(2030)).income.map((row) => [row.id, row]));
    expect([rows.get(first.id)?.baseCents, rows.get(first.id)?.owedCents]).toEqual([
      260_000, 26_000,
    ]);
    expect([rows.get(second.id)?.baseCents, rows.get(second.id)?.owedCents]).toEqual([
      200_000, 20_000,
    ]);
    // Again: nothing left to change.
    const again = await body(await run(doc, checking.id, true));
    expect(again.income.map((row) => row.outcome)).toEqual(["unchanged", "unchanged", "unmatched"]);
  });

  it("leaves out rows it can't read or that were skipped", async () => {
    const { checking } = await setup();
    const doc = document({
      payments: [
        { date: "someday", amount: 50 },
        { date: "2030-02-01", amount: 30 },
      ],
      income: [{ date: "2030-02-15", deposit: 1000 }],
    });
    const result = await body(await run(doc, checking.id, true, { skipPayments: [1] }));
    expect(result.payments.map((row) => row.outcome)).toEqual(["problem", "skipped"]);
    expect(result.income.map((row) => row.outcome)).toEqual(["problem"]);
    expect(result.payments[0]?.problems[0]).toContain("isn't a date");
    expect(result.income[0]?.problems[0]).toContain("neither gross pay");
  });

  it("refuses documents that aren't in the format, or an account that isn't there", async () => {
    const { checking } = await setup();
    expect(
      (await failure(await run({ format: "hub-receipt/v1", receipts: [] }, checking.id, true)))
        .status,
    ).toBe(400);
    expect((await failure(await run(document({}), checking.id, true))).status).toBe(400);
    expect(
      await failure(
        await run(document({ payments: [{ date: "2030-02-01", amount: 5 }] }), 999, true),
      ),
    ).toMatchObject({ status: 400 });
  });
});

describe("saving tithing with a transaction", () => {
  it("takes the choice with a new transaction, and with a change to it", async () => {
    const { checking } = await setup();
    const created = await body(
      await t.api.money.transactions.$post({
        json: {
          accountId: checking.id,
          date: "2030-01-15",
          amountCents: 100_000,
          payee: "Buyer",
          tithing: { applies: true, baseCents: 40_000 },
        },
      }),
    );
    expect(created.tithing).toMatchObject({ kind: "income", baseCents: 40_000, owedCents: 4_000 });

    const updated = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(created.id),
        json: { amountCents: 120_000, tithing: { applies: false, baseCents: null } },
      }),
    );
    expect(updated.tithing).toMatchObject({ kind: "income", applies: false, owedCents: 0 });
    expect(updated.amountCents).toBe(120_000);
  });

  it("takes a donation's fund, and keeps its links while it's still tithing", async () => {
    const { checking } = await setup();
    const income = await add(checking.id, "2030-01-15", 100_000);
    const spent = await body(
      await t.api.money.transactions.$post({
        json: {
          accountId: checking.id,
          date: "2030-02-01",
          amountCents: -10_000,
          donation: "tithing",
        },
      }),
    );
    expect(spent.tithing).toMatchObject({ kind: "payment", fund: "tithing", linkedCents: 0 });
    await t.api.tithing.payments[":id"].$put({
      ...param(spent.id),
      json: { fund: "tithing", links: [{ incomeTransactionId: income.id, amountCents: 10_000 }] },
    });

    const patch = async (json: object) =>
      body(
        await t.api.money.transactions[":id"].$patch({ ...param(spent.id), json: json as never }),
      );
    // Re-saving the same fund changes nothing about its links.
    expect((await patch({ donation: "tithing" })).tithing).toMatchObject({ linkedCents: 10_000 });
    // Another fund isn't linked to income.
    expect((await patch({ donation: "fast_offering" })).tithing).toMatchObject({
      fund: "fast_offering",
      linkedCents: 0,
    });
    expect((await overview(2030)).income[0]?.status).toBe("unpaid");
    expect((await patch({ donation: null })).tithing).toBeNull();
  });

  it("refuses the wrong kind of transaction, and changes nothing", async () => {
    const { checking } = await setup();
    const response = await t.api.money.transactions.$post({
      json: {
        accountId: checking.id,
        date: "2030-01-15",
        amountCents: -5_000,
        tithing: { applies: true, baseCents: null },
      },
    });
    expect((await failure(response)).status).toBe(400);
    // The whole save rolled back: no half-added transaction.
    expect(
      (await body(await t.api.money.transactions.$get({ query: { bookId: "1" } }))).total,
    ).toBe(0);
  });
});
