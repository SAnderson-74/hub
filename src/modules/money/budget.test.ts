import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const setup = async () => {
  const book = await body(
    await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
  );
  const account = await body(
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
  return {
    book,
    account,
    savings,
    groceries: await category("Groceries"),
    dining: await category("Dining out"),
    paycheck: await category("Paycheck", "income"),
  };
};

const spend = async (
  accountId: number,
  date: string,
  amountCents: number,
  categoryId: number | null,
) =>
  body(
    await t.api.money.transactions.$post({
      json: { accountId, date, amountCents, categoryId, payee: "x" },
    }),
  );
const setBudget = async (categoryId: number, month: string, amountCents: number) =>
  body(await t.api.money.budgets.$put({ json: { categoryId, month, amountCents } }));
const monthOf = async (bookId: number, month: string) =>
  body(await t.api.money.budget.$get({ query: { bookId: String(bookId), month } }));

describe("budgets", () => {
  it("compare each category's spending with its budget for the month", async () => {
    const { book, account, savings, groceries, dining, paycheck } = await setup();
    await setBudget(groceries.id, "2030-03", 50_000);
    await spend(account.id, "2030-03-02", -12_000, groceries.id);
    await spend(account.id, "2030-03-20", -8_000, groceries.id);
    await spend(account.id, "2030-03-21", 1_500, groceries.id); // a refund
    await spend(account.id, "2030-03-05", -4_500, dining.id);
    await spend(account.id, "2030-03-01", 300_000, paycheck.id);
    await spend(account.id, "2030-03-09", -999, null);
    await spend(account.id, "2030-04-01", -7_000, groceries.id); // next month
    await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: account.id,
          toAccountId: savings.id,
          date: "2030-03-10",
          amountCents: 100_000,
        },
      }),
    );

    const march = await monthOf(book.id, "2030-03");
    expect(march.categories).toEqual([
      {
        id: groceries.id,
        name: "Groceries",
        archived: false,
        budgetCents: 50_000,
        spentCents: 18_500,
      },
      { id: dining.id, name: "Dining out", archived: false, budgetCents: null, spentCents: 4_500 },
    ]);
    expect(march.totals).toEqual({
      budgetedCents: 50_000,
      spentBudgetedCents: 18_500,
      spentUnbudgetedCents: 4_500,
      incomeCents: 300_000,
      uncategorizedCents: 999,
    });
    expect(march.history.map((entry) => entry.month)).toEqual([
      "2029-10",
      "2029-11",
      "2029-12",
      "2030-01",
      "2030-02",
      "2030-03",
    ]);
    expect(march.history.at(-1)).toEqual({
      month: "2030-03",
      budgetedCents: 50_000,
      spentCents: 23_000,
    });
    expect(march.history[0]).toEqual({ month: "2029-10", budgetedCents: 0, spentCents: 0 });
  });

  it("carry forward until changed, and 0 ends them", async () => {
    const { book, groceries } = await setup();
    await setBudget(groceries.id, "2030-01", 40_000);
    await setBudget(groceries.id, "2030-04", 45_000);
    const budget = async (month: string) =>
      (await monthOf(book.id, month)).categories.find((row) => row.id === groceries.id)
        ?.budgetCents;
    expect(await budget("2029-12")).toBeNull();
    expect(await budget("2030-03")).toBe(40_000);
    expect(await budget("2030-09")).toBe(45_000);

    // Setting the same month again replaces it.
    const changed = await setBudget(groceries.id, "2030-04", 42_500);
    expect(changed.month).toBe("2030-04");
    expect(await budget("2030-05")).toBe(42_500);

    await setBudget(groceries.id, "2030-07", 0);
    expect(await budget("2030-06")).toBe(42_500);
    expect(await budget("2030-07")).toBeNull();
    expect((await monthOf(book.id, "2030-06")).history.map((m) => m.budgetedCents)).toEqual([
      40_000, 40_000, 40_000, 42_500, 42_500, 42_500,
    ]);
  });

  it("are for spending categories, and a month must look like 2030-01", async () => {
    const { book, paycheck, groceries } = await setup();
    const income = await failure(
      await t.api.money.budgets.$put({
        json: { categoryId: paycheck.id, month: "2030-01", amountCents: 100 },
      }),
    );
    expect(income).toMatchObject({ status: 400 });
    expect(income.error).toContain("spending categories");
    expect(
      (
        await t.api.money.budgets.$put({
          json: { categoryId: groceries.id, month: "2030-13", amountCents: 100 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await t.api.money.budget.$get({ query: { bookId: String(book.id), month: "March" } }))
        .status,
    ).toBe(400);
  });

  it("go with their category or book when those are deleted", async () => {
    const { book, groceries } = await setup();
    await setBudget(groceries.id, "2030-01", 40_000);
    expect(
      (await t.api.money.categories[":id"].$delete({ param: { id: String(groceries.id) } })).status,
    ).toBe(204);

    const other = await body(
      await t.api.money.books.$post({
        json: { name: "Side", kind: "business", starterCategories: true },
      }),
    );
    const supplies = (
      await body(await t.api.money.categories.$get({ query: { bookId: String(other.id) } }))
    ).find((category) => category.name === "Supplies");
    await setBudget(supplies?.id ?? 0, "2030-01", 5_000);
    expect(
      (await t.api.money.books[":id"].$delete({ param: { id: String(other.id) } })).status,
    ).toBe(204);
    expect((await monthOf(book.id, "2030-01")).categories.map((row) => row.name)).toEqual([
      "Dining out",
    ]);
  });
});
