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
  const category = async (name: string, kind: "expense" | "income" = "expense") =>
    body(await t.api.money.categories.$post({ json: { bookId: book.id, name, kind } }));
  return {
    book,
    account,
    groceries: await category("Groceries"),
    shopping: await category("Shopping"),
    refunds: await category("Refunds", "income"),
  };
};

const rulesOf = async (bookId: number) =>
  body(await t.api.money.rules.$get({ query: { bookId: String(bookId) } }));
const param = (id: number) => ({ param: { id: String(id) } });

describe("rules", () => {
  it("keep their order, which can change, and need a category from the book", async () => {
    const { book, groceries, shopping } = await setup();
    await body(
      await t.api.money.rules.$post({
        json: { bookId: book.id, contains: "grocery", categoryId: groceries.id },
      }),
    );
    const two = await body(
      await t.api.money.rules.$post({
        json: {
          bookId: book.id,
          contains: "amazon",
          categoryId: shopping.id,
          direction: "out",
          renameTo: "Online store",
        },
      }),
    );
    expect(two.map((rule) => [rule.contains, rule.category.name, rule.direction])).toEqual([
      ["grocery", "Groceries", "any"],
      ["amazon", "Shopping", "out"],
    ]);

    const second = two[1]?.id ?? 0;
    const moved = await body(
      await t.api.money.rules[":id"].move.$post({ ...param(second), json: { to: "earlier" } }),
    );
    expect(moved.map((rule) => rule.contains)).toEqual(["amazon", "grocery"]);
    // Already first: nothing changes.
    await body(
      await t.api.money.rules[":id"].move.$post({ ...param(second), json: { to: "earlier" } }),
    );
    expect((await rulesOf(book.id)).map((rule) => rule.contains)).toEqual(["amazon", "grocery"]);

    const edited = await body(
      await t.api.money.rules[":id"].$patch({ ...param(second), json: { contains: "amzn" } }),
    );
    expect(edited[0]?.contains).toBe("amzn");

    const other = await body(
      await t.api.money.books.$post({ json: { name: "Business", kind: "business" } }),
    );
    const wrongBook = await failure(
      await t.api.money.rules.$post({
        json: { bookId: other.id, contains: "x", categoryId: groceries.id },
      }),
    );
    expect(wrongBook).toMatchObject({ status: 400 });
    expect(wrongBook.error).toContain("another book");

    expect(await body(await t.api.money.rules[":id"].$delete(param(second)))).toHaveLength(1);
  });

  it("apply to uncategorized transactions, renaming payees where asked", async () => {
    const { book, account, groceries, shopping, refunds } = await setup();
    for (const json of [
      { contains: "refund", categoryId: refunds.id, direction: "in" as const },
      { contains: "grocery", categoryId: groceries.id, renameTo: "Corner grocery" },
      { contains: "amazon", categoryId: shopping.id, direction: "out" as const },
    ]) {
      await body(await t.api.money.rules.$post({ json: { bookId: book.id, ...json } }));
    }
    const add = async (payee: string, amountCents: number, categoryId: number | null = null) =>
      body(
        await t.api.money.transactions.$post({
          json: { accountId: account.id, date: "2030-01-05", amountCents, payee, categoryId },
        }),
      );
    await add("SQ *CORNER GROCERY 4412", -4_250);
    await add("AMAZON MKTPLACE", -1_999);
    await add("Amazon refund", 1_999);
    await add("AMAZON", 500); // money in, and the amazon rule is money out only
    await add("Grocery outlet", -800, shopping.id); // already categorized: left alone

    expect(await body(await t.api.money.rules.apply.$post({ json: { bookId: book.id } }))).toEqual({
      categorized: 3,
    });
    const page = await body(
      await t.api.money.transactions.$get({ query: { bookId: String(book.id) } }),
    );
    expect(
      page.transactions
        .map((row) => [row.payee, row.category?.name ?? null])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["AMAZON", null],
      ["AMAZON MKTPLACE", "Shopping"],
      ["Amazon refund", "Refunds"],
      ["Corner grocery", "Groceries"],
      ["Grocery outlet", "Shopping"],
    ]);
  });

  it("categorize imports, and a renamed payee still counts as a duplicate", async () => {
    const { book, account, groceries } = await setup();
    await body(
      await t.api.money.rules.$post({
        json: {
          bookId: book.id,
          contains: "corner groc",
          categoryId: groceries.id,
          renameTo: "Corner grocery",
        },
      }),
    );
    const file = {
      accountId: account.id,
      source: "csv" as const,
      transactions: [
        { date: "2030-01-05", amountCents: -4_250, payee: "SQ *CORNER GROC 4412", memo: "" },
        { date: "2030-01-06", amountCents: -900, payee: "Bakery", memo: "" },
      ],
    };
    const preview = await body(
      await t.api.money.imports.$post({ query: { dryRun: "true" }, json: file }),
    );
    expect(preview).toMatchObject({ created: 2, categorizedByRules: 1 });
    expect(preview.rows[0]?.payee).toBe("Corner grocery");
    await body(await t.api.money.imports.$post({ query: {}, json: file }));

    const again = await body(
      await t.api.money.imports.$post({ query: { dryRun: "true" }, json: file }),
    );
    expect(again).toMatchObject({ created: 0, duplicates: 2 });
    const page = await body(
      await t.api.money.transactions.$get({
        query: { bookId: String(book.id), categoryId: String(groceries.id) },
      }),
    );
    expect(page.transactions.map((row) => row.payee)).toEqual(["Corner grocery"]);
  });

  it("keep their category from being deleted, and go with an empty book", async () => {
    const { book, groceries } = await setup();
    await body(
      await t.api.money.rules.$post({
        json: { bookId: book.id, contains: "grocery", categoryId: groceries.id },
      }),
    );
    const blocked = await failure(await t.api.money.categories[":id"].$delete(param(groceries.id)));
    expect(blocked).toMatchObject({ status: 409 });
    expect(blocked.error).toContain("A rule uses this category");

    const empty = await body(
      await t.api.money.books.$post({ json: { name: "Side", kind: "business" } }),
    );
    const supplies = await body(
      await t.api.money.categories.$post({
        json: { bookId: empty.id, name: "Supplies", kind: "expense" },
      }),
    );
    await body(
      await t.api.money.rules.$post({
        json: { bookId: empty.id, contains: "paper", categoryId: supplies.id },
      }),
    );
    expect((await t.api.money.books[":id"].$delete(param(empty.id))).status).toBe(204);
  });
});
