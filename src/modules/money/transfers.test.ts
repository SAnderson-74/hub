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
  const account = async (name: string, openingBalanceCents = 0) =>
    body(
      await t.api.money.accounts.$post({
        json: { bookId: book.id, name, kind: "checking", openingBalanceCents },
      }),
    );
  const dining = await body(
    await t.api.money.categories.$post({
      json: { bookId: book.id, name: "Dining out", kind: "expense" },
    }),
  );
  return {
    book,
    checking: await account("Checking", 100_000),
    savings: await account("Savings"),
    dining,
  };
};

const param = (id: number) => ({ param: { id: String(id) } });
const add = async (accountId: number, date: string, amountCents: number, payee = "") =>
  body(await t.api.money.transactions.$post({ json: { accountId, date, amountCents, payee } }));
const balances = async (bookId: number) =>
  Object.fromEntries(
    (await body(await t.api.money.accounts.$get({ query: { bookId: String(bookId) } }))).map(
      (account) => [account.name, account.balanceCents],
    ),
  );
const list = async (query: Record<string, string>) =>
  body(await t.api.money.transactions.$get({ query: query as { bookId: string } }));

describe("transfers", () => {
  it("move money between accounts without counting as spending or income", async () => {
    const { book, checking, savings } = await setup();
    const transfer = await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          date: "2030-01-10",
          amountCents: 50_000,
          memo: "Rainy day",
        },
      }),
    );
    expect(transfer.from).toMatchObject({
      account: { id: checking.id },
      amountCents: -50_000,
      payee: "Transfer to Savings",
      memo: "Rainy day",
      category: null,
      transfer: { transactionId: transfer.to.id, account: { id: savings.id, name: "Savings" } },
    });
    expect(transfer.to).toMatchObject({
      amountCents: 50_000,
      payee: "Transfer from Checking",
      transfer: { transactionId: transfer.from.id, account: { name: "Checking" } },
    });
    expect(await balances(book.id)).toEqual({ Checking: 50_000, Savings: 50_000 });

    await add(checking.id, "2030-01-11", -2_000, "Cafe");
    const all = await list({ bookId: String(book.id) });
    expect(all).toMatchObject({ total: 3, inCents: 0, outCents: -2_000, transferCount: 2 });
    expect((await list({ bookId: String(book.id), categoryId: "transfer" })).total).toBe(2);
    expect((await list({ bookId: String(book.id), categoryId: "none" })).total).toBe(1);

    const same = await failure(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: checking.id,
          date: "2030-01-10",
          amountCents: 1,
        },
      }),
    );
    expect(same).toMatchObject({ status: 400 });
  });

  it("keep both sides in step: edits are limited, and deleting removes both", async () => {
    const { book, checking, savings, dining } = await setup();
    const { from } = await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          date: "2030-01-10",
          amountCents: 5_000,
        },
      }),
    );
    for (const json of [
      { amountCents: -6_000 },
      { categoryId: dining.id },
      { accountId: savings.id },
    ]) {
      const blocked = await failure(
        await t.api.money.transactions[":id"].$patch({ ...param(from.id), json }),
      );
      expect(blocked).toMatchObject({ status: 409 });
      expect(blocked.error).toContain("Unlink the transfer");
    }
    // The sheet sends every field; unchanged ones are fine.
    const saved = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(from.id),
        json: {
          accountId: checking.id,
          amountCents: -5_000,
          categoryId: null,
          date: "2030-01-11",
          memo: "Moved a day",
        },
      }),
    );
    expect(saved).toMatchObject({ date: "2030-01-11", memo: "Moved a day" });

    expect((await t.api.money.transactions[":id"].$delete(param(from.id))).status).toBe(204);
    expect((await list({ bookId: String(book.id) })).total).toBe(0);
    expect(await balances(book.id)).toEqual({ Checking: 100_000, Savings: 0 });
  });

  it("can be unlinked into two ordinary transactions", async () => {
    const { book, checking, savings } = await setup();
    const { from } = await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          date: "2030-01-10",
          amountCents: 5_000,
        },
      }),
    );
    const unlinked = await body(await t.api.money.transactions[":id"].unlink.$post(param(from.id)));
    expect(unlinked.transfer).toBeNull();
    const page = await list({ bookId: String(book.id) });
    expect(page).toMatchObject({ total: 2, transferCount: 0, inCents: 5_000, outCents: -5_000 });
    expect(
      (await failure(await t.api.money.transactions[":id"].unlink.$post(param(from.id)))).status,
    ).toBe(400);
  });
});

