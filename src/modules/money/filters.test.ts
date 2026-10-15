import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

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
  const checking = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Checking", kind: "checking" },
    }),
  );
  const add = async (date: string, amountCents: number, payee: string, categoryId?: number) =>
    body(
      await t.api.money.transactions.$post({
        json: { accountId: checking.id, date, amountCents, payee, categoryId },
      }),
    );
  await add("2030-01-05", -4_500, "Corner grocery", category("Groceries"));
  await add("2030-01-20", 200_000, "Example Employer", category("Paycheck"));
  await add("2030-02-10", -12_000, "Power company", category("Utilities"));
  await add("2030-02-14", -900, "Coffee shop");
  await add("2030-03-01", 1_840, "Bank interest", category("Interest"));
  return { book, category, add };
}

const list = async (bookId: number, query: Record<string, string>) =>
  body(
    await t.api.money.transactions.$get({
      query: { bookId: String(bookId), ...query },
    }),
  );
const payees = (page: { transactions: Array<{ payee: string }> }) =>
  page.transactions.map((row) => row.payee);

describe("sorting transactions", () => {
  it("goes newest first unless asked, and by size either way", async () => {
    const { book } = await setup();
    expect(payees(await list(book.id, {}))[0]).toBe("Bank interest");
    expect(payees(await list(book.id, { sort: "oldest" }))).toEqual([
      "Corner grocery",
      "Example Employer",
      "Power company",
      "Coffee shop",
      "Bank interest",
    ]);
    // Size ignores whether money came in or went out.
    expect(payees(await list(book.id, { sort: "largest" }))).toEqual([
      "Example Employer",
      "Power company",
      "Corner grocery",
      "Bank interest",
      "Coffee shop",
    ]);
    expect(payees(await list(book.id, { sort: "smallest" }))[0]).toBe("Coffee shop");
  });

  it("refuses a sort it doesn't have", async () => {
    const { book } = await setup();
    const response = await t.api.money.transactions.$get({
      query: { bookId: String(book.id), sort: "random" as never },
    });
    expect((await failure(response)).status).toBe(400);
  });
});

describe("filtering transactions", () => {
  it("keeps to a range of sizes, money in or out", async () => {
    const { book } = await setup();
    expect(payees(await list(book.id, { minCents: "4500", sort: "oldest" }))).toEqual([
      "Corner grocery",
      "Example Employer",
      "Power company",
    ]);
    expect(payees(await list(book.id, { maxCents: "1000", sort: "oldest" }))).toEqual([
      "Coffee shop",
    ]);
    expect(
      payees(await list(book.id, { minCents: "1000", maxCents: "5000", sort: "oldest" })),
    ).toEqual(["Corner grocery", "Bank interest"]);
  });

  it("keeps to a range of dates, both ends included", async () => {
    const { book } = await setup();
    const page = await list(book.id, { from: "2030-01-20", to: "2030-02-10", sort: "oldest" });
    expect(payees(page)).toEqual(["Example Employer", "Power company"]);
    // The totals follow the filters.
    expect([page.total, page.inCents, page.outCents]).toEqual([2, 200_000, -12_000]);
  });

  it("keeps to several categories at once, with uncategorized as one of them", async () => {
    const { book, category } = await setup();
    const picked = `${category("Groceries")},${category("Utilities")},none`;
    expect(payees(await list(book.id, { categories: picked, sort: "oldest" }))).toEqual([
      "Corner grocery",
      "Power company",
      "Coffee shop",
    ]);
    // One category still works the way it did.
    expect(payees(await list(book.id, { categoryId: String(category("Paycheck")) }))).toEqual([
      "Example Employer",
    ]);
    expect(payees(await list(book.id, { categories: "transfer" }))).toEqual([]);
  });

  it("combines with search, and says how big the biggest amount is", async () => {
    const { book } = await setup();
    const page = await list(book.id, { q: "example", minCents: "1" });
    expect(payees(page)).toEqual(["Example Employer"]);
    // The slider's scale doesn't shrink as filters narrow the list.
    expect(page.largestCents).toBe(200_000);
  });

  it("refuses a category that isn't one", async () => {
    const { book } = await setup();
    const response = await t.api.money.transactions.$get({
      query: { bookId: String(book.id), categories: "3,groceries" },
    });
    expect((await failure(response)).status).toBe(400);
  });
});
