import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const param = (id: number) => ({ param: { id: String(id) } });

async function setup() {
  const book = await body(
    await t.api.money.books.$post({
      json: { name: "Personal", kind: "personal", starterCategories: true },
    }),
  );
  const categories = await body(
    await t.api.money.categories.$get({ query: { bookId: String(book.id) } }),
  );
  const category = (name: string) => {
    const found = categories.find((entry) => entry.name === name);
    if (!found) throw new Error(`No ${name}`);
    return found.id;
  };
  const credit = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Rewards account", kind: "credit_card" },
    }),
  );
  const checking = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Checking", kind: "checking" },
    }),
  );
  const card = (
    await body(
      await t.api.money.cards.$post({ json: { accountId: credit.id, name: "Store card" } }),
    )
  ).card;
  return {
    book,
    credit,
    checking,
    card,
    groceries: category("Groceries"),
    dining: category("Dining out"),
    paycheck: category("Paycheck"),
  };
}

const pay = async (
  accountId: number,
  date: string,
  amountCents: number,
  payee: string,
  categoryId: number | null = null,
) =>
  body(
    await t.api.money.transactions.$post({
      json: { accountId, date, amountCents, payee, categoryId },
    }),
  );

const reportOf = async (bookId: number, year: number) =>
  body(await t.api.money.rewards.$get({ query: { bookId: String(bookId), year: String(year) } }));

