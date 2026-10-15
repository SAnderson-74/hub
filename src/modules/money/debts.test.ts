import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { health } from "./health.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

async function setUp() {
  const book = await body(
    await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
  );
  const account = async (
    name: string,
    kind: "checking" | "savings" | "credit_card" | "loan" | "investment",
    openingBalanceCents: number,
  ) =>
    body(
      await t.api.money.accounts.$post({
        json: { bookId: book.id, name, kind, openingBalanceCents },
      }),
    );
  return { book, account };
}

describe("debts", () => {
  it("lists cards and loans that owe money, with their terms and the plan", async () => {
    const { book, account } = await setUp();
    const checking = await account("Checking", "checking", 50_000);
    const card = await account("Card", "credit_card", -120_000);
    const loan = await account("Car loan", "loan", -800_000);
    await account("Paid-off card", "credit_card", 0);

    const list = async () =>
      body(await t.api.money.debts.$get({ query: { bookId: String(book.id) } }));
    expect(await list()).toEqual({
      debts: [
        {
          id: card.id,
          name: "Card",
          kind: "credit_card",
          balanceCents: 120_000,
          aprBasisPoints: null,
          minimumCents: null,
        },
        {
          id: loan.id,
          name: "Car loan",
          kind: "loan",
          balanceCents: 800_000,
          aprBasisPoints: null,
          minimumCents: null,
        },
      ],
      plan: { strategy: "avalanche", extraCents: 0, order: [] },
    });

    const terms = (id: number, json: { aprBasisPoints: number; minimumCents: number }) =>
      t.api.money.debts[":id"].$put({ param: { id: String(id) }, json });
    await body(await terms(card.id, { aprBasisPoints: 2_499, minimumCents: 3_500 }));
    expect(
      (await failure(await terms(checking.id, { aprBasisPoints: 100, minimumCents: 100 }))).status,
    ).toBe(400);
    expect(
      (await failure(await terms(card.id, { aprBasisPoints: -1, minimumCents: 100 }))).status,
    ).toBe(400);

    // The order keeps only this book's accounts, once each.
    const saved = await body(
      await t.api.money["debt-plan"].$put({
        json: {
          bookId: book.id,
          strategy: "custom",
          extraCents: 10_000,
          order: [loan.id, 999, loan.id, card.id],
        },
      }),
    );
    expect(saved.plan).toEqual({
      strategy: "custom",
      extraCents: 10_000,
      order: [loan.id, card.id],
    });
    expect(saved.debts[0]).toMatchObject({ aprBasisPoints: 2_499, minimumCents: 3_500 });

    // A deleted account takes its terms; a deleted book its plan.
    await t.api.money.accounts[":id"].$delete({ param: { id: String(card.id) } });
    const other = await body(
      await t.api.money.books.$post({ json: { name: "Spare", kind: "personal" } }),
    );
    await t.api.money["debt-plan"].$put({
      json: { bookId: other.id, strategy: "snowball", extraCents: 0, order: [] },
    });
    expect(
      (await t.api.money.books[":id"].$delete({ param: { id: String(other.id) } })).status,
    ).toBe(204);
  });
});

describe("money health", () => {
  it("covers months of spending with cash on hand, and finds the savings rate", async () => {
    const { book, account } = await setUp();
    const checking = await account("Checking", "checking", 900_000);
    await account("Savings", "savings", 300_000);
    await account("Brokerage", "investment", 500_000);
    await account("Card", "credit_card", -50_000);
    const paycheck = await body(
      await t.api.money.categories.$post({
        json: { bookId: book.id, name: "Paycheck", kind: "income" },
      }),
    );
    const groceries = await body(
      await t.api.money.categories.$post({
        json: { bookId: book.id, name: "Groceries", kind: "expense" },
      }),
    );
    const add = (date: string, amountCents: number, categoryId: number | null) =>
      t.api.money.transactions.$post({
        json: { accountId: checking.id, date, amountCents, payee: "x", categoryId },
      });
    // Three full months before June, and June itself, which doesn't count yet.
    for (const month of ["2030-03", "2030-04", "2030-05"]) {
      await add(`${month}-01`, 500_000, paycheck.id);
      await add(`${month}-10`, -380_000, groceries.id);
      await add(`${month}-12`, -20_000, null);
    }
    await add("2030-06-02", -999_000, groceries.id);

    const numbers = health(t.db, book.id, "2030-06-15");
    expect(numbers).toMatchObject({
      investedCents: 500_000,
      debtCents: 50_000,
      months: 3,
      averageSpendingCents: 400_000,
      averageIncomeCents: 500_000,
      savingsRatePercent: 20,
    });
    // Checking is $9,000 + 3 × $1,000 − $9,990 = $2,010, plus $3,000 savings: $5,010 over $4,000.
    expect(numbers.liquidCents).toBe(501_000);
    expect(numbers.monthsCovered).toBe(1.3);
    expect(numbers.netCents).toBe(501_000 + 500_000 - 50_000);

    const empty = await body(
      await t.api.money.books.$post({ json: { name: "Empty", kind: "personal" } }),
    );
    expect(health(t.db, empty.id, "2030-06-15")).toMatchObject({
      months: 0,
      monthsCovered: null,
      savingsRatePercent: null,
    });
    expect((await t.api.money.health.$get({ query: { bookId: String(book.id) } })).status).toBe(
      200,
    );
  });
});
