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
  const category = (name: string) => categories.find((entry) => entry.name === name)?.id ?? 0;
  const credit = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Rewards account", kind: "credit_card" },
    }),
  );
  const checking = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Checking", kind: "checking" },
    }),
  );
  const { card } = await body(
    await t.api.money.cards.$post({
      json: { accountId: credit.id, name: "Rewards card", last4: "4321" },
    }),
  );
  return {
    book,
    credit,
    checking,
    card,
    groceries: category("Groceries"),
    shopping: category("Shopping"),
  };
}

/** A store run on the card: groceries and household things, with tax. */
const storeRun = (extra: Record<string, unknown> = {}) => ({
  format: "hub-receipt/v1" as const,
  receipts: [
    {
      store: "Example Store",
      date: "2030-03-10",
      total: 64.8,
      cardLast4: "4321",
      items: [
        { name: "Bananas", amount: 1.3, category: "Groceries" },
        { name: "Milk", amount: 38.7, category: "Groceries" },
        { name: "Paper towels", amount: 20, category: "Shopping" },
      ],
      ...extra,
    },
  ],
});

const run = async (json: Record<string, unknown>, dryRun = false) =>
  body(
    await t.api.money.receipts.$post({
      query: dryRun ? { dryRun: "true" } : {},
      json: json as never,
    }),
  );

const transactionsOf = async (bookId: number) =>
  (await body(await t.api.money.transactions.$get({ query: { bookId: String(bookId) } })))
    .transactions;

