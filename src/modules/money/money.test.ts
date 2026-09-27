import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { BookCreate, CategoryKind } from "../../shared/books";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const param = (id: number) => ({ param: { id: String(id) } });
const addBook = async (json: BookCreate) => body(await t.api.money.books.$post({ json }));
const addAccount = async (bookId: number, name: string, openingBalanceCents = 0) =>
  body(
    await t.api.money.accounts.$post({
      json: { bookId, name, kind: "checking", openingBalanceCents },
    }),
  );
const addCategory = async (bookId: number, name: string, kind: CategoryKind = "expense") =>
  body(await t.api.money.categories.$post({ json: { bookId, name, kind } }));
const addTransaction = async (
  accountId: number,
  amountCents: number,
  fields: { date?: string; payee?: string; memo?: string; categoryId?: number | null } = {},
) =>
  body(
    await t.api.money.transactions.$post({
      json: { accountId, amountCents, date: fields.date ?? "2030-01-15", ...fields },
    }),
  );
const accountsOf = async (bookId: number) =>
  body(await t.api.money.accounts.$get({ query: { bookId: String(bookId) } }));
const categoriesOf = async (bookId: number) =>
  body(await t.api.money.categories.$get({ query: { bookId: String(bookId) } }));
const transactionsOf = async (query: Record<string, string>) =>
  body(await t.api.money.transactions.$get({ query: query as { bookId: string } }));

describe("books", () => {
  it("start with editable categories for their kind, and keep names unique", async () => {
    const personal = await addBook({ name: "Personal", kind: "personal", starterCategories: true });
    expect(personal).toEqual({
      id: personal.id,
      name: "Personal",
      kind: "personal",
      archived: false,
      accountCount: 0,
    });
    const categories = await categoriesOf(personal.id);
    expect(categories[0]).toMatchObject({ name: "Groceries", kind: "expense" });
    expect(categories.at(-1)).toMatchObject({ name: "Other income", kind: "income" });

    const business = await addBook({ name: "Business", kind: "business" });
    expect(await categoriesOf(business.id)).toEqual([]);

    const duplicate = await failure(
      await t.api.money.books.$post({ json: { name: "PERSONAL", kind: "business" } }),
    );
    expect(duplicate).toMatchObject({ status: 409 });
    expect(duplicate.error).toContain('already a book called "PERSONAL"');
  });

  it("are archived, not deleted, once they have accounts", async () => {
    const book = await addBook({ name: "Personal", kind: "personal", starterCategories: true });
    await addAccount(book.id, "Checking");
    const inUse = await failure(await t.api.money.books[":id"].$delete(param(book.id)));
    expect(inUse).toMatchObject({ status: 409 });
    expect(inUse.error).toContain("Archive it instead");

    const archived = await body(
      await t.api.money.books[":id"].$patch({ ...param(book.id), json: { archived: true } }),
    );
    expect(archived).toMatchObject({ archived: true, accountCount: 1 });

    const empty = await addBook({
      name: "Side project",
      kind: "business",
      starterCategories: true,
    });
    expect((await t.api.money.books[":id"].$delete(param(empty.id))).status).toBe(204);
    expect((await body(await t.api.money.books.$get())).map((b) => b.name)).toEqual(["Personal"]);
  });
});

