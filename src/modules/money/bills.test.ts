import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { billDates, nextBillDate } from "../../shared/bills";
import { datedItems } from "../integrations/reminders.service";
import { billState, forecast, listBills } from "./bills.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const today = "2030-06-15";

async function setUp() {
  const book = await body(
    await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
  );
  const checking = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Checking", kind: "checking", openingBalanceCents: 50_000 },
    }),
  );
  const pay = async (date: string, amountCents: number, payee: string) =>
    body(
      await t.api.money.transactions.$post({
        json: { accountId: checking.id, date, amountCents, payee },
      }),
    );
  return { book, checking, pay };
}

describe("bill schedules", () => {
  it("step by frequency and keep the day of the month", () => {
    expect(nextBillDate("2030-01-31", "monthly")).toBe("2030-02-28");
    expect(billDates("2030-01-31", "monthly", "2030-01-01", "2030-04-30")).toEqual([
      "2030-01-31",
      "2030-02-28",
      "2030-03-31",
      "2030-04-30",
    ]);
    expect(billDates("2030-01-01", "biweekly", "2030-01-10", "2030-02-01")).toEqual([
      "2030-01-15",
      "2030-01-29",
    ]);
  });

  it("move past payments that arrived, and notice ones that didn't or cost more", () => {
    const bill = {
      nextDate: "2030-04-01",
      frequency: "monthly" as const,
      amountCents: 1500,
      matchKey: "merchant:x",
    };
    const paid = (date: string, amountCents = -1500) => ({
      date,
      amountCents,
      accountId: 1,
      categoryId: null,
    });
    expect(
      billState(bill, [paid("2030-04-02"), paid("2030-05-01"), paid("2030-06-03")], today),
    ).toEqual({
      nextDate: "2030-07-01",
      lastSeen: { date: "2030-06-03", amountCents: -1500 },
      alert: null,
    });
    // June's didn't come.
    expect(billState(bill, [paid("2030-04-02"), paid("2030-05-01")], today).alert).toEqual({
      kind: "missing",
      expected: "2030-06-01",
    });
    // June's cost more.
    expect(
      billState(bill, [paid("2030-04-02"), paid("2030-05-01"), paid("2030-06-01", -1799)], today)
        .alert,
    ).toEqual({ kind: "changed", fromCents: 1500, toCents: 1799, date: "2030-06-01" });
    // Added by hand: no payments to match, so it just moves past today.
    expect(billState({ ...bill, matchKey: null }, [], today).nextDate).toBe("2030-07-01");
  });
});

