import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import type { AccountKind } from "../../shared/books";
import { cardLabel, guessCard } from "../../shared/cards";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const param = (id: number) => ({ param: { id: String(id) } });

async function setup() {
  const book = await body(
    await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
  );
  const account = async (name: string, kind: AccountKind) =>
    body(await t.api.money.accounts.$post({ json: { bookId: book.id, name, kind } }));
  return {
    book,
    checking: await account("Everyday checking", "checking"),
    credit: await account("Rewards card", "credit_card"),
    loan: await account("Car loan", "loan"),
  };
}

const addCard = async (accountId: number, name: string, last4?: string) =>
  body(await t.api.money.cards.$post({ json: { accountId, name, last4: last4 ?? null } }));
const addTransaction = async (
  accountId: number,
  amountCents: number,
  payee: string,
  extra: { cardId?: number | null; memo?: string } = {},
) =>
  body(
    await t.api.money.transactions.$post({
      json: { accountId, amountCents, payee, date: "2030-01-15", ...extra },
    }),
  );
const transactionsOf = async (query: Record<string, string>) =>
  (await body(await t.api.money.transactions.$get({ query: query as { bookId: string } })))
    .transactions;

describe("guessing the card", () => {
  const cards = [
    { id: 1, last4: "1234", archived: false },
    { id: 2, last4: "9876", archived: false },
  ];
  const row = (payee: string, amountCents = -1_000, memo = "") => ({ payee, memo, amountCents });

  it("goes by card digits in the bank's text", () => {
    for (const text of [
      "DEBIT CARD PURCHASE CARD 9876 CORNER GROCERY",
      "Corner grocery x9876",
      "CORNER GROCERY XXXX9876",
      "Corner grocery ***9876",
      "Purchase on card ending in 9876",
      "Corner grocery ...9876",
    ]) {
      expect(guessCard("checking", cards, row(text))).toBe(2);
    }
    // A store number isn't a card.
    expect(guessCard("checking", cards, row("CORNER GROCERY #9876"))).toBeNull();
  });

  it("uses the only card on a credit card account, except for payments", () => {
    const one = [{ id: 7, last4: null, archived: false }];
    expect(guessCard("credit_card", one, row("Corner grocery"))).toBe(7);
    expect(guessCard("credit_card", one, row("Refund: Corner grocery", 500))).toBe(7);
    expect(guessCard("credit_card", one, row("Payment, thank you", 50_000))).toBeNull();
    expect(guessCard("credit_card", cards, row("Corner grocery"))).toBeNull();
    // An archived card doesn't count as the only one, but its digits still match.
    const archived = [...one, { id: 8, last4: "5555", archived: true }];
    expect(guessCard("credit_card", archived, row("Corner grocery"))).toBe(7);
    expect(guessCard("credit_card", archived, row("Corner grocery x5555"))).toBe(8);
  });

  it("needs card words on checking, and never applies to loans", () => {
    const one = [{ id: 3, last4: null, archived: false }];
    expect(guessCard("checking", one, row("POS PURCHASE CORNER GROCERY"))).toBe(3);
    expect(guessCard("checking", one, row("Corner grocery", -1_000, "Debit card purchase"))).toBe(
      3,
    );
    expect(guessCard("checking", one, row("Check 1042"))).toBeNull();
    expect(guessCard("checking", one, row("Transfer to savings"))).toBeNull();
    expect(guessCard("loan", one, row("Corner grocery x1234"))).toBeNull();
  });

  it("labels cards with their digits", () => {
    expect(cardLabel({ name: "Rewards card", last4: "4321" })).toBe("Rewards card ••4321");
    expect(cardLabel({ name: "Rewards card", last4: null })).toBe("Rewards card");
  });
});

