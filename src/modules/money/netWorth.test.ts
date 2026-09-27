import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const book = async (name: string, kind: "personal" | "business" = "personal") =>
  body(await t.api.money.books.$post({ json: { name, kind } }));
const account = async (
  bookId: number,
  name: string,
  kind: "checking" | "savings" | "loan" | "investment" | "credit_card",
  openingBalanceCents = 0,
) => body(await t.api.money.accounts.$post({ json: { bookId, name, kind, openingBalanceCents } }));
const add = async (accountId: number, date: string, amountCents: number) =>
  body(await t.api.money.transactions.$post({ json: { accountId, date, amountCents } }));
const worth = async (query: { to: string; months?: string; bookId?: string }) =>
  body(await t.api.money["net-worth"].$get({ query }));

describe("net worth", () => {
  it("adds up every account at the end of each month, from the first month with data", async () => {
    const personal = await book("Personal");
    const checking = await account(personal.id, "Checking", "checking", 1_000);
    const loan = await account(personal.id, "Car loan", "loan", -5_000);
    await add(checking.id, "2030-01-10", 500);
    await add(checking.id, "2030-02-03", -200);
    await add(loan.id, "2030-02-28", 1_000);
    // After "today": left out of February, but in today's point like the account list.
    await add(checking.id, "2030-03-20", 100);

    const result = await worth({ to: "2030-03-15" });
    expect(result.points).toEqual([
      {
        month: "2030-01",
        date: "2030-01-31",
        assetsCents: 1_500,
        debtsCents: 5_000,
        netCents: -3_500,
      },
      {
        month: "2030-02",
        date: "2030-02-28",
        assetsCents: 1_300,
        debtsCents: 4_000,
        netCents: -2_700,
      },
      {
        month: "2030-03",
        date: "2030-03-15",
        assetsCents: 1_400,
        debtsCents: 4_000,
        netCents: -2_600,
      },
    ]);
    // Today's point matches the balances the Money page shows.
    const listed = await body(
      await t.api.money.accounts.$get({ query: { bookId: String(personal.id) } }),
    );
    expect(listed.reduce((sum, row) => sum + row.balanceCents, 0)).toBe(-2_600);
    expect(result.accounts.map((row) => [row.name, row.balanceCents])).toEqual([
      ["Checking", 1_400],
      ["Car loan", -4_000],
    ]);
    expect(result.accountCount).toBe(2);
  });

  it("uses entered balances from their date on", async () => {
    const personal = await book("Personal");
    const retirement = await account(personal.id, "Retirement", "investment");
    await t.api.money.accounts[":id"].snapshots.$put({
      param: { id: String(retirement.id) },
      json: { date: "2030-02-15", balanceCents: 10_000 },
    });
    await add(retirement.id, "2030-02-10", 999); // before the entered balance: already in it
    await add(retirement.id, "2030-02-20", 50);
    await add(retirement.id, "2030-03-05", 25);

    const result = await worth({ to: "2030-03-31" });
    expect(result.points.map((point) => [point.month, point.netCents])).toEqual([
      ["2030-02", 10_050],
      ["2030-03", 10_075],
    ]);
  });

  it("uses an account's first entered balance for earlier months when it has no transactions", async () => {
    const personal = await book("Personal");
    const retirement = await account(personal.id, "Retirement", "investment");
    const savings = await account(personal.id, "Savings", "savings", 500);
    const snapshot = (accountId: number, date: string, balanceCents: number) =>
      t.api.money.accounts[":id"].snapshots.$put({
        param: { id: String(accountId) },
        json: { date, balanceCents },
      });
    await snapshot(retirement.id, "2030-02-15", 10_000);
    await snapshot(retirement.id, "2030-03-10", 12_000);
    // Savings has transactions before its entered balance, so those count until then.
    await add(savings.id, "2030-01-05", 100);
    await snapshot(savings.id, "2030-03-01", 2_000);

    const result = await worth({ to: "2030-03-31" });
    expect(result.points.map((point) => [point.month, point.netCents])).toEqual([
      ["2030-01", 10_000 + 600],
      ["2030-02", 10_000 + 600],
      ["2030-03", 12_000 + 2_000],
    ]);
  });

  it("covers the chosen range when the data goes back further", async () => {
    const personal = await book("Personal");
    const checking = await account(personal.id, "Checking", "checking");
    await add(checking.id, "2025-06-01", 100);

    const year = await worth({ to: "2030-03-15" });
    expect(year.points).toHaveLength(12);
    expect(year.points[0]).toMatchObject({ month: "2029-04", netCents: 100 });
    expect((await worth({ to: "2030-03-15", months: "36" })).points[0]?.month).toBe("2027-04");
    expect((await worth({ to: "2030-03-15", months: "60" })).points[0]?.month).toBe("2025-06");
  });

  it("can cover one book, and leaves archived books out of the total", async () => {
    const personal = await book("Personal");
    const business = await book("Shop", "business");
    const old = await book("Old");
    await account(personal.id, "Checking", "checking", 1_000);
    await account(business.id, "Shop checking", "checking", 300);
    await account(old.id, "Closed", "checking", 7);
    await t.api.money.books[":id"].$patch({
      param: { id: String(old.id) },
      json: { archived: true },
    });
    // An archived account still counts: its past balances were real.
    const card = await account(personal.id, "Card", "credit_card", -250);
    await t.api.money.accounts[":id"].$patch({
      param: { id: String(card.id) },
      json: { archived: true },
    });

    const all = await worth({ to: "2030-03-15" });
    expect(all.points).toEqual([
      {
        month: "2030-03",
        date: "2030-03-15",
        assetsCents: 1_300,
        debtsCents: 250,
        netCents: 1_050,
      },
    ]);
    expect(all.accounts.map((row) => [row.bookName, row.name])).toEqual([
      ["Personal", "Checking"],
      ["Personal", "Card"],
      ["Shop", "Shop checking"],
    ]);
    expect(all.accounts[1]?.archived).toBe(true);

    const shop = await worth({ to: "2030-03-15", bookId: String(business.id) });
    expect(shop.points.at(-1)?.netCents).toBe(300);
    expect(shop.accountCount).toBe(1);
  });

  it("is a single zero point with no accounts", async () => {
    expect(await worth({ to: "2030-03-15" })).toEqual({
      points: [
        { month: "2030-03", date: "2030-03-15", assetsCents: 0, debtsCents: 0, netCents: 0 },
      ],
      accounts: [],
      accountCount: 0,
    });
  });

  it("rejects a missing book or an unknown range", async () => {
    expect(
      (await t.api.money["net-worth"].$get({ query: { to: "2030-03-15", bookId: "999" } })).status,
    ).toBe(404);
    const bad = await failure(
      await t.api.money["net-worth"].$get({ query: { to: "2030-03-15", months: "7" } }),
    );
    expect(bad.status).toBe(400);
    expect(bad.error).toContain("12, 36, or 60");
  });
});
