import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { BankImport, BankTransaction } from "../../shared/bankImport";

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
      json: { bookId: book.id, name: "Checking", kind: "checking", openingBalanceCents: 10_000 },
    }),
  );
  const groceries = await body(
    await t.api.money.categories.$post({
      json: { bookId: book.id, name: "Groceries", kind: "expense" },
    }),
  );
  return { book, account, groceries };
};

const tx = (
  date: string,
  amountCents: number,
  payee: string,
  extra: Partial<BankTransaction> = {},
) => ({
  date,
  amountCents,
  payee,
  memo: "",
  ...extra,
});

const run = async (json: BankImport, dryRun = false) =>
  body(
    await t.api.money.imports.$post({
      query: dryRun ? { dryRun: "true" } : {},
      json,
    }),
  );

const balance = async (bookId: number) =>
  (await body(await t.api.money.accounts.$get({ query: { bookId: String(bookId) } })))[0]
    ?.balanceCents;

describe("CSV imports", () => {
  it("preview without changing anything, then import and save the layout", async () => {
    const { book, account, groceries } = await setup();
    const file: BankImport = {
      accountId: account.id,
      source: "csv",
      fileName: "january.csv",
      transactions: [
        tx("2030-01-05", -4_250, "Corner grocery", { category: "groceries" }),
        tx("2030-01-06", 150_000, "Example Employer", { category: "Paycheck" }),
      ],
      layout: {
        headerKey: "date\u001fdescription\u001famount",
        columns: { date: 0, payee: 1, amount: 2 },
        options: { flipSigns: false, dayFirst: false },
      },
    };

    const preview = await run(file, true);
    expect(preview).toMatchObject({
      importId: null,
      created: 2,
      duplicates: 0,
      unknownCategories: ["Paycheck"],
    });
    expect(await balance(book.id)).toBe(10_000);
    expect(await body(await t.api.money["import-layouts"].$get())).toEqual([]);

    const done = await run(file);
    expect(done.importId).toEqual(expect.any(Number));
    expect(await balance(book.id)).toBe(155_750);
    const page = await body(
      await t.api.money.transactions.$get({ query: { bookId: String(book.id) } }),
    );
    expect(page.transactions.map((row) => [row.payee, row.category?.id ?? null])).toEqual([
      ["Example Employer", null],
      ["Corner grocery", groceries.id],
    ]);
    expect(await body(await t.api.money["import-layouts"].$get())).toEqual([
      { ...file.layout, accountId: account.id },
    ]);
    expect(
      await body(await t.api.money.imports.$get({ query: { bookId: String(book.id) } })),
    ).toMatchObject([
      {
        id: done.importId,
        account: { id: account.id, name: "Checking" },
        source: "csv",
        fileName: "january.csv",
        created: 2,
        duplicates: 0,
        remaining: 2,
        undoneAt: null,
      },
    ]);
  });

  it("skip rows already in the account, counting repeats", async () => {
    const { account } = await setup();
    // Entered by hand earlier: one coffee on the 5th.
    await body(
      await t.api.money.transactions.$post({
        json: { accountId: account.id, date: "2030-01-05", amountCents: -425, payee: "Cafe" },
      }),
    );
    const file = {
      accountId: account.id,
      source: "csv" as const,
      transactions: [
        tx("2030-01-05", -425, "CAFE "),
        tx("2030-01-05", -425, "Cafe"),
        tx("2030-01-07", -1_000, "Bookshop"),
      ],
    };
    const first = await run(file);
    expect(first.rows.map((row) => row.outcome)).toEqual(["duplicate", "create", "create"]);

    // The same file again: everything is already there.
    const again = await run(file, true);
    expect(again).toMatchObject({ created: 0, duplicates: 3 });

    // An overlapping file only adds what's new.
    const next = await run({
      ...file,
      transactions: [tx("2030-01-07", -1_000, "Bookshop"), tx("2030-01-09", -300, "Bakery")],
    });
    expect(next).toMatchObject({ created: 1, duplicates: 1 });
  });

  it("need an account that exists and at least one transaction", async () => {
    await setup();
    const missing = await failure(
      await t.api.money.imports.$post({
        query: {},
        json: { accountId: 99, source: "csv", transactions: [tx("2030-01-01", -1, "A")] },
      }),
    );
    expect(missing).toMatchObject({ status: 400 });
    expect(missing.error).toContain("account doesn't exist");
    const empty = await failure(
      await t.api.money.imports.$post({
        query: {},
        json: { accountId: 1, source: "csv", transactions: [] },
      }),
    );
    expect(empty).toMatchObject({ status: 400 });
  });
});

describe("OFX imports", () => {
  it("recognise the bank's ids, even when the payee text changes", async () => {
    const { account } = await setup();
    const statement = {
      accountId: account.id,
      source: "ofx" as const,
      transactions: [
        tx("2030-01-05", -4_250, "CORNER GROCERY", { externalId: "A1" }),
        tx("2030-01-06", 150_000, "PAYROLL", { externalId: "A2" }),
      ],
    };
    expect(await run(statement)).toMatchObject({ created: 2 });
    const renamed = await run(
      {
        ...statement,
        transactions: [
          tx("2030-01-05", -4_250, "Corner Grocery #12", { externalId: "A1" }),
          tx("2030-01-08", -999, "Streaming", { externalId: "A3" }),
        ],
      },
      true,
    );
    expect(renamed.rows.map((row) => row.outcome)).toEqual(["duplicate", "create"]);
  });

  it("match a transaction entered by hand before the statement arrived", async () => {
    const { account } = await setup();
    await body(
      await t.api.money.transactions.$post({
        json: { accountId: account.id, date: "2030-01-05", amountCents: -425, payee: "Cafe" },
      }),
    );
    const result = await run(
      {
        accountId: account.id,
        source: "ofx",
        transactions: [tx("2030-01-05", -425, "cafe", { externalId: "B1" })],
      },
      true,
    );
    expect(result).toMatchObject({ created: 0, duplicates: 1 });
  });
});

describe("undoing an import", () => {
  it("removes what it added, once, and frees the account to be deleted", async () => {
    const { book, account } = await setup();
    const done = await run({
      accountId: account.id,
      source: "csv",
      transactions: [tx("2030-01-05", -4_250, "Corner grocery"), tx("2030-01-06", 900, "Refund")],
    });
    const importId = done.importId ?? 0;
    // Edited after importing; still part of the import.
    const [edited] = (
      await body(await t.api.money.transactions.$get({ query: { bookId: String(book.id) } }))
    ).transactions;
    await body(
      await t.api.money.transactions[":id"].$patch({
        param: { id: String(edited?.id) },
        json: { memo: "Checked" },
      }),
    );
    expect(await balance(book.id)).toBe(6_650);

    const undone = await body(
      await t.api.money.imports[":id"].undo.$post({ param: { id: String(importId) } }),
    );
    expect(undone).toMatchObject({ created: 2, remaining: 0, undoneAt: expect.any(String) });
    expect(await balance(book.id)).toBe(10_000);

    const twice = await failure(
      await t.api.money.imports[":id"].undo.$post({ param: { id: String(importId) } }),
    );
    expect(twice).toMatchObject({ status: 409 });
    expect(twice.error).toContain("already undone");

    const deleted = await t.api.money.accounts[":id"].$delete({
      param: { id: String(account.id) },
    });
    expect(deleted.status).toBe(204);
    expect(
      await body(await t.api.money.imports.$get({ query: { bookId: String(book.id) } })),
    ).toEqual([]);
  });
});
