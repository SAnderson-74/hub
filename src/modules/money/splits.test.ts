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
  const account = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Rewards account", kind: "credit_card" },
    }),
  );
  return {
    book,
    account,
    groceries: category("Groceries"),
    shopping: category("Shopping"),
    dining: category("Dining out"),
  };
}

/** A $120 store run: $80 of groceries and $40 of household things. */
const storeRun = (accountId: number, groceries: number, shopping: number) =>
  t.api.money.transactions.$post({
    json: {
      accountId,
      date: "2030-03-10",
      amountCents: -12_000,
      payee: "Example Store",
      splits: [
        { categoryId: groceries, amountCents: -8_000 },
        { categoryId: shopping, amountCents: -4_000, memo: "Paper towels" },
      ],
    },
  });

describe("split transactions", () => {
  it("keep their parts, show the largest part's category, and must add up", async () => {
    const { book, account, groceries, shopping } = await setup();
    const split = await body(await storeRun(account.id, groceries, shopping));
    expect(split.category?.name).toBe("Groceries");
    expect(split.splits.map((part) => [part.category?.name, part.amountCents, part.memo])).toEqual([
      ["Groceries", -8_000, ""],
      ["Shopping", -4_000, "Paper towels"],
    ]);

    const off = await failure(
      await t.api.money.transactions.$post({
        json: {
          accountId: account.id,
          date: "2030-03-10",
          amountCents: -12_000,
          splits: [
            { categoryId: groceries, amountCents: -8_000 },
            { categoryId: shopping, amountCents: -3_000 },
          ],
        },
      }),
    );
    expect(off).toMatchObject({ status: 400 });
    expect(off.error).toContain("add up to -110.00, not -120.00");

    // A category only a part uses is in use.
    const used = await body(
      await t.api.money.categories.$get({ query: { bookId: String(book.id) } }),
    );
    expect(used.find((category) => category.id === shopping)?.transactionCount).toBe(1);
    expect(
      await failure(await t.api.money.categories[":id"].$delete(param(shopping))),
    ).toMatchObject({ status: 409 });
  });

  it("refuse another book's categories", async () => {
    const { account, groceries } = await setup();
    const other = await body(
      await t.api.money.books.$post({
        json: { name: "Business", kind: "business", starterCategories: true },
      }),
    );
    const [foreign] = await body(
      await t.api.money.categories.$get({ query: { bookId: String(other.id) } }),
    );
    expect(await failure(await storeRun(account.id, groceries, foreign?.id ?? 0))).toMatchObject({
      status: 400,
    });
  });

  it("count each part in budgets, cash flow, rewards, and the category filter", async () => {
    const { book, account, groceries, shopping } = await setup();
    await body(await storeRun(account.id, groceries, shopping));

    const budget = await body(
      await t.api.money.budget.$get({ query: { bookId: String(book.id), month: "2030-03" } }),
    );
    const spent = (id: number) => budget.categories.find((row) => row.id === id)?.spentCents;
    expect([spent(groceries), spent(shopping)]).toEqual([8_000, 4_000]);

    const flow = await body(
      await t.api.money["cash-flow"].$get({
        query: { bookId: String(book.id), month: "2030-03" },
      }),
    );
    expect(flow.outgoing.map((item) => [item.name, item.cents])).toEqual([
      ["Groceries", 8_000],
      ["Shopping", 4_000],
    ]);

    // Added after the purchase, the card is matched to it.
    const { card: added } = await body(
      await t.api.money.cards.$post({ json: { accountId: account.id, name: "Store card" } }),
    );
    await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(added.id),
        json: { kind: "cash_back", baseRate: 100, rates: [{ categoryId: groceries, rate: 300 }] },
      }),
    );
    const rewards = await body(
      await t.api.money.rewards.$get({ query: { bookId: String(book.id), year: "2030" } }),
    );
    // 3% on the $80 of groceries, 1% on the $40 of household things.
    expect(rewards.cards[0]?.valueCents).toBe(240 + 40);

    const byPart = await body(
      await t.api.money.transactions.$get({
        query: { bookId: String(book.id), categoryId: String(shopping) },
      }),
    );
    expect(byPart.transactions.map((row) => row.payee)).toEqual(["Example Store"]);
  });

  it("change together with the amount, and go when one category is picked", async () => {
    const { account, groceries, shopping, dining } = await setup();
    const split = await body(await storeRun(account.id, groceries, shopping));

    expect(
      await failure(
        await t.api.money.transactions[":id"].$patch({
          ...param(split.id),
          json: { amountCents: -13_000 },
        }),
      ),
    ).toMatchObject({ status: 409 });
    const resplit = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(split.id),
        json: {
          amountCents: -13_000,
          splits: [
            { categoryId: groceries, amountCents: -3_000 },
            { categoryId: shopping, amountCents: -10_000 },
          ],
        },
      }),
    );
    expect(resplit.category?.name).toBe("Shopping");
    expect(resplit.splits).toHaveLength(2);

    const whole = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(split.id),
        json: { categoryId: dining },
      }),
    );
    expect(whole).toMatchObject({ category: { name: "Dining out" }, splits: [] });

    const again = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(split.id),
        json: {
          splits: [
            { categoryId: groceries, amountCents: -6_500 },
            { categoryId: shopping, amountCents: -6_500 },
          ],
        },
      }),
    );
    expect(again.splits).toHaveLength(2);
    const unsplit = await body(
      await t.api.money.transactions[":id"].$patch({ ...param(split.id), json: { splits: null } }),
    );
    expect(unsplit.splits).toEqual([]);
    expect(unsplit.category?.id).toBe(groceries);
  });

  it("go with the transaction, and when it's linked as a transfer", async () => {
    const { book, account, groceries, shopping } = await setup();
    const checking = await body(
      await t.api.money.accounts.$post({
        json: { bookId: book.id, name: "Checking", kind: "checking" },
      }),
    );
    const split = await body(await storeRun(account.id, groceries, shopping));
    const other = await body(
      await t.api.money.transactions.$post({
        json: { accountId: checking.id, date: "2030-03-10", amountCents: 12_000 },
      }),
    );
    await body(
      await t.api.money.transfers.link.$post({ json: { transactionIds: [split.id, other.id] } }),
    );
    const count = () =>
      (
        t.sqlite.prepare("select count(*) as n from money_transaction_splits").get() as {
          n: number;
        }
      ).n;
    expect(count()).toBe(0);

    const second = await body(await storeRun(account.id, groceries, shopping));
    expect(count()).toBe(2);
    expect((await t.api.money.transactions[":id"].$delete(param(second.id))).status).toBe(204);
    expect(count()).toBe(0);
  });
});