describe("card rewards", () => {
  it("start unset, so a card's spending shows without earnings", async () => {
    const { book, credit, card } = await setup();
    await pay(credit.id, "2030-01-05", -5_000, "Corner grocery");
    expect(await body(await t.api.money.cards[":id"].rewards.$get(param(card.id)))).toBeNull();
    const [entry] = (await reportOf(book.id, 2030)).cards;
    expect(entry).toMatchObject({ program: null, spentCents: 5_000, earned: 0, valueCents: 0 });
  });

  it("earn by store, category, and base rate, by month, leaving out transfers and income", async () => {
    const { book, credit, checking, card, groceries, dining, paycheck } = await setup();
    const saved = await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(card.id),
        json: {
          kind: "cash_back",
          baseRate: 100,
          rates: [
            { categoryId: groceries, rate: 300 },
            { contains: "example store, exmpl", rate: 500 },
          ],
        },
      }),
    );
    expect(saved.rates.map((rate) => [rate.categoryName, rate.contains, rate.rate])).toEqual([
      ["Groceries", null, 300],
      [null, "example store, exmpl", 500],
    ]);

    await pay(credit.id, "2030-01-05", -10_000, "EXMPL MKTP US*1A2B", groceries); // store wins
    await pay(credit.id, "2030-01-06", -20_000, "Corner grocery", groceries);
    await pay(credit.id, "2030-02-07", -5_000, "Pizza place", dining);
    await pay(credit.id, "2030-02-08", 1_000, "Refund: Pizza place", dining);
    await pay(credit.id, "2030-02-09", 2_500, "Statement credit", paycheck); // income: not spending
    await pay(credit.id, "2031-01-01", -9_900, "Corner grocery", groceries); // next year
    await body(
      await t.api.money.transfers.$post({
        json: {
          fromAccountId: checking.id,
          toAccountId: credit.id,
          date: "2030-02-20",
          amountCents: 30_000,
        },
      }),
    );

    const report = await reportOf(book.id, 2030);
    const [entry] = report.cards;
    expect(entry?.spentCents).toBe(34_000);
    // $5 at the store, $6 on groceries, $0.40 on dining less its refund.
    expect(entry?.valueCents).toBe(500 + 600 + 40);
    expect(entry?.earned).toBe(1_140);
    expect(entry?.months.slice(0, 2)).toEqual([
      { month: "2030-01", spentCents: 30_000, earned: 1_100, valueCents: 1_100 },
      { month: "2030-02", spentCents: 4_000, earned: 40, valueCents: 40 },
    ]);
    expect(entry?.months).toHaveLength(12);
    expect(entry?.byRate.map((rate) => [rate.label, rate.spentCents, rate.earned])).toEqual([
      ["Groceries", 20_000, 600],
      ["example store, exmpl", 10_000, 500],
      ["Everything else", 4_000, 40],
    ]);
    expect(report.totals).toEqual({
      spentCents: 34_000,
      valueCents: 1_140,
      annualFeeCents: 0,
      netCents: 1_140,
    });
    // Against a 2% card on the same $340: $6.80.
    expect(entry?.worth).toEqual({ annualFeeCents: 0, netCents: 1_140, flatCents: 680 });
  });

  it("value points at the card's point value", async () => {
    const { book, credit, card } = await setup();
    await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(card.id),
        json: { kind: "points", baseRate: 200, pointValue: 150, rates: [] },
      }),
    );
    await pay(credit.id, "2030-03-01", -12_345, "Corner gas");
    const [entry] = (await reportOf(book.id, 2030)).cards;
    // 2 points a dollar on $123.45 is 247 points, at 1.5¢ each.
    expect(entry).toMatchObject({ earned: 247, valueCents: 370 });
  });

  it("refuse categories from other books or for income, and go with the card", async () => {
    const { book, card, paycheck, groceries } = await setup();
    const other = await body(
      await t.api.money.books.$post({
        json: { name: "Business", kind: "business", starterCategories: true },
      }),
    );
    const [otherCategory] = await body(
      await t.api.money.categories.$get({ query: { bookId: String(other.id) } }),
    );
    for (const categoryId of [paycheck, otherCategory?.id ?? 0]) {
      expect(
        await failure(
          await t.api.money.cards[":id"].rewards.$put({
            ...param(card.id),
            json: { kind: "cash_back", baseRate: 100, rates: [{ categoryId, rate: 300 }] },
          }),
        ),
      ).toMatchObject({ status: 400 });
    }
    expect(
      await failure(
        await t.api.money.cards[":id"].rewards.$put({
          ...param(card.id),
          json: { kind: "cash_back", baseRate: 100, rates: [{ rate: 300 }] },
        }),
      ),
    ).toMatchObject({ status: 400 });

    await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(card.id),
        json: { kind: "cash_back", baseRate: 100, rates: [{ categoryId: groceries, rate: 300 }] },
      }),
    );
    expect((await t.api.money.cards[":id"].$delete(param(card.id))).status).toBe(204);
    expect((await reportOf(book.id, 2030)).cards).toEqual([]);
    expect(t.sqlite.prepare("select count(*) as n from money_reward_rates").get()).toEqual({
      n: 0,
    });
    expect(t.sqlite.prepare("select count(*) as n from money_card_rewards").get()).toEqual({
      n: 0,
    });
  });

  it("drop a deleted category's rate, and can be turned off", async () => {
    const { book, card } = await setup();
    const pets = await body(
      await t.api.money.categories.$post({
        json: { bookId: book.id, name: "Pets", kind: "expense" },
      }),
    );
    await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(card.id),
        json: { kind: "cash_back", baseRate: 100, rates: [{ categoryId: pets.id, rate: 300 }] },
      }),
    );
    expect((await t.api.money.categories[":id"].$delete(param(pets.id))).status).toBe(204);
    expect(
      (await body(await t.api.money.cards[":id"].rewards.$get(param(card.id))))?.rates,
    ).toEqual([]);
    expect((await t.api.money.cards[":id"].rewards.$delete(param(card.id))).status).toBe(204);
    expect(await body(await t.api.money.cards[":id"].rewards.$get(param(card.id)))).toBeNull();
  });

  it("weigh the annual fee against a flat-rate card", async () => {
    const { book, credit, card, dining } = await setup();
    await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(card.id),
        json: {
          kind: "cash_back",
          baseRate: 100,
          annualFeeCents: 9_500,
          rates: [{ categoryId: dining, rate: 400 }],
        },
      }),
    );
    await pay(credit.id, "2030-05-01", -300_000, "Pizza place", dining);
    const report = await body(
      await t.api.money.rewards.$get({
        query: { bookId: String(book.id), year: "2030", baseline: "150" },
      }),
    );
    expect(report.baseline).toBe(150);
    // $120 earned, less the $95 fee, against $45 from a 1.5% card.
    expect(report.cards[0]?.worth).toEqual({
      annualFeeCents: 9_500,
      netCents: 2_500,
      flatCents: 4_500,
    });
    expect(report.totals.netCents).toBe(2_500);
  });

  it("track points: real value from redemptions, and statements against the estimate", async () => {
    const { book, credit, card } = await setup();
    await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(card.id),
        json: { kind: "points", baseRate: 200, pointValue: 100, rates: [] },
      }),
    );
    await body(
      await t.api.money.cards[":id"]["point-balances"].$post({
        ...param(card.id),
        json: { date: "2030-01-31", points: 1_000 },
      }),
    );
    await pay(credit.id, "2030-01-31", -50_000, "Before the statement");
    await pay(credit.id, "2030-02-10", -100_000, "Corner gas"); // 2,000 points
    await body(
      await t.api.money.cards[":id"].redemptions.$post({
        ...param(card.id),
        json: { date: "2030-02-20", points: 2_000, valueCents: 3_000, note: "Travel" },
      }),
    );
    const history = await body(
      await t.api.money.cards[":id"]["point-balances"].$post({
        ...param(card.id),
        json: { date: "2030-02-28", points: 1_050 },
      }),
    );
    expect(history.realValue).toBe(150);
    expect(history.balances.map((balance) => balance.date)).toEqual(["2030-02-28", "2030-01-31"]);

    const [entry] = (await reportOf(book.id, 2030)).cards;
    expect(entry).toMatchObject({ pointValue: 150, pointValueSource: "redemptions" });
    // 3,000 points at 1.5¢.
    expect(entry).toMatchObject({ earned: 3_000, valueCents: 4_500 });
    expect(entry?.points).toEqual({
      latest: { date: "2030-02-28", points: 1_050 },
      // 1,050 - 1,000 + 2,000 used: 2,050 on the statements, 2,000 estimated.
      check: {
        from: "2030-01-31",
        to: "2030-02-28",
        statementPoints: 2_050,
        estimatedPoints: 2_000,
      },
      redeemedPoints: 2_000,
      redeemedValueCents: 3_000,
    });

    // The same day replaces; deleting goes back.
    const replaced = await body(
      await t.api.money.cards[":id"]["point-balances"].$post({
        ...param(card.id),
        json: { date: "2030-02-28", points: 1_100 },
      }),
    );
    expect(replaced.balances[0]?.points).toBe(1_100);
    const afterDelete = await body(
      await t.api.money["point-balances"][":id"].$delete(param(replaced.balances[0]?.id ?? 0)),
    );
    expect(afterDelete.balances).toHaveLength(1);
    const redemptionId = afterDelete.redemptions[0]?.id ?? 0;
    expect(
      (await body(await t.api.money.redemptions[":id"].$delete(param(redemptionId)))).realValue,
    ).toBeNull();

    // A card's points go with it.
    expect((await t.api.money.cards[":id"].$delete(param(card.id))).status).toBe(204);
    expect(t.sqlite.prepare("select count(*) as n from money_point_balances").get()).toEqual({
      n: 0,
    });
  });

  it("show what the best card for each purchase would have earned", async () => {
    const { book, credit, checking, card, dining } = await setup();
    const debit = (
      await body(await t.api.money.cards.$post({ json: { accountId: checking.id, name: "Debit" } }))
    ).card;
    await body(
      await t.api.money.cards[":id"].rewards.$put({
        ...param(card.id),
        json: { kind: "cash_back", baseRate: 100, rates: [{ categoryId: dining, rate: 300 }] },
      }),
    );
    await pay(credit.id, "2030-03-01", -10_000, "Pizza place", dining);
    await body(
      await t.api.money.transactions.$post({
        json: {
          accountId: checking.id,
          date: "2030-03-02",
          amountCents: -20_000,
          payee: "Pizza place",
          categoryId: dining,
          cardId: debit.id,
        },
      }),
    );
    const { best } = await reportOf(book.id, 2030);
    expect(best).toEqual({
      actualCents: 300,
      bestCents: 900,
      tips: [
        {
          label: "Dining out",
          fromCard: "Debit",
          toCard: "Store card",
          spentCents: 20_000,
          missedCents: 600,
        },
      ],
    });
  });
});
