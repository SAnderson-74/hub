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
  const card = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Card", kind: "credit_card" },
    }),
  );
  const cash = await body(
    await t.api.money.accounts.$post({ json: { bookId: book.id, name: "Cash", kind: "cash" } }),
  );
  return { book, card, cash };
};
const add = async (accountId: number, date: string, amountCents: number, payee = "") =>
  body(await t.api.money.transactions.$post({ json: { accountId, date, amountCents, payee } }));
const newItem = async (json: Parameters<typeof t.api.resale.items.$post>[0]["json"]) =>
  body(await t.api.resale.items.$post({ json }));
const param = (id: number) => ({ param: { id: String(id) } });
const listed = async (bookId: number) =>
  (await body(await t.api.money.transactions.$get({ query: { bookId: String(bookId) } })))
    .transactions;
const matches = async (itemId: number, role: "purchase" | "sale", q?: string) =>
  body(
    await t.api.resale.items[":id"]["transaction-matches"].$get({
      ...param(itemId),
      query: q ? { role, q } : { role },
    }),
  );
const link = (itemId: number, transactionId: number, role: "purchase" | "sale") =>
  t.api.resale.items[":id"].transactions.$post({ ...param(itemId), json: { transactionId, role } });

describe("transaction matches", () => {
  it("suggest money out near the purchase date, the exact amount first", async () => {
    const { card } = await setup();
    const item = await newItem({
      title: "Desk lamp",
      purchasedOn: "2030-03-10",
      purchaseCents: 4_000,
    });
    const exact = await add(card.id, "2030-03-14", -4_000, "Thrift shop");
    const near = await add(card.id, "2030-03-10", -4_250, "Hardware store");
    await add(card.id, "2030-03-11", 4_000, "Refund"); // money in: not a purchase
    await add(card.id, "2030-05-01", -4_000, "Much later"); // outside the month
    const far = await add(card.id, "2030-02-20", -9_000, "Groceries");

    const found = await matches(item.id, "purchase");
    expect(found.map((row) => [row.payee, row.exact])).toEqual([
      ["Thrift shop", true],
      ["Hardware store", false],
      ["Groceries", false],
    ]);
    expect(found[0]).toMatchObject({
      id: exact.id,
      amountCents: -4_000,
      account: { name: "Card", bookName: "Personal" },
      linkedItems: [],
    });
    expect(found.map((row) => row.id)).toEqual([exact.id, near.id, far.id]);

    // A search looks at every date.
    expect((await matches(item.id, "purchase", "later")).map((row) => row.payee)).toEqual([
      "Much later",
    ]);
  });

  it("leave out transfers and what's already linked, and show a bulk lot's other items", async () => {
    const { card, cash } = await setup();
    const lamp = await newItem({ title: "Lamp", purchasedOn: "2030-03-10", purchaseCents: 3_000 });
    const chair = await newItem({ title: "Chair", purchasedOn: "2030-03-10" });
    const lot = await add(card.id, "2030-03-10", -3_000, "Estate sale");
    await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: card.id,
          toAccountId: cash.id,
          date: "2030-03-10",
          amountCents: 3_000,
        },
      }),
    );
    await body(await link(lamp.id, lot.id, "purchase"));

    expect(await matches(lamp.id, "purchase")).toEqual([]);
    const forChair = await matches(chair.id, "purchase");
    expect(forChair.map((row) => [row.payee, row.linkedItems.map((other) => other.title)])).toEqual(
      [["Estate sale", ["Lamp"]]],
    );
  });
});