describe("cards", () => {
  it("go on accounts that can have them, with unique names and only 4 digits", async () => {
    const { book, checking, credit, loan } = await setup();
    const debit = await addCard(checking.id, "Everyday debit", "1234");
    expect(debit).toEqual({
      card: {
        id: debit.card.id,
        account: { id: checking.id, name: "Everyday checking", kind: "checking" },
        name: "Everyday debit",
        kind: "debit",
        last4: "1234",
        archived: false,
        transactionCount: 0,
      },
      filled: 0,
    });
    expect((await addCard(credit.id, "Rewards card")).card).toMatchObject({
      kind: "credit",
      last4: null,
    });

    expect(
      await failure(await t.api.money.cards.$post({ json: { accountId: loan.id, name: "Loan" } })),
    ).toMatchObject({ status: 400 });
    expect(
      await failure(
        await t.api.money.cards.$post({ json: { accountId: credit.id, name: "EVERYDAY DEBIT" } }),
      ),
    ).toMatchObject({ status: 409 });
    for (const last4 of ["12345", "4111111111111111", "12a4"]) {
      expect(
        await failure(
          await t.api.money.cards.$post({ json: { accountId: credit.id, name: "Other", last4 } }),
        ),
      ).toMatchObject({ status: 400 });
    }
    expect(
      (await body(await t.api.money.cards.$get({ query: { bookId: String(book.id) } }))).map(
        (card) => card.name,
      ),
    ).toEqual(["Everyday debit", "Rewards card"]);
  });

  it("are matched to past purchases when added, leaving payments and transfers alone", async () => {
    const { checking, credit } = await setup();
    const purchase = await addTransaction(credit.id, -4_250, "Corner grocery");
    const refund = await addTransaction(credit.id, 1_000, "Refund: Corner grocery");
    const payment = await addTransaction(credit.id, 50_000, "Payment, thank you");
    const transfer = await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: credit.id,
          date: "2030-01-20",
          amountCents: 20_000,
        },
      }),
    );
    expect(purchase.card).toBeNull();

    const saved = await addCard(credit.id, "Rewards card", "4321");
    expect(saved.filled).toBe(2);
    const byId = new Map(
      (await transactionsOf({ bookId: String(credit.bookId) })).map((row) => [row.id, row]),
    );
    expect(byId.get(purchase.id)?.card).toEqual({
      id: saved.card.id,
      name: "Rewards card",
      last4: "4321",
      kind: "credit",
    });
    expect(byId.get(refund.id)?.card?.id).toBe(saved.card.id);
    expect(byId.get(payment.id)?.card).toBeNull();
    expect(byId.get(transfer.to.id)?.card).toBeNull();
  });

  it("are guessed for new transactions, and can be picked or cleared", async () => {
    const { checking, credit } = await setup();
    const rewards = (await addCard(credit.id, "Rewards card")).card;
    const debit = (await addCard(checking.id, "Everyday debit", "1234")).card;

    expect((await addTransaction(credit.id, -2_000, "Pizza place")).card?.id).toBe(rewards.id);
    expect((await addTransaction(credit.id, -2_000, "Pizza place", { cardId: null })).card).toBe(
      null,
    );
    expect((await addTransaction(checking.id, -900, "Check 1042")).card).toBeNull();
    expect((await addTransaction(checking.id, -900, "POS Corner gas")).card?.id).toBe(debit.id);
    const picked = await addTransaction(checking.id, -900, "Farmers market", { cardId: debit.id });
    expect(picked.card?.id).toBe(debit.id);

    // Another account's card doesn't fit.
    expect(
      await failure(
        await t.api.money.transactions.$post({
          json: {
            accountId: checking.id,
            amountCents: -100,
            date: "2030-01-15",
            cardId: rewards.id,
          },
        }),
      ),
    ).toMatchObject({ status: 400 });
    // Moving the transaction to another account drops the card.
    const moved = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(picked.id),
        json: { accountId: credit.id },
      }),
    );
    expect(moved.card).toBeNull();
    const repicked = await body(
      await t.api.money.transactions[":id"].$patch({
        ...param(picked.id),
        json: { cardId: rewards.id },
      }),
    );
    expect(repicked.card?.id).toBe(rewards.id);
  });

  it("filter transactions, and deleting one keeps its transactions", async () => {
    const { book, checking, credit } = await setup();
    const rewards = (await addCard(credit.id, "Rewards card")).card;
    await addTransaction(credit.id, -2_000, "Pizza place");
    await addTransaction(checking.id, -900, "Check 1042");

    const paidWith = await transactionsOf({ bookId: String(book.id), cardId: String(rewards.id) });
    expect(paidWith.map((row) => row.payee)).toEqual(["Pizza place"]);
    const without = await transactionsOf({ bookId: String(book.id), cardId: "none" });
    expect(without.map((row) => row.payee)).toEqual(["Check 1042"]);

    const cards = await body(await t.api.money.cards.$get({ query: { bookId: String(book.id) } }));
    expect(cards[0]?.transactionCount).toBe(1);
    expect((await t.api.money.cards[":id"].$delete(param(rewards.id))).status).toBe(204);
    const all = await transactionsOf({ bookId: String(book.id) });
    expect(all).toHaveLength(2);
    expect(all.every((row) => row.card === null)).toBe(true);
  });

  it("fill in when digits are added, and leave a transfer when it's linked", async () => {
    const { book, checking, credit } = await setup();
    await addCard(checking.id, "Everyday debit");
    const second = (await addCard(checking.id, "Second debit")).card;
    // Two debit cards: only digits can tell them apart.
    const purchase = await addTransaction(checking.id, -900, "CORNER GAS CARD 5555");
    expect(purchase.card).toBeNull();
    const saved = await body(
      await t.api.money.cards[":id"].$patch({ ...param(second.id), json: { last4: "5555" } }),
    );
    expect(saved.filled).toBe(1);
    expect((await transactionsOf({ bookId: String(book.id) }))[0]?.card?.id).toBe(second.id);

    // A card purchase that turns out to be a transfer loses its card.
    const rewards = (await addCard(credit.id, "Rewards card")).card;
    const cardSide = await addTransaction(credit.id, 900, "Credit");
    expect(cardSide.card?.id).toBe(rewards.id);
    await body(
      await t.api.money.transfers.link.$post({
        json: { transactionIds: [purchase.id, cardSide.id] },
      }),
    );
    const linked = await transactionsOf({ bookId: String(book.id), categoryId: "transfer" });
    expect(linked.every((row) => row.card === null)).toBe(true);
    expect(
      await failure(
        await t.api.money.transactions[":id"].$patch({
          ...param(cardSide.id),
          json: { cardId: rewards.id },
        }),
      ),
    ).toMatchObject({ status: 409 });
  });

  it("keep an account's kind fitting, and go when an empty account is deleted", async () => {
    const { credit } = await setup();
    await addCard(credit.id, "Rewards card");
    expect(
      await failure(
        await t.api.money.accounts[":id"].$patch({ ...param(credit.id), json: { kind: "loan" } }),
      ),
    ).toMatchObject({ status: 409 });
    expect((await t.api.money.accounts[":id"].$delete(param(credit.id))).status).toBe(204);
  });

  it("are picked for imported rows", async () => {
    const { book, checking } = await setup();
    await addCard(checking.id, "Everyday debit", "1234");
    await addCard(checking.id, "Second debit", "5555");
    await body(
      await t.api.money.imports.$post({
        query: {},
        json: {
          accountId: checking.id,
          source: "csv",
          fileName: "january.csv",
          transactions: [
            { date: "2030-01-05", amountCents: -4_250, payee: "CORNER GROCERY x5555", memo: "" },
            { date: "2030-01-06", amountCents: -1_000, payee: "CHECK 1042", memo: "" },
          ],
        },
      }),
    );
    const rows = await transactionsOf({ bookId: String(book.id) });
    expect(rows.map((row) => [row.payee, row.card?.name ?? null])).toEqual([
      ["CHECK 1042", null],
      ["CORNER GROCERY x5555", "Second debit"],
    ]);
  });
});
