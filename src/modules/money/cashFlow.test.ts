import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { settle } from "./cashFlow.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const setup = async () => {
  const book = await body(
    await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
  );
  const account = async (name: string, kind: "checking" | "savings") =>
    body(await t.api.money.accounts.$post({ json: { bookId: book.id, name, kind } }));
  const category = async (name: string, kind: "expense" | "income" = "expense") =>
    body(await t.api.money.categories.$post({ json: { bookId: book.id, name, kind } }));
  return {
    book,
    checking: await account("Checking", "checking"),
    savings: await account("Savings", "savings"),
    groceries: await category("Groceries"),
    rent: await category("Rent"),
    gifts: await category("Gifts"),
    paycheck: await category("Paycheck", "income"),
  };
};

const add = async (
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
const flowOf = async (
  bookId: number,
  month: string,
  months?: "1" | "3" | "12",
  by?: "category" | "method",
) =>
  body(
    await t.api.money["cash-flow"].$get({
      query: {
        bookId: String(bookId),
        month,
        ...(months ? { months } : {}),
        ...(by ? { by } : {}),
      },
    }),
  );

describe("cash flow", () => {
  it("nets each category, keeps uncategorized in and out apart, and skips transfers", async () => {
    const { book, checking, savings, groceries, rent, gifts, paycheck } = await setup();
    await add(checking.id, "2030-03-01", 300_000, paycheck.id);
    await add(checking.id, "2030-03-02", -150_000, rent.id);
    await add(checking.id, "2030-03-05", -12_000, groceries.id);
    await add(checking.id, "2030-03-06", 2_000, groceries.id); // a refund
    await add(checking.id, "2030-03-07", -5_000, gifts.id);
    await add(checking.id, "2030-03-08", 8_000, gifts.id); // more back than spent
    await add(checking.id, "2030-03-09", -3_000, null);
    await add(checking.id, "2030-03-10", 1_000, null);
    await add(checking.id, "2030-04-01", -99_000, rent.id); // next month
    await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          date: "2030-03-15",
          amountCents: 50_000,
          memo: "",
        },
      }),
    );

    expect(await flowOf(book.id, "2030-03")).toEqual({
      from: "2030-03-01",
      to: "2030-03-31",
      by: "category",
      incoming: [
        { key: `category-${paycheck.id}`, name: "Paycheck", cents: 300_000 },
        { key: `category-${gifts.id}`, name: "Gifts", cents: 3_000 },
        { key: "uncategorized-in", name: "Uncategorized", cents: 1_000 },
      ],
      outgoing: [
        { key: `category-${rent.id}`, name: "Rent", cents: 150_000 },
        { key: `category-${groceries.id}`, name: "Groceries", cents: 10_000 },
        { key: "uncategorized-out", name: "Uncategorized", cents: 3_000 },
      ],
    });
  });

  it("splits money out by the card or account that paid, with the same total", async () => {
    const { book, checking, groceries, rent, gifts, paycheck } = await setup();
    const credit = await body(
      await t.api.money.accounts.$post({
        json: { bookId: book.id, name: "Rewards account", kind: "credit_card" },
      }),
    );
    const card = (
      await body(
        await t.api.money.cards.$post({ json: { accountId: credit.id, name: "Rewards card" } }),
      )
    ).card;
    const debit = (
      await body(
        await t.api.money.cards.$post({ json: { accountId: checking.id, name: "Everyday debit" } }),
      )
    ).card;
    const pay = async (
      accountId: number,
      amountCents: number,
      categoryId: number | null,
      cardId: number | null,
    ) =>
      body(
        await t.api.money.transactions.$post({
          json: { accountId, date: "2030-03-10", amountCents, categoryId, cardId, payee: "x" },
        }),
      );
    await pay(checking.id, 300_000, paycheck.id, null);
    await pay(checking.id, -150_000, rent.id, null); // a bank payment, no card
    await pay(credit.id, -12_000, groceries.id, card.id);
    await pay(credit.id, 2_000, groceries.id, card.id); // a refund to the card
    await pay(checking.id, -4_000, groceries.id, debit.id);
    await pay(credit.id, -1_500, null, card.id);
    await pay(checking.id, 5_000, gifts.id, null); // money in only: not spending

    const byCategory = await flowOf(book.id, "2030-03");
    const byMethod = await flowOf(book.id, "2030-03", "1", "method");
    expect(byMethod.by).toBe("method");
    expect(byMethod.incoming).toEqual(byCategory.incoming);
    expect(byMethod.outgoing).toEqual([
      { key: `account-${checking.id}`, name: "Checking (no card)", cents: 150_000 },
      { key: `card-${card.id}`, name: "Rewards card", cents: 11_500 },
      { key: `card-${debit.id}`, name: "Everyday debit", cents: 4_000 },
    ]);
    const total = (items: Array<{ cents: number }>) =>
      items.reduce((sum, item) => sum + item.cents, 0);
    expect(total(byMethod.outgoing)).toBe(total(byCategory.outgoing));
  });

  it("keeps the total when a refund goes back to a different card", () => {
    // $100 on card A, $30 refunded to card B, $50 on account C: $120 out in all.
    const settled = settle(
      new Map([
        ["A", 10_000],
        ["B", -3_000],
        ["C", 5_000],
      ]),
    );
    expect([...settled.keys()]).toEqual(["A", "C"]);
    expect([...settled.values()].reduce((sum, cents) => sum + cents, 0)).toBe(12_000);
    expect(settled.get("A")).toBe(8_000);
    expect(
      settle(
        new Map([
          ["A", 1_000],
          ["B", -1_000],
        ]),
      ),
    ).toEqual(new Map());
  });

  it("covers the months up to the chosen one", async () => {
    const { book, checking, rent } = await setup();
    await add(checking.id, "2029-12-31", -1_000, rent.id);
    await add(checking.id, "2030-01-01", -2_000, rent.id);
    await add(checking.id, "2030-03-31", -4_000, rent.id);
    const quarter = await flowOf(book.id, "2030-03", "3");
    expect(quarter).toMatchObject({ from: "2030-01-01", to: "2030-03-31" });
    expect(quarter.outgoing).toEqual([{ key: `category-${rent.id}`, name: "Rent", cents: 6_000 }]);
    const year = await flowOf(book.id, "2030-03", "12");
    expect(year.from).toBe("2029-04-01");
    expect(year.outgoing[0]?.cents).toBe(7_000);
  });

  it("refuses other periods and unknown books", async () => {
    const { book } = await setup();
    const res = await t.api.money["cash-flow"].$get({
      query: { bookId: String(book.id), month: "2030-03", months: "6" },
    });
    expect(await failure(res)).toMatchObject({ status: 400 });
    expect(
      await failure(
        await t.api.money["cash-flow"].$get({ query: { bookId: "999", month: "2030-03" } }),
      ),
    ).toMatchObject({ status: 404 });
  });
});