describe("linking", () => {
  it("links purchases and sales both ways, and notes them on the item's timeline", async () => {
    const { book, card } = await setup();
    const item = await newItem({
      title: "Desk lamp",
      purchasedOn: "2030-03-10",
      purchaseCents: 4_000,
      soldOn: "2030-04-02",
      saleCents: 9_500,
      status: "sold",
    });
    const paid = await add(card.id, "2030-03-10", -4_000, "Thrift shop");
    const payout = await add(card.id, "2030-04-03", 9_500, "Marketplace payout");

    await body(await link(item.id, paid.id, "purchase"));
    const linked = await body(await link(item.id, payout.id, "sale"));
    expect(linked.transactions.map((row) => [row.role, row.payee, row.amountCents])).toEqual([
      ["purchase", "Thrift shop", -4_000],
      ["sale", "Marketplace payout", 9_500],
    ]);

    // The money side shows the item.
    const page = await body(
      await t.api.money.transactions.$get({ query: { bookId: String(book.id) } }),
    );
    expect(page.transactions.map((row) => [row.payee, row.resaleItems])).toEqual([
      ["Marketplace payout", [{ id: item.id, title: "Desk lamp", role: "sale" }]],
      ["Thrift shop", [{ id: item.id, title: "Desk lamp", role: "purchase" }]],
    ]);

    const timeline = await body(
      await t.api.activity.$get({ query: { type: "resale_item", id: String(item.id) } }),
    );
    expect(timeline.entries.slice(0, 2).map((entry) => entry.details)).toEqual([
      { changes: { saleMoney: { from: [], to: ["2030-04-03 $95 Marketplace payout"] } } },
      { changes: { paidWith: { from: [], to: ["2030-03-10 -$40 Thrift shop"] } } },
    ]);

    const unlinked = await body(
      await t.api.resale.items[":id"].transactions[":transactionId"].$delete({
        param: { id: String(item.id), transactionId: String(paid.id) },
      }),
    );
    expect(unlinked.transactions.map((row) => row.role)).toEqual(["sale"]);
    // The transaction itself stays.
    expect((await listed(book.id)).map((row) => row.id)).toContain(paid.id);
  });

  it("go away when the transaction or the item is deleted", async () => {
    const { book, card } = await setup();
    const item = await newItem({ title: "Lamp" });
    const other = await newItem({ title: "Chair" });
    const paid = await add(card.id, "2030-03-10", -4_000);
    const lot = await add(card.id, "2030-03-11", -1_000);
    await body(await link(item.id, paid.id, "purchase"));
    await body(await link(other.id, lot.id, "purchase"));

    await t.api.money.transactions[":id"].$delete(param(paid.id));
    expect((await body(await t.api.resale.items[":id"].$get(param(item.id)))).transactions).toEqual(
      [],
    );

    await t.api.resale.items[":id"].$delete(param(other.id));
    const left = (await listed(book.id)).find((row) => row.id === lot.id);
    expect(left?.resaleItems).toEqual([]);
  });

  it("refuses transactions that don't fit", async () => {
    const { card, cash } = await setup();
    const item = await newItem({ title: "Lamp" });
    const refund = await add(card.id, "2030-03-10", 500);
    const spent = await add(card.id, "2030-03-10", -500);
    const transfer = await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: card.id,
          toAccountId: cash.id,
          date: "2030-03-10",
          amountCents: 100,
        },
      }),
    );

    const wrongWay = await failure(await link(item.id, refund.id, "purchase"));
    expect(wrongWay).toMatchObject({ status: 400 });
    expect(wrongWay.error).toContain("A purchase is money out");
    expect((await failure(await link(item.id, spent.id, "sale"))).error).toContain(
      "A sale is money in",
    );
    expect((await failure(await link(item.id, transfer.from.id, "purchase"))).error).toContain(
      "transfer between your accounts",
    );
    expect((await failure(await link(item.id, 99_999, "purchase"))).status).toBe(400);

    await body(await link(item.id, spent.id, "purchase"));
    expect((await failure(await link(item.id, spent.id, "purchase"))).status).toBe(409);
    expect((await failure(await link(99_999, spent.id, "purchase"))).status).toBe(404);
    expect(
      (
        await t.api.resale.items[":id"].transactions[":transactionId"].$delete({
          param: { id: String(item.id), transactionId: String(refund.id) },
        })
      ).status,
    ).toBe(404);
  });
});

describe("adding to money", () => {
  it("records the purchase or sale as a transaction and links it", async () => {
    const { book, cash } = await setup();
    const classifieds = (
      await body(await t.api.resale.platforms.$post({ json: { name: "Local classifieds" } }))
    )[0];
    const category = (
      await body(await t.api.money.categories.$get({ query: { bookId: String(book.id) } }))
    ).find((row) => row.kind === "expense");
    const item = await newItem({
      title: "Desk lamp",
      purchasedOn: "2030-03-10",
      purchaseCents: 4_000,
      purchaseFrom: "Yard sale",
      soldOn: "2030-04-02",
      saleCents: 9_500,
      salePlatformId: classifieds?.id ?? null,
      status: "sold",
    });

    const res = await t.api.resale.items[":id"]["record-transaction"].$post({
      ...param(item.id),
      json: { role: "purchase", accountId: cash.id, categoryId: category?.id ?? null },
    });
    expect(res.status).toBe(201);
    await body(
      await t.api.resale.items[":id"]["record-transaction"].$post({
        ...param(item.id),
        json: { role: "sale", accountId: cash.id },
      }),
    );

    const page = await body(
      await t.api.money.transactions.$get({ query: { bookId: String(book.id) } }),
    );
    expect(
      page.transactions.map((row) => [
        row.date,
        row.amountCents,
        row.payee,
        row.memo,
        row.category?.id ?? null,
        row.resaleItems.map((linked) => linked.role),
      ]),
    ).toEqual([
      ["2030-04-02", 9_500, "Local classifieds", "Sold: Desk lamp", null, ["sale"]],
      ["2030-03-10", -4_000, "Yard sale", "Bought: Desk lamp", category?.id ?? null, ["purchase"]],
    ]);
  });

  it("needs a price and date, and an account", async () => {
    const { card } = await setup();
    const item = await newItem({ title: "Lamp", purchaseCents: 4_000 });
    const record = (json: { role: "purchase" | "sale"; accountId: number }) =>
      t.api.resale.items[":id"]["record-transaction"].$post({ ...param(item.id), json });

    const noDate = await failure(await record({ role: "purchase", accountId: card.id }));
    expect(noDate).toMatchObject({ status: 400 });
    expect(noDate.error).toContain("the date you bought it");
    expect((await failure(await record({ role: "sale", accountId: card.id }))).error).toContain(
      "sale price",
    );
    await t.api.resale.items[":id"].$patch({
      ...param(item.id),
      json: { purchasedOn: "2030-03-10" },
    });
    expect((await failure(await record({ role: "purchase", accountId: 99_999 }))).status).toBe(400);

    // With nothing to say who was paid, the payee is the item's title.
    const recorded = await body(await record({ role: "purchase", accountId: card.id }));
    expect(recorded.transactions.map((row) => [row.payee, row.memo])).toEqual([
      ["Lamp", "Bought: Lamp"],
    ]);
  });
});
