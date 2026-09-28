import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { BankImport } from "../../shared/bankImport";

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
    rent: await category("Rent"),
    dining: await category("Dining out"),
  };
};

const csv = (accountId: number, rows: Array<[string, number, string]>): BankImport => ({
  accountId,
  source: "csv",
  fileName: "checking.csv",
  transactions: rows.map(([date, amountCents, payee]) => ({ date, amountCents, payee, memo: "" })),
});
const importFile = async (file: BankImport) =>
  body(await t.api.money.imports.$post({ query: {}, json: file }));
const list = async (bookId: number) =>
  (await body(await t.api.money.transactions.$get({ query: { bookId: String(bookId) } })))
    .transactions;
const overview = async (bookId: number) =>
  body(await t.api.money.categorize.$get({ query: { bookId: String(bookId) } }));

describe("payment-app imports", () => {
  it("save who each one was with, in the memo too, and keep the bank's payee", async () => {
    const { book, account } = await setup();
    await importFile(
      csv(account.id, [
        ["2030-03-01", -80_000, "VENMO *JOHN SMITH"],
        ["2030-03-02", 2_500, "Zelle from Jane Doe on 03/02 Ref # 12"],
        ["2030-03-03", -1_000, "CORNER GROCERY"],
      ]),
    );
    const rows = await list(book.id);
    expect(rows.map((row) => [row.payee, row.counterparty, row.memo, row.bankPayee])).toEqual([
      ["CORNER GROCERY", null, "", "CORNER GROCERY"],
      [
        "Zelle from Jane Doe on 03/02 Ref # 12",
        "Jane Doe",
        "Zelle from Jane Doe",
        "Zelle from Jane Doe on 03/02 Ref # 12",
      ],
      ["VENMO *JOHN SMITH", "John Smith", "Venmo to John Smith", "VENMO *JOHN SMITH"],
    ]);
    // Searching finds them by name.
    const found = await body(
      await t.api.money.transactions.$get({ query: { bookId: String(book.id), q: "jane" } }),
    );
    expect(found.total).toBe(1);
  });

  it("fills in people on transactions from before", async () => {
    const { book, account } = await setup();
    await body(
      await t.api.money.transactions.$post({
        json: {
          accountId: account.id,
          date: "2030-03-01",
          amountCents: -500,
          payee: "VENMO *JOHN SMITH",
          memo: "Tacos",
        },
      }),
    );
    expect((await overview(book.id)).peopleToFill).toBe(1);
    expect(await body(await t.api.money.people.fill.$post({ json: { bookId: book.id } }))).toEqual({
      filled: 1,
    });
    const [row] = await list(book.id);
    expect(row).toMatchObject({ counterparty: "John Smith", memo: "Venmo to John Smith · Tacos" });
    expect((await overview(book.id)).peopleToFill).toBe(0);
  });
});

describe("sorting transactions", () => {
  it("groups uncategorized ones and suggests from earlier ones", async () => {
    const { book, account, groceries } = await setup();
    const earlier = await body(
      await t.api.money.transactions.$post({
        json: {
          accountId: account.id,
          date: "2030-02-01",
          amountCents: -1_000,
          payee: "CORNER GROCERY #9",
          categoryId: groceries.id,
        },
      }),
    );
    expect(earlier.category?.name).toBe("Groceries");
    await importFile(
      csv(account.id, [
        ["2030-03-01", -2_000, "SQ *CORNER GROCERY 4412"],
        ["2030-03-05", -3_000, "CORNER GROCERY SEATTLE WA"],
        ["2030-03-06", -80_000, "VENMO *JOHN SMITH"],
      ]),
    );
    const result = await overview(book.id);
    expect(result.uncategorized).toBe(3);
    expect(result.groups.map((group) => [group.name, group.transactionIds.length])).toEqual([
      ["Corner Grocery", 2],
      ["Venmo: John Smith", 1],
    ]);
    expect(result.groups[0]?.suggestion).toEqual({
      categoryId: groceries.id,
      confidence: "medium",
      reason: "You put another one like this in Groceries",
    });
  });

  it("categorizes a group, renames it, and makes a rule the next import follows", async () => {
    const { book, account, rent } = await setup();
    await importFile(csv(account.id, [["2030-03-01", -80_000, "VENMO *JOHN SMITH"]]));
    const [group] = (await overview(book.id)).groups;
    expect(group).toBeDefined();
    const applied = await body(
      await t.api.money.categorize.$post({
        json: {
          bookId: book.id,
          transactionIds: group?.transactionIds ?? [],
          categoryId: rent.id,
          renameTo: "Rent to John",
          rule: { contains: group?.ruleText ?? "", direction: "out" },
        },
      }),
    );
    expect(applied).toEqual({ categorized: 1 });
    const [row] = await list(book.id);
    expect(row).toMatchObject({
      payee: "Rent to John",
      bankPayee: "VENMO *JOHN SMITH",
      category: { name: "Rent" },
    });

    // Importing the same file again skips it, even though the payee was renamed.
    const again = await importFile(csv(account.id, [["2030-03-01", -80_000, "VENMO *JOHN SMITH"]]));
    expect(again.duplicates).toBe(1);

    // Next month's payment, even on another app, follows the rule by the person's name.
    const next = await importFile(
      csv(account.id, [["2030-04-01", -80_000, "Zelle payment to John Smith Conf# 99"]]),
    );
    expect(next.categorizedByRules).toBe(1);
    const [april] = await list(book.id);
    expect(april).toMatchObject({ payee: "Rent to John", category: { name: "Rent" } });
    expect((await overview(book.id)).uncategorized).toBe(0);
  });

  it("only changes this book's transactions, and only into its categories", async () => {
    const { book, account, groceries } = await setup();
    const other = await body(
      await t.api.money.books.$post({ json: { name: "Business", kind: "business" } }),
    );
    const otherCategory = await body(
      await t.api.money.categories.$post({
        json: { bookId: other.id, name: "Supplies", kind: "expense" },
      }),
    );
    const otherAccount = await body(
      await t.api.money.accounts.$post({
        json: { bookId: other.id, name: "Business checking", kind: "checking" },
      }),
    );
    const mine = await body(
      await t.api.money.transactions.$post({
        json: { accountId: account.id, date: "2030-03-01", amountCents: -500, payee: "Shop" },
      }),
    );
    const theirs = await body(
      await t.api.money.transactions.$post({
        json: { accountId: otherAccount.id, date: "2030-03-01", amountCents: -500, payee: "Shop" },
      }),
    );
    expect(
      await failure(
        await t.api.money.categorize.$post({
          json: { bookId: book.id, transactionIds: [mine.id], categoryId: otherCategory.id },
        }),
      ),
    ).toMatchObject({ status: 400 });
    expect(
      await body(
        await t.api.money.categorize.$post({
          json: { bookId: book.id, transactionIds: [mine.id, theirs.id], categoryId: groceries.id },
        }),
      ),
    ).toEqual({ categorized: 1 });
    const [left] = await list(other.id);
    expect(left?.category).toBeNull();
  });
});