describe("accounts", () => {
  it("add their transactions to the opening balance", async () => {
    const book = await addBook({ name: "Personal", kind: "personal" });
    const card = await addAccount(book.id, "Credit card", -25_000);
    expect(card).toMatchObject({ balanceCents: -25_000, transactionCount: 0 });

    await addTransaction(card.id, -4_250);
    await addTransaction(card.id, 10_000);
    const [updated] = await accountsOf(book.id);
    expect(updated).toMatchObject({
      name: "Credit card",
      openingBalanceCents: -25_000,
      balanceCents: -19_250,
      transactionCount: 2,
    });
  });

  it("keep names unique within a book and can't be deleted with transactions", async () => {
    const personal = await addBook({ name: "Personal", kind: "personal" });
    const business = await addBook({ name: "Business", kind: "business" });
    const checking = await addAccount(personal.id, "Checking");
    await addAccount(business.id, "Checking");
    const duplicate = await failure(
      await t.api.money.accounts.$post({
        json: { bookId: personal.id, name: "checking", kind: "savings" },
      }),
    );
    expect(duplicate).toMatchObject({ status: 409 });

    await addTransaction(checking.id, 500);
    const inUse = await failure(await t.api.money.accounts[":id"].$delete(param(checking.id)));
    expect(inUse).toMatchObject({ status: 409 });
    expect(inUse.error).toContain("Archive it instead");

    const renamed = await body(
      await t.api.money.accounts[":id"].$patch({
        ...param(checking.id),
        json: { name: "Everyday", institution: "Example Bank", archived: true },
      }),
    );
    expect(renamed).toMatchObject({
      name: "Everyday",
      institution: "Example Bank",
      archived: true,
      balanceCents: 500,
    });
  });

  it("need a book that exists", async () => {
    const missing = await failure(
      await t.api.money.accounts.$post({ json: { bookId: 99, name: "Cash", kind: "cash" } }),
    );
    expect(missing).toMatchObject({ status: 400 });
    expect(missing.error).toContain("book doesn't exist");
    expect((await t.api.money.accounts.$get({ query: { bookId: "99" } })).status).toBe(404);
  });
});

describe("categories", () => {
  it("are archived, not deleted, once transactions use them", async () => {
    const book = await addBook({ name: "Personal", kind: "personal" });
    const account = await addAccount(book.id, "Checking");
    const groceries = await addCategory(book.id, "Groceries");
    const unused = await addCategory(book.id, "Unused");
    const paycheck = await addCategory(book.id, "Paycheck", "income");
    expect(
      (
        await failure(
          await t.api.money.categories.$post({
            json: { bookId: book.id, name: "GROCERIES", kind: "income" },
          }),
        )
      ).status,
    ).toBe(409);

    await addTransaction(account.id, -2_000, { categoryId: groceries.id });
    const inUse = await failure(await t.api.money.categories[":id"].$delete(param(groceries.id)));
    expect(inUse).toMatchObject({ status: 409 });
    expect((await t.api.money.categories[":id"].$delete(param(unused.id))).status).toBe(204);

    const archived = await body(
      await t.api.money.categories[":id"].$patch({
        ...param(groceries.id),
        json: { archived: true },
      }),
    );
    expect(archived).toMatchObject({ archived: true, transactionCount: 1 });
    // Spending first, then income; archived last within each.
    expect((await categoriesOf(book.id)).map((c) => [c.name, c.transactionCount])).toEqual([
      ["Groceries", 1],
      ["Paycheck", 0],
    ]);
    expect(paycheck.kind).toBe("income");
  });
});

