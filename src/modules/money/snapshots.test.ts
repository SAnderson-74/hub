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
      json: { bookId: book.id, name: "Retirement", kind: "investment", openingBalanceCents: 1_000 },
    }),
  );
  return { book, account };
};

const param = (id: number) => ({ param: { id: String(id) } });
const snapshot = async (accountId: number, date: string, balanceCents: number, note?: string) =>
  body(
    await t.api.money.accounts[":id"].snapshots.$put({
      ...param(accountId),
      json: { date, balanceCents, ...(note ? { note } : {}) },
    }),
  );
const add = async (accountId: number, date: string, amountCents: number) =>
  body(await t.api.money.transactions.$post({ json: { accountId, date, amountCents } }));
const balanceOf = async (bookId: number) =>
  (await body(await t.api.money.accounts.$get({ query: { bookId: String(bookId) } })))[0];

describe("balance snapshots", () => {
  it("set the balance, with later transactions added on top", async () => {
    const { book, account } = await setup();
    await add(account.id, "2030-01-10", 500);
    expect(await balanceOf(book.id)).toMatchObject({
      balanceCents: 1_500,
      latestSnapshot: null,
      snapshotCount: 0,
    });

    await snapshot(account.id, "2030-01-31", 2_500_000, "January statement");
    // The transaction on the 10th is before the snapshot, so it's already in it.
    expect(await balanceOf(book.id)).toMatchObject({
      balanceCents: 2_500_000,
      latestSnapshot: { date: "2030-01-31", balanceCents: 2_500_000 },
      snapshotCount: 1,
    });

    await add(account.id, "2030-02-05", 50_000);
    await add(account.id, "2030-01-31", 99); // same day as the snapshot: already counted
    expect((await balanceOf(book.id))?.balanceCents).toBe(2_550_000);

    // A newer snapshot takes over; an older one doesn't.
    await snapshot(account.id, "2030-02-28", 2_600_000);
    await snapshot(account.id, "2029-12-31", 1);
    const history = await body(await t.api.money.accounts[":id"].history.$get(param(account.id)));
    expect(history.account).toMatchObject({ balanceCents: 2_600_000, snapshotCount: 3 });
    expect(history.snapshots.map((row) => [row.date, row.note])).toEqual([
      ["2030-02-28", ""],
      ["2030-01-31", "January statement"],
      ["2029-12-31", ""],
    ]);
  });

  it("replace one already entered for the same day, and can be deleted", async () => {
    const { book, account } = await setup();
    await snapshot(account.id, "2030-01-31", 100);
    const replaced = await snapshot(account.id, "2030-01-31", -25_000, "Loan balance");
    expect(replaced.snapshots).toEqual([
      { id: expect.any(Number), date: "2030-01-31", balanceCents: -25_000, note: "Loan balance" },
    ]);
    const after = await body(
      await t.api.money.snapshots[":id"].$delete(param(replaced.snapshots[0]?.id ?? 0)),
    );
    expect(after.snapshots).toEqual([]);
    expect(await balanceOf(book.id)).toMatchObject({ balanceCents: 1_000, latestSnapshot: null });
  });

  it("keep an account from being deleted, like transactions do", async () => {
    const { account } = await setup();
    await snapshot(account.id, "2030-01-31", 100);
    const blocked = await failure(await t.api.money.accounts[":id"].$delete(param(account.id)));
    expect(blocked).toMatchObject({ status: 409 });
    expect(blocked.error).toContain("balance history");
    expect(
      (
        await t.api.money.accounts[":id"].snapshots.$put({
          ...param(999),
          json: { date: "2030-01-01", balanceCents: 1 },
        })
      ).status,
    ).toBe(404);
  });
});

describe("all accounts", () => {
  it("lists every book's accounts with the book's name", async () => {
    const { account } = await setup();
    const other = await body(
      await t.api.money.books.$post({ json: { name: "Business", kind: "business" } }),
    );
    await body(
      await t.api.money.accounts.$post({
        json: { bookId: other.id, name: "Shop checking", kind: "checking" },
      }),
    );
    const all = await body(await t.api.money["all-accounts"].$get());
    expect(all.map((row) => [row.bookName, row.name])).toEqual([
      ["Personal", "Retirement"],
      ["Business", "Shop checking"],
    ]);
    expect(all[0]?.id).toBe(account.id);
  });
});
