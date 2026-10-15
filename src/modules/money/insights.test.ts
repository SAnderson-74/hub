import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, type TestApp } from "../../server/testing";
import { changeText, median, wellAbove } from "../../shared/insights";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

async function setUp() {
  const book = await body(
    await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
  );
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
  const category = async (name: string, kind: "expense" | "income" = "expense") =>
    body(await t.api.money.categories.$post({ json: { bookId: book.id, name, kind } }));
  const dining = await category("Dining out");
  const groceries = await category("Groceries");
  const paycheck = await category("Paycheck", "income");
  const add = async (date: string, amountCents: number, payee: string, categoryId: number | null) =>
    body(
      await t.api.money.transactions.$post({
        json: { accountId: checking.id, date, amountCents, payee, categoryId },
      }),
    );
  return { book, checking, savings, dining, groceries, paycheck, add };
}

describe("insight helpers", () => {
  it("find the usual, and what's well above it", () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(wellAbove(30_000, 18_000, 6)).toBe(true);
    expect(wellAbove(30_000, 18_000, 2)).toBe(false); // too little history
    expect(wellAbove(6_000, 3_000, 6)).toBe(false); // double, but only $30 more
    expect(changeText(11_200, 10_000)).toBe("12% more");
    expect(changeText(9_200, 10_000)).toBe("8% less");
    expect(changeText(100, 0)).toBeNull();
  });
});

describe("spending insights", () => {
  it("compare a month with last month, last year, and the usual, by category and store", async () => {
    const { book, checking, savings, dining, groceries, paycheck, add } = await setUp();
    // Dining runs about $180 a month, then $320 in June.
    for (const month of ["2029-12", "2030-01", "2030-02", "2030-03", "2030-04", "2030-05"]) {
      await add(`${month}-10`, -18_000, "Pizza Place", dining.id);
    }
    await add("2030-06-03", -20_000, "Pizza Place", dining.id);
    await add("2030-06-12", -12_000, "Noodle Bar", dining.id);
    await add("2029-06-14", -9_000, "Pizza Place", dining.id);
    // Groceries with a refund, a paycheck, uncategorized spending, and a transfer.
    await add("2030-06-05", -15_000, "Corner Grocery", groceries.id);
    await add("2030-06-06", 2_000, "Corner Grocery", groceries.id);
    await add("2030-06-01", 400_000, "Example Employer", paycheck.id);
    await add("2030-06-20", -3_000, "Corner Gas", null);
    await t.api.money.transfers.$post({
      json: {
        fromAccountId: checking.id,
        toAccountId: savings.id,
        date: "2030-06-25",
        amountCents: 50_000,
      },
    });

    const june = await body(
      await t.api.money.insights.$get({ query: { bookId: String(book.id), month: "2030-06" } }),
    );
    expect(june.categories).toEqual([
      {
        id: dining.id,
        name: "Dining out",
        thisCents: 32_000,
        lastMonthCents: 18_000,
        lastYearCents: 9_000,
        usualCents: 18_000,
      },
      {
        id: groceries.id,
        name: "Groceries",
        thisCents: 13_000,
        lastMonthCents: 0,
        lastYearCents: 0,
        usualCents: 0,
      },
    ]);
    expect(june.alerts).toEqual([
      { id: dining.id, name: "Dining out", spentCents: 32_000, usualCents: 18_000 },
    ]);
    expect(
      june.stores.map((row) => [row.name, row.thisCents, row.lastMonthCents, row.lastYearCents]),
    ).toEqual([
      ["Pizza Place", 20_000, 18_000, 9_000],
      ["Corner Grocery", 13_000, 0, 0],
      ["Noodle Bar", 12_000, 0, 0],
      ["Corner Gas", 3_000, 0, 0],
    ]);
    expect(june.months).toHaveLength(12);
    expect(june.months.at(-1)).toEqual({
      month: "2030-06",
      spentCents: 48_000,
      lastYearCents: 9_000,
    });
    expect(june.months[0]?.month).toBe("2029-07");

    const review = await body(
      await t.api.money["year-review"].$get({ query: { bookId: String(book.id), year: "2030" } }),
    );
    expect(review).toEqual({
      year: 2030,
      inCents: 400_000,
      outCents: 18_000 * 5 + 32_000 + 13_000 + 3_000,
      savedCents: 400_000 - (18_000 * 5 + 32_000 + 13_000 + 3_000),
      savingsRatePercent: 66,
      lastYearOutCents: 27_000,
      categories: [
        { name: "Dining out", cents: 122_000 },
        { name: "Groceries", cents: 13_000 },
        { name: "Uncategorized", cents: 3_000 },
      ],
      stores: [
        { name: "Pizza Place", cents: 110_000, count: 6 },
        { name: "Corner Grocery", cents: 13_000, count: 1 },
        { name: "Noodle Bar", cents: 12_000, count: 1 },
        { name: "Corner Gas", cents: 3_000, count: 1 },
      ],
      biggestMonth: { month: "2030-06", spentCents: 48_000 },
      transactionCount: 11,
    });
  });
});