describe("linking imported transactions as transfers", () => {
  it("suggests pairs, links them, and clears their categories", async () => {
    const { book, checking, savings, dining } = await setup();
    const out = await add(checking.id, "2030-01-05", -25_000, "ONLINE TRANSFER TO SAV");
    const into = await add(savings.id, "2030-01-07", 25_000, "TRANSFER FROM CHK");
    await add(checking.id, "2030-01-06", -1_500, "Lunch");
    await add(savings.id, "2030-01-06", 1_500, "Friend paid back"); // pairs too: they decide

    const suggestions = await body(
      await t.api.money.transfers.suggestions.$get({ query: { bookId: String(book.id) } }),
    );
    expect(suggestions.map((pair) => [pair.from.payee, pair.to.payee])).toEqual([
      ["ONLINE TRANSFER TO SAV", "TRANSFER FROM CHK"],
      ["Lunch", "Friend paid back"],
    ]);

    // Categorizing either side says "not a transfer".
    const lunch = suggestions[1]?.from.id ?? 0;
    await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(lunch),
        json: { categoryId: dining.id },
      }),
    );
    const matches = await body(
      await t.api.money.transactions[":id"]["transfer-matches"].$get(param(out.id)),
    );
    expect(matches.map((row) => row.id)).toEqual([into.id]);

    const linked = await body(
      await t.api.money.transfers.link.$post({ json: { transactionIds: [into.id, out.id] } }),
    );
    expect(linked.from.id).toBe(out.id);
    expect(linked.to.transfer?.account.name).toBe("Checking");
    expect(
      await body(
        await t.api.money.transfers.suggestions.$get({ query: { bookId: String(book.id) } }),
      ),
    ).toEqual([]);

    const again = await failure(
      await t.api.money.transfers.link.$post({ json: { transactionIds: [out.id, into.id] } }),
    );
    expect(again).toMatchObject({ status: 409 });
  });

  it("need opposite amounts in two different accounts", async () => {
    const { checking, savings } = await setup();
    const a = await add(checking.id, "2030-01-05", -100);
    const b = await add(checking.id, "2030-01-05", 100);
    const c = await add(savings.id, "2030-01-05", 99);
    const sameAccount = await failure(
      await t.api.money.transfers.link.$post({ json: { transactionIds: [a.id, b.id] } }),
    );
    expect(sameAccount).toMatchObject({ status: 400 });
    const mismatch = await failure(
      await t.api.money.transfers.link.$post({ json: { transactionIds: [a.id, c.id] } }),
    );
    expect(mismatch).toMatchObject({ status: 400 });
    expect(mismatch.error).toContain("same amount");
  });

  it("leave the other side when an import is undone", async () => {
    const { book, checking, savings } = await setup();
    const imported = await body(
      await t.api.money.imports.$post({
        query: {},
        json: {
          accountId: checking.id,
          source: "csv",
          transactions: [
            { date: "2030-01-05", amountCents: -25_000, payee: "TRANSFER TO SAV", memo: "" },
          ],
        },
      }),
    );
    const into = await add(savings.id, "2030-01-05", 25_000, "From checking");
    const [out] = (await list({ bookId: String(book.id), accountId: String(checking.id) }))
      .transactions;
    await body(
      await t.api.money.transfers.link.$post({ json: { transactionIds: [out?.id ?? 0, into.id] } }),
    );
    await body(await t.api.money.imports[":id"].undo.$post(param(imported.importId ?? 0)));
    const left = await list({ bookId: String(book.id) });
    expect(left.transactions).toMatchObject([{ id: into.id, transfer: null }]);
  });
});
