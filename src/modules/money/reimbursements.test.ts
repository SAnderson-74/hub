import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { incomeFacts } from "../tithing/transactionLinks";
import { budgetMonth } from "./budget.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

async function setUp() {
  const book = await body(
    await t.api.money.books.$post({ json: { name: "Personal", kind: "personal" } }),
  );
  const checking = await body(
    await t.api.money.accounts.$post({
      json: { bookId: book.id, name: "Checking", kind: "checking" },
    }),
  );
  const dining = await body(
    await t.api.money.categories.$post({
      json: { bookId: book.id, name: "Dining out", kind: "expense" },
    }),
  );
  const other = await body(
    await t.api.money.categories.$post({
      json: { bookId: book.id, name: "Other income", kind: "income" },
    }),
  );
  const add = async (
    date: string,
    amountCents: number,
    payee: string,
    extra: { categoryId?: number | null; counterparty?: string } = {},
  ) =>
    body(
      await t.api.money.transactions.$post({
        json: { accountId: checking.id, date, amountCents, payee, ...extra },
      }),
    );
  return { book, checking, dining, other, add };
}

const owedOf = async (bookId: number) =>
  body(await t.api.money.owed.$get({ query: { bookId: String(bookId) } }));

describe("money owed back", () => {
  it("is matched to its repayment, which then counts as a refund outside tithing", async () => {
    const { book, dining, other, add } = await setUp();
    const dinner = await add("2030-03-05", -12_000, "Pizza Place", { categoryId: dining.id });
    // A rule had put the repayment in an income category.
    const repayment = await add("2030-03-07", 6_000, "Venmo", {
      categoryId: other.id,
      counterparty: "Jane Doe",
    });
    const paycheck = await add("2030-03-01", 6_000, "Example Employer");

    const claim = await body(
      await t.api.money.owed.$post({
        json: { transactionId: dinner.id, amountCents: 6_000, who: "Jane" },
      }),
    );
    expect(claim).toMatchObject({
      amountCents: 6_000,
      who: "Jane",
      original: { payee: "Pizza Place", category: "Dining out" },
      repayment: null,
    });

    // Jane's payment comes first among the candidates; the paycheck is the same amount but
    // doesn't name her.
    let owed = await owedOf(book.id);
    expect(owed.openCents).toBe(6_000);
    expect(owed.open[0]?.candidates.map((row) => row.id)).toEqual([repayment.id, paycheck.id]);
    expect(
      (
        await body(
          await t.api.money.transactions[":id"].owed.$get({ param: { id: String(repayment.id) } }),
        )
      ).matches.map((row) => row.id),
    ).toEqual([claim.id]);

    const matched = await body(
      await t.api.money.owed[":id"].repaid.$post({
        param: { id: String(claim.id) },
        json: { repaymentId: repayment.id },
      }),
    );
    expect(matched.repayment).toMatchObject({ id: repayment.id, amountCents: 6_000 });
    owed = await owedOf(book.id);
    expect(owed).toMatchObject({ open: [], openCents: 0 });
    expect(owed.repaid.map((row) => row.id)).toEqual([claim.id]);

    // Only your half counts as dining out, and tithing leaves the repayment out.
    const march = budgetMonth(t.db, book.id, "2030-03");
    expect(march.categories.find((row) => row.id === dining.id)?.spentCents).toBe(6_000);
    expect(march.totals.incomeCents).toBe(0);
    const facts = incomeFacts(t.db, [
      { id: repayment.id, amountCents: 6_000, transferPeerId: null, categoryId: dining.id },
      { id: paycheck.id, amountCents: 6_000, transferPeerId: null, categoryId: null },
    ]);
    expect(facts.get(repayment.id)?.applies).toBe(false);
    expect(facts.get(paycheck.id)?.applies).toBe(true);
    const onRepayment = await body(
      await t.api.money.transactions[":id"].owed.$get({ param: { id: String(repayment.id) } }),
    );
    expect(onRepayment.repays.map((row) => row.id)).toEqual([claim.id]);

    // Unmatched, it's open again; the repayment keeps its category.
    await body(await t.api.money.owed[":id"].repaid.$delete({ param: { id: String(claim.id) } }));
    expect((await owedOf(book.id)).openCents).toBe(6_000);

    // Deleting the repayment unmatches; deleting the spending removes the claim.
    await t.api.money.owed[":id"].repaid.$post({
      param: { id: String(claim.id) },
      json: { repaymentId: repayment.id },
    });
    await t.api.money.transactions[":id"].$delete({ param: { id: String(repayment.id) } });
    expect((await owedOf(book.id)).open.map((row) => row.id)).toEqual([claim.id]);
    await t.api.money.transactions[":id"].$delete({ param: { id: String(dinner.id) } });
    expect((await owedOf(book.id)).open).toEqual([]);
  });

  it("can't be more than the spending, or more than a repayment brought in", async () => {
    const { book, dining, add } = await setUp();
    const dinner = await add("2030-03-05", -9_000, "Pizza Place", { categoryId: dining.id });
    const pay = await add("2030-03-08", 5_000, "Venmo", { counterparty: "Jane Doe" });
    const paycheck = await add("2030-03-01", 400_000, "Example Employer");
    const owe = (amountCents: number, who = "") =>
      t.api.money.owed.$post({ json: { transactionId: dinner.id, amountCents, who } });

    const jane = await body(await owe(3_000, "Jane"));
    const sam = await body(await owe(3_000, "Sam"));
    expect((await failure(await owe(3_001))).error).toMatch(/more than the \$30/);
    expect(
      (
        await failure(
          await t.api.money.owed.$post({ json: { transactionId: paycheck.id, amountCents: 100 } }),
        )
      ).status,
    ).toBe(400);

    // Jane pays for both, but only $50 came in.
    const match = (id: number, repaymentId: number) =>
      t.api.money.owed[":id"].repaid.$post({ param: { id: String(id) }, json: { repaymentId } });
    await body(await match(jane.id, pay.id));
    expect((await failure(await match(sam.id, pay.id))).status).toBe(400);
    expect((await failure(await match(sam.id, dinner.id))).status).toBe(400);
    expect(
      (
        await failure(
          await t.api.money.owed[":id"].$patch({
            param: { id: String(jane.id) },
            json: { amountCents: 6_000 },
          }),
        )
      ).status,
    ).toBe(400);
    await body(
      await t.api.money.owed[":id"].$patch({
        param: { id: String(sam.id) },
        json: { amountCents: 2_000 },
      }),
    );
    await body(await match(sam.id, pay.id));
    expect((await owedOf(book.id)).openCents).toBe(0);

    expect((await t.api.money.owed[":id"].$delete({ param: { id: String(sam.id) } })).status).toBe(
      204,
    );
    expect(
      (await failure(await t.api.money.owed[":id"].$delete({ param: { id: String(sam.id) } })))
        .status,
    ).toBe(404);
  });
});
