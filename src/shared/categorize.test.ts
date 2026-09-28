import { describe, expect, it } from "vitest";
import {
  buildGroups,
  type CategorizedTransaction,
  type CategoryOption,
  findRepeats,
  type PendingTransaction,
} from "./categorize";

const categories: CategoryOption[] = [
  { id: 1, name: "Groceries", kind: "expense", archived: false },
  { id: 2, name: "Dining out", kind: "expense", archived: false },
  { id: 3, name: "Rent", kind: "expense", archived: false },
  { id: 4, name: "Paycheck", kind: "income", archived: false },
  { id: 5, name: "Subscriptions", kind: "expense", archived: false },
  { id: 6, name: "Old stuff", kind: "expense", archived: true },
];

let nextId = 1;
const pending = (
  payee: string,
  amountCents: number,
  date = "2030-03-01",
  memo = "",
): PendingTransaction => ({
  id: nextId++,
  date,
  amountCents,
  payee,
  memo,
  counterparty: null,
});
const done = (payee: string, categoryId: number, amountCents = -1_000): CategorizedTransaction => ({
  payee,
  memo: "",
  amountCents,
  counterparty: null,
  categoryId,
});

describe("buildGroups", () => {
  it("groups a merchant's stores, biggest group first", () => {
    const groups = buildGroups(
      [
        pending("SQ *CORNER GROCERY 4412", -2_000),
        pending("CORNER GROCERY SEATTLE WA", -3_000),
        pending("NEIGHBORHOOD BOOKS", -1_500),
      ],
      [],
      categories,
    );
    expect(
      groups.map((group) => [group.name, group.transactionIds.length, group.outCents]),
    ).toEqual([
      ["Corner Grocery", 2, 5_000],
      ["Neighborhood Books", 1, 1_500],
    ]);
    expect(groups[0]?.direction).toBe("out");
  });

  it("suggests what similar transactions were put in before, and says why", () => {
    const [group] = buildGroups(
      [pending("SQ *CORNER GROCERY 4412", -2_000)],
      [
        done("CORNER GROCERY #1", 1),
        done("Corner Grocery", 1),
        done("CORNER GROCERY SEATTLE WA", 1),
        done("CORNER GROCERY", 2),
      ],
      categories,
    );
    expect(group?.suggestion).toEqual({
      categoryId: 1,
      confidence: "medium",
      reason: "You put 3 of 4 like this in Groceries",
    });
  });

  it("is sure when every earlier one agrees", () => {
    const [group] = buildGroups(
      [pending("CORNER GROCERY", -2_000)],
      [done("CORNER GROCERY 12", 1), done("SQ *CORNER GROCERY", 1)],
      categories,
    );
    expect(group?.suggestion?.confidence).toBe("high");
  });

  it("follows the book's rules first", () => {
    const [group] = buildGroups(
      [pending("CORNER GROCERY", -2_000)],
      [done("CORNER GROCERY", 2)],
      categories,
      [{ contains: "corner", direction: "any", categoryId: 1, renameTo: "" }],
    );
    expect(group?.suggestion).toEqual({
      categoryId: 1,
      confidence: "high",
      reason: "Your rule for “corner” puts these in Groceries",
    });
  });

  it("suggests from a similar merchant name", () => {
    const [group] = buildGroups(
      [pending("SUNRISE CAFE", -900)],
      [done("SUNRISE BAKERY CAFE", 2)],
      categories,
    );
    expect(group?.suggestion).toEqual({
      categoryId: 2,
      confidence: "medium",
      reason: "Similar to Sunrise Bakery Cafe, which you put in Dining out",
    });
  });

  it("groups payment-app transactions by person, and learns from them", () => {
    const groups = buildGroups(
      [
        pending("VENMO *JOHN SMITH", -80_000),
        pending("Zelle payment to Jane Doe Conf# 12", -2_000),
        pending("VENMO *JANE DOE", -1_000),
      ],
      [{ ...done("ZELLE TO JOHN SMITH", 3), counterparty: "John Smith" }],
      categories,
    );
    const john = groups.find((group) => group.name === "Venmo: John Smith");
    expect(john?.suggestion).toEqual({
      categoryId: 3,
      confidence: "medium",
      reason: "You put other payments with John Smith in Rent",
    });
    // Jane on Zelle and on Venmo are separate groups, with nothing to go on.
    expect(groups.filter((group) => group.name.endsWith("Jane Doe"))).toHaveLength(2);
    expect(groups.find((group) => group.name === "Venmo: Jane Doe")?.suggestion).toBeNull();
  });

  it("matches common words to the book's own categories", () => {
    const groups = buildGroups(
      [
        pending("TST* LUIGIS PIZZA", -2_500),
        pending("ACME CORP PAYROLL", 250_000),
        pending("SOMETHING UNKNOWN", -100),
      ],
      [],
      categories,
    );
    const by = (name: string) => groups.find((group) => group.name === name)?.suggestion;
    expect(by("Luigis Pizza")).toEqual({
      categoryId: 2,
      confidence: "low",
      reason: "Looks like a restaurant or cafe",
    });
    expect(by("Acme Payroll")).toMatchObject({ categoryId: 4, reason: "Looks like a paycheck" });
    expect(by("Something Unknown")).toBeNull();
  });

  it("never suggests archived categories, or income categories for money out", () => {
    const [group] = buildGroups(
      [pending("NEIGHBORHOOD BOOKS", -2_000)],
      [done("NEIGHBORHOOD BOOKS", 6), done("NEIGHBORHOOD BOOKS", 6)],
      categories,
    );
    expect(group?.suggestion).toBeNull();
    const [payroll] = buildGroups([pending("PAYROLL REFUND", -500)], [], categories);
    expect(payroll?.suggestion).toBeNull();
  });

  it("notices charges that repeat, and suggests subscriptions for them", () => {
    const [group] = buildGroups(
      [
        pending("STREAMCO 555-123-4567", -1_599, "2030-01-03"),
        pending("STREAMCO 555-123-4567", -1_599, "2030-02-03"),
        pending("STREAMCO 555-123-4567", -1_599, "2030-03-04"),
      ],
      [],
      categories,
    );
    expect(group?.repeats).toEqual({ every: "month", typicalCents: 1_599 });
    expect(group?.suggestion).toEqual({
      categoryId: 5,
      confidence: "low",
      reason: "Charged about every month",
    });
  });
});

describe("findRepeats", () => {
  it("finds weekly, monthly, and yearly charges, but not scattered ones", () => {
    const rows = (dates: string[], amount = -1_000) =>
      dates.map((date) => ({ date, amountCents: amount }));
    expect(findRepeats(rows(["2030-01-01", "2030-01-08", "2030-01-15", "2030-01-22"]))?.every).toBe(
      "week",
    );
    expect(findRepeats(rows(["2028-05-01", "2029-05-02", "2030-04-30"]))?.every).toBe("year");
    expect(findRepeats(rows(["2030-01-01", "2030-01-05", "2030-02-20"]))).toBeNull();
    expect(findRepeats(rows(["2030-01-01", "2030-02-01"]))).toBeNull();
    // Monthly, but the amount jumps around too much.
    expect(
      findRepeats([
        { date: "2030-01-01", amountCents: -1_000 },
        { date: "2030-02-01", amountCents: -9_000 },
        { date: "2030-03-01", amountCents: -4_000 },
      ]),
    ).toBeNull();
  });
});