describe("transactions", () => {
  it("only take a category from the account's book", async () => {
    const personal = await addBook({ name: "Personal", kind: "personal" });
    const business = await addBook({ name: "Business", kind: "business" });
    const checking = await addAccount(personal.id, "Checking");
    const shopAccount = await addAccount(business.id, "Shop checking");
    const supplies = await addCategory(business.id, "Supplies");
    const groceries = await addCategory(personal.id, "Groceries");

    const wrongBook = await failure(
      await t.api.money.transactions.$post({
        json: {
          accountId: checking.id,
          date: "2030-01-02",
          amountCents: -500,
          categoryId: supplies.id,
        },
      }),
    );
    expect(wrongBook).toMatchObject({ status: 400 });
    expect(wrongBook.error).toContain("belongs to another book");

    const bought = await addTransaction(checking.id, -500, { categoryId: groceries.id });
    // Moving it to the other book's account needs a category from that book.
    const moved = await failure(
      await t.api.money.transactions[":id"].$patch({
        ...param(bought.id),
        json: { accountId: shopAccount.id },
      }),
    );
    expect(moved).toMatchObject({ status: 400 });
    const recategorized = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(bought.id),
        json: { accountId: shopAccount.id, categoryId: supplies.id, payee: "Corner store" },
      }),
    );
    expect(recategorized).toMatchObject({
      account: { id: shopAccount.id, name: "Shop checking" },
      category: { id: supplies.id, name: "Supplies", kind: "expense" },
      payee: "Corner store",
      amountCents: -500,
    });
  });

  it("need an amount and a real date", async () => {
    const book = await addBook({ name: "Personal", kind: "personal" });
    const account = await addAccount(book.id, "Checking");
    const zero = await failure(
      await t.api.money.transactions.$post({
        json: { accountId: account.id, date: "2030-01-02", amountCents: 0 },
      }),
    );
    expect(zero).toMatchObject({ status: 400 });
    // The reason is in the validation issues.
    expect(JSON.stringify(zero)).toContain("Enter an amount other than $0.");
    const badDate = await failure(
      await t.api.money.transactions.$post({
        json: { accountId: account.id, date: "2030-02-30", amountCents: 100 },
      }),
    );
    expect(badDate).toMatchObject({ status: 400 });
  });

  it("list newest first with filters, search, paging, and totals", async () => {
    const book = await addBook({ name: "Personal", kind: "personal" });
    const other = await addBook({ name: "Other", kind: "personal" });
    const checking = await addAccount(book.id, "Checking");
    const cash = await addAccount(book.id, "Cash");
    const elsewhere = await addAccount(other.id, "Elsewhere");
    const dining = await addCategory(book.id, "Dining out");

    await addTransaction(checking.id, 250_000, { date: "2030-01-01", payee: "Paycheck" });
    await addTransaction(checking.id, -1_850, {
      date: "2030-01-05",
      payee: "Corner cafe",
      categoryId: dining.id,
    });
    await addTransaction(cash.id, -600, { date: "2030-01-05", payee: "Farm stand" });
    await addTransaction(checking.id, -9_900, {
      date: "2030-02-01",
      payee: "Phone bill",
      memo: "50% off promo",
    });
    await addTransaction(elsewhere.id, -100, { date: "2030-01-10", payee: "Not this book" });

    const all = await transactionsOf({ bookId: String(book.id) });
    expect(all.transactions.map((row) => row.payee)).toEqual([
      "Phone bill",
      "Farm stand",
      "Corner cafe",
      "Paycheck",
    ]);
    expect(all).toMatchObject({ total: 4, inCents: 250_000, outCents: -12_350 });

    const page = await transactionsOf({ bookId: String(book.id), limit: "2", offset: "2" });
    expect(page.transactions.map((row) => row.payee)).toEqual(["Corner cafe", "Paycheck"]);
    expect(page.total).toBe(4);

    const inCash = await transactionsOf({ bookId: String(book.id), accountId: String(cash.id) });
    expect(inCash.transactions.map((row) => row.payee)).toEqual(["Farm stand"]);

    const uncategorized = await transactionsOf({ bookId: String(book.id), categoryId: "none" });
    expect(uncategorized.total).toBe(3);
    const dined = await transactionsOf({ bookId: String(book.id), categoryId: String(dining.id) });
    expect(dined.transactions.map((row) => row.payee)).toEqual(["Corner cafe"]);

    const january = await transactionsOf({
      bookId: String(book.id),
      from: "2030-01-02",
      to: "2030-01-31",
    });
    expect(january.total).toBe(2);

    // Search covers payees and memos, ignores case, and treats % literally.
    expect((await transactionsOf({ bookId: String(book.id), q: "CORNER" })).total).toBe(1);
    expect((await transactionsOf({ bookId: String(book.id), q: "50%" })).total).toBe(1);
    expect((await transactionsOf({ bookId: String(book.id), q: "%" })).total).toBe(1);
  });

  it("can be deleted", async () => {
    const book = await addBook({ name: "Personal", kind: "personal" });
    const account = await addAccount(book.id, "Checking", 1_000);
    const spent = await addTransaction(account.id, -300);
    expect((await t.api.money.transactions[":id"].$delete(param(spent.id))).status).toBe(204);
    expect((await accountsOf(book.id))[0]).toMatchObject({ balanceCents: 1_000 });
    expect((await t.api.money.transactions[":id"].$delete(param(spent.id))).status).toBe(404);
  });
});