describe("bills", () => {
  it("are suggested from repeating payments, then confirmed or dismissed", async () => {
    const { book, checking, pay } = await setUp();
    for (const date of ["2030-02-03", "2030-03-03", "2030-04-03", "2030-05-03", "2030-06-03"]) {
      await pay(date, -1599, "Example Streaming");
    }
    for (const date of ["2030-03-10", "2030-04-10", "2030-05-10", "2030-06-10"]) {
      await pay(date, -4500, "Example Phone Co");
    }
    // Groceries vary too much to repeat.
    for (const [date, cents] of [
      ["2030-06-01", -8000],
      ["2030-06-08", -2500],
      ["2030-06-12", -13000],
    ] as const) {
      await pay(date, cents, "Corner Market");
    }

    const found = listBills(t.db, book.id, today).suggestions;
    expect(
      found.map((item) => [item.name, item.frequency, item.amountCents, item.nextDate]),
    ).toEqual([
      ["Example Phone", "monthly", 4500, "2030-07-10"],
      ["Example Streaming", "monthly", 1599, "2030-07-03"],
    ]);
    expect(found[1]).toMatchObject({ kind: "bill", accountId: checking.id, count: 5 });

    const streaming = found[1];
    if (!streaming) throw new Error("Expected a suggestion");
    await body(
      await t.api.money.bills.$post({
        json: {
          bookId: book.id,
          name: "Streaming",
          kind: "subscription",
          amountCents: streaming.amountCents,
          frequency: streaming.frequency,
          nextDate: "2030-02-03",
          accountId: checking.id,
          matchKey: streaming.matchKey,
        },
      }),
    );
    const dismissed = await t.api.money.bills.dismiss.$post({
      json: { bookId: book.id, matchKey: found[0]?.matchKey ?? "", name: "Example Phone" },
    });
    expect(dismissed.status).toBe(204);

    const after = listBills(t.db, book.id, today);
    expect(after.suggestions).toEqual([]);
    expect(after.bills).toHaveLength(1);
    // Its schedule moved past the payments already made.
    expect(after.bills[0]).toMatchObject({
      name: "Streaming",
      nextDate: "2030-07-03",
      lastSeen: { date: "2030-06-03", amountCents: -1599 },
      accountName: "Checking",
      alert: null,
    });
    expect(after.subscriptionsPerYearCents).toBe(1599 * 12);
  });

  it("can be added by hand, changed, and deleted", async () => {
    const { book } = await setUp();
    const rent = await body(
      await t.api.money.bills.$post({
        json: {
          bookId: book.id,
          name: "Rent",
          kind: "bill",
          amountCents: 120_000,
          frequency: "monthly",
          nextDate: "2030-07-01",
        },
      }),
    );
    const param = { param: { id: String(rent.id) } };
    const changed = await body(
      await t.api.money.bills[":id"].$patch({ ...param, json: { amountCents: 125_000 } }),
    );
    expect(changed.amountCents).toBe(125_000);
    expect((await t.api.money.bills[":id"].$delete(param)).status).toBe(204);
    expect((await failure(await t.api.money.bills[":id"].$delete(param))).status).toBe(404);
    expect(
      (
        await failure(
          await t.api.money.bills.$post({
            json: {
              bookId: book.id,
              name: "Bad",
              kind: "bill",
              amountCents: 0,
              frequency: "monthly",
              nextDate: "2030-07-01",
            },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("lose a deleted account or category, and go with their book", async () => {
    const book = await body(
      await t.api.money.books.$post({ json: { name: "Spare", kind: "personal" } }),
    );
    const account = await body(
      await t.api.money.accounts.$post({
        json: { bookId: book.id, name: "Spare checking", kind: "checking" },
      }),
    );
    const category = await body(
      await t.api.money.categories.$post({
        json: { bookId: book.id, name: "Phone", kind: "expense" },
      }),
    );
    await body(
      await t.api.money.bills.$post({
        json: {
          bookId: book.id,
          name: "Phone",
          kind: "bill",
          amountCents: 4_500,
          frequency: "monthly",
          nextDate: "2030-07-10",
          accountId: account.id,
          categoryId: category.id,
        },
      }),
    );
    const param = (id: number) => ({ param: { id: String(id) } });
    expect((await t.api.money.categories[":id"].$delete(param(category.id))).status).toBe(204);
    expect((await t.api.money.accounts[":id"].$delete(param(account.id))).status).toBe(204);
    const [bill] = listBills(t.db, book.id, today).bills;
    expect(bill).toMatchObject({ name: "Phone", accountId: null, categoryId: null });
    expect(forecast(t.db, book.id, 30, today).unassigned.map((item) => item.name)).toEqual([
      "Phone",
    ]);

    expect((await t.api.money.books[":id"].$delete(param(book.id))).status).toBe(204);
  });

  it("show in reminders and the calendar by name", async () => {
    const { book } = await setUp();
    await t.api.money.bills.$post({
      json: {
        bookId: book.id,
        name: "Rent",
        kind: "bill",
        amountCents: 120_000,
        frequency: "monthly",
        nextDate: "2030-07-01",
      },
    });
    const items = datedItems(t.db, "2030-06-25", "2030-07-05");
    expect(items).toContainEqual({
      key: expect.stringMatching(/^bill:\d+:2030-07-01$/),
      kind: "bill",
      title: "Rent",
      date: "2030-07-01",
      href: `/money?book=${book.id}&do=bills`,
    });
  });
});

describe("the forecast", () => {
  it("adds bills and income to today's balance and warns before it runs low", async () => {
    const { book, checking } = await setUp();
    const add = (json: Record<string, unknown>) =>
      t.api.money.bills.$post({
        json: { bookId: book.id, accountId: checking.id, ...json } as never,
      });
    await add({
      name: "Rent",
      kind: "bill",
      amountCents: 45_000,
      frequency: "monthly",
      nextDate: "2030-06-20",
    });
    await add({
      name: "Paycheck",
      kind: "income",
      amountCents: 100_000,
      frequency: "biweekly",
      nextDate: "2030-06-26",
    });
    await t.api.money.bills.$post({
      json: {
        bookId: book.id,
        name: "Gym",
        kind: "subscription",
        amountCents: 3000,
        frequency: "monthly",
        nextDate: "2030-06-18",
      },
    });

    const result = forecast(t.db, book.id, 30, today);
    const [account] = result.accounts;
    expect(account).toMatchObject({
      name: "Checking",
      startCents: 50_000,
      // 500 - 450 + 1000 + 1000
      endCents: 205_000,
      lowest: { date: "2030-06-20", balanceCents: 5000 },
      // Below the usual $100 on the 20th, six days before payday.
      warning: {
        date: "2030-06-20",
        balanceCents: 5000,
        nextIncome: { name: "Paycheck", date: "2030-06-26" },
      },
    });
    expect(result.series).toHaveLength(31);
    expect(result.unassigned.map((bill) => bill.name)).toEqual(["Gym"]);
  });
});