describe("receipts", () => {
  it("fill in the bank's transaction: store, lines, card, and a split by category", async () => {
    const { book, credit, groceries, shopping } = await setup();
    await body(
      await t.api.money.imports.$post({
        query: {},
        json: {
          accountId: credit.id,
          source: "csv",
          fileName: "march.csv",
          transactions: [
            { date: "2030-03-12", amountCents: -6_480, payee: "EXMPL STORE #12", memo: "" },
          ],
        },
      }),
    );
    const [bank] = await transactionsOf(book.id);
    if (!bank) throw new Error("Expected the bank's transaction");

    const preview = await run({ bookId: book.id, document: storeRun() }, true);
    expect(preview.receipts[0]).toMatchObject({
      outcome: "match",
      match: { id: bank.id, date: "2030-03-12" },
      card: { name: "Rewards card", last4: "4321" },
      parts: [
        { category: "Groceries", categoryId: groceries, cents: 4_320 },
        { category: "Shopping", categoryId: shopping, cents: 2_160 },
      ],
    });
    // A preview changes nothing.
    expect((await transactionsOf(book.id))[0]?.receipt).toBeNull();

    expect(await run({ bookId: book.id, document: storeRun() })).toMatchObject({
      matched: 1,
      created: 0,
    });
    const [updated] = await transactionsOf(book.id);
    expect(updated).toMatchObject({
      id: bank.id,
      payee: "Example Store",
      memo: "Receipt: Bananas, Milk, Paper towels",
      card: { name: "Rewards card" },
      receipt: { store: "Example Store", totalCents: 6_480, createdTransaction: false },
    });
    expect(updated?.splits.map((part) => part.amountCents)).toEqual([-4_320, -2_160]);

    // The same receipt again is a duplicate.
    expect((await run({ bookId: book.id, document: storeRun() })).receipts[0]?.outcome).toBe(
      "duplicate",
    );
  });

  it("go back to how the transaction was when removed", async () => {
    const { book, credit, groceries } = await setup();
    const bank = await body(
      await t.api.money.transactions.$post({
        json: {
          accountId: credit.id,
          date: "2030-03-10",
          amountCents: -6_480,
          payee: "Corner grocery",
          memo: "My note",
          categoryId: groceries,
        },
      }),
    );
    await run({ bookId: book.id, document: storeRun() });
    const [withReceipt] = await transactionsOf(book.id);
    expect(withReceipt?.payee).toBe("Corner grocery"); // a payee set by hand stays
    expect(withReceipt?.memo).toBe("My note\nReceipt: Bananas, Milk, Paper towels");

    const receiptId = withReceipt?.receipt?.id ?? 0;
    expect(await body(await t.api.money.receipts[":id"].$delete(param(receiptId)))).toEqual({
      outcome: "restored",
    });
    const [restored] = await transactionsOf(book.id);
    expect(restored).toMatchObject({
      id: bank.id,
      payee: "Corner grocery",
      memo: "My note",
      category: { id: groceries },
      splits: [],
      receipt: null,
    });
  });

  it("still come off when the card they restore has been deleted since", async () => {
    const { book, credit, card } = await setup();
    await body(
      await t.api.money.transactions.$post({
        json: {
          accountId: credit.id,
          date: "2030-03-10",
          amountCents: -6_480,
          payee: "Corner grocery",
          cardId: card.id,
        },
      }),
    );
    await run({ bookId: book.id, document: storeRun() });
    const [withReceipt] = await transactionsOf(book.id);
    // A second card on the account, then the first is deleted and the purchase moved.
    const { card: other } = await body(
      await t.api.money.cards.$post({ json: { accountId: credit.id, name: "New card" } }),
    );
    expect((await t.api.money.cards[":id"].$delete(param(card.id))).status).toBe(204);
    await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(withReceipt?.id ?? 0),
        json: { cardId: other.id },
      }),
    );

    expect(
      await body(await t.api.money.receipts[":id"].$delete(param(withReceipt?.receipt?.id ?? 0))),
    ).toEqual({ outcome: "restored" });
    const [restored] = await transactionsOf(book.id);
    expect(restored).toMatchObject({
      payee: "Corner grocery",
      memo: "",
      card: { name: "New card" },
      receipt: null,
    });
  });

  it("add the transaction when the bank hasn't, and a bank file then fills it in", async () => {
    const { book, credit } = await setup();
    expect(await run({ bookId: book.id, document: storeRun() })).toMatchObject({
      matched: 0,
      created: 1,
    });
    const [added] = await transactionsOf(book.id);
    expect(added).toMatchObject({
      date: "2030-03-10",
      amountCents: -6_480,
      payee: "Example Store",
      bankPayee: null,
      receipt: { createdTransaction: true },
    });

    const file = {
      accountId: credit.id,
      source: "csv" as const,
      fileName: "march.csv",
      transactions: [
        { date: "2030-03-12", amountCents: -6_480, payee: "EXMPL STORE #12", memo: "" },
        { date: "2030-03-13", amountCents: -1_000, payee: "Corner gas", memo: "" },
      ],
    };
    const preview = await body(
      await t.api.money.imports.$post({ query: { dryRun: "true" }, json: file }),
    );
    expect(preview).toMatchObject({ created: 1, duplicates: 0, matchedReceipts: 1 });
    expect(preview.rows.map((row) => row.outcome)).toEqual(["receipt", "create"]);
    await body(await t.api.money.imports.$post({ query: {}, json: file }));

    const rows = await transactionsOf(book.id);
    expect(rows).toHaveLength(2);
    const matched = rows.find((row) => row.id === added?.id);
    expect(matched).toMatchObject({
      date: "2030-03-12",
      payee: "Example Store",
      bankPayee: "EXMPL STORE #12",
      receipt: { date: "2030-03-10" },
    });
    // The same file again adds nothing.
    expect(
      await body(await t.api.money.imports.$post({ query: { dryRun: "true" }, json: file })),
    ).toMatchObject({ created: 0, matchedReceipts: 0 });

    // Found by the bank, the transaction stays when its receipt is removed.
    expect(
      await body(await t.api.money.receipts[":id"].$delete(param(matched?.receipt?.id ?? 0))),
    ).toEqual({ outcome: "kept" });
  });

  it("remove the transaction they added", async () => {
    const { book } = await setup();
    await run({ bookId: book.id, document: storeRun() });
    const [added] = await transactionsOf(book.id);
    expect(
      await body(await t.api.money.receipts[":id"].$delete(param(added?.receipt?.id ?? 0))),
    ).toEqual({ outcome: "deleted" });
    expect(await transactionsOf(book.id)).toEqual([]);
  });

  it("wait for unknown categories, a missing account, and numbers that shouldn't be there", async () => {
    const { book, checking, groceries } = await setup();
    const document = {
      format: "hub-receipt/v1" as const,
      receipts: [
        {
          store: "Pizza Place",
          date: "2030-03-11",
          total: 25,
          category: "Restaurants",
        },
        {
          store: "Farmers market",
          date: "2030-03-11",
          total: 12,
          type: "return",
          category: "Groceries",
        },
        {
          store: "Gift shop",
          date: "2030-03-11",
          total: 10,
          note: "Card 4111 1111 1111 1111",
          category: "Groceries",
        },
      ],
    };
    const preview = await run({ bookId: book.id, document }, true);
    expect(preview.unknownCategories).toEqual(["Restaurants"]);
    expect(preview.receipts.map((receipt) => receipt.outcome)).toEqual([
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(preview.receipts[1]?.problems).toEqual(["Pick the account it was paid from."]);
    expect(preview.receipts[2]?.problems).toContain(
      "It has a long number that could be a card or account number. Remove it, then paste again.",
    );

    const chosen = await run(
      {
        bookId: book.id,
        document,
        accountId: checking.id,
        categoryMap: { restaurants: groceries },
        skip: [2],
      },
      false,
    );
    expect(chosen.receipts.map((receipt) => receipt.outcome)).toEqual(["create", "create", "skip"]);
    const rows = await transactionsOf(book.id);
    expect(rows.map((row) => [row.payee, row.amountCents, row.category?.id])).toEqual([
      ["Farmers market", 1_200, groceries],
      ["Pizza Place", -2_500, groceries],
    ]);
  });

  it("refuse accounts and categories from another book", async () => {
    const { book } = await setup();
    const other = await body(
      await t.api.money.books.$post({ json: { name: "Business", kind: "business" } }),
    );
    const elsewhere = await body(
      await t.api.money.accounts.$post({
        json: { bookId: other.id, name: "Business checking", kind: "checking" },
      }),
    );
    expect(
      await failure(
        await t.api.money.receipts.$post({
          query: { dryRun: "true" },
          json: { bookId: book.id, document: storeRun(), accountId: elsewhere.id },
        }),
      ),
    ).toMatchObject({ status: 400 });
  });
});
