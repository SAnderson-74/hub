import { describe, expect, it } from "vitest";
import {
  budgetFor,
  budgetStatus,
  historySummary,
  monthBounds,
  monthSchema,
  remainingText,
  shiftMonth,
} from "./budget";

describe("months", () => {
  it("shift across years in both directions", () => {
    expect(shiftMonth("2030-01", -1)).toBe("2029-12");
    expect(shiftMonth("2030-11", 3)).toBe("2031-02");
    expect(shiftMonth("2030-06", -18)).toBe("2028-12");
    expect(shiftMonth("2030-06", 0)).toBe("2030-06");
  });

  it("know their first and last days, leap years included", () => {
    expect(monthBounds("2030-01")).toEqual({ from: "2030-01-01", to: "2030-01-31" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2030-02").to).toBe("2030-02-28");
  });

  it("are validated", () => {
    expect(monthSchema.safeParse("2030-12").success).toBe(true);
    for (const text of ["2030-13", "2030-1", "30-01", "2030-00"]) {
      expect(monthSchema.safeParse(text).success).toBe(false);
    }
  });
});

describe("budgetFor", () => {
  const entries = [
    { categoryId: 1, month: "2030-01", amountCents: 50_000 },
    { categoryId: 1, month: "2030-04", amountCents: 60_000 },
    { categoryId: 1, month: "2030-07", amountCents: 0 },
    { categoryId: 2, month: "2030-03", amountCents: 10_000 },
  ];

  it("carries the latest amount forward until it changes", () => {
    expect(budgetFor(entries, 1, "2029-12")).toBeNull();
    expect(budgetFor(entries, 1, "2030-01")).toBe(50_000);
    expect(budgetFor(entries, 1, "2030-03")).toBe(50_000);
    expect(budgetFor(entries, 1, "2030-04")).toBe(60_000);
    expect(budgetFor(entries, 1, "2030-06")).toBe(60_000);
  });

  it("treats 0 as no budget from then on", () => {
    expect(budgetFor(entries, 1, "2030-07")).toBeNull();
    expect(budgetFor(entries, 1, "2031-01")).toBeNull();
    expect(budgetFor(entries, 2, "2031-01")).toBe(10_000);
    expect(budgetFor(entries, 3, "2031-01")).toBeNull();
  });
});

describe("budgetStatus", () => {
  it("says what's left, or how far over", () => {
    const under = budgetStatus(50_000, 12_500);
    expect(under).toEqual({ remainingCents: 37_500, percent: 25, over: false });
    expect(remainingText(under)).toBe("$375 left");

    const over = budgetStatus(50_000, 53_050);
    expect(over).toEqual({ remainingCents: -3_050, percent: 100, over: true });
    expect(remainingText(over)).toBe("$30.50 over");

    // Refunds can make spending negative; the bar stays empty.
    expect(budgetStatus(10_000, -500).percent).toBe(0);
  });
});

describe("historySummary", () => {
  it("reads the average and how many budgeted months went over", () => {
    expect(
      historySummary([
        { month: "2030-01", budgetedCents: 0, spentCents: 40_000 },
        { month: "2030-02", budgetedCents: 50_000, spentCents: 55_000 },
        { month: "2030-03", budgetedCents: 50_000, spentCents: 45_000 },
      ]),
    ).toBe(
      "Spending averaged $466.67 a month from Jan to Mar, over budget in 1 of 2 budgeted months.",
    );
    expect(
      historySummary([
        { month: "2030-01", budgetedCents: 0, spentCents: 0 },
        { month: "2030-02", budgetedCents: 0, spentCents: 0 },
      ]),
    ).toBe("No spending in the last 2 months.");
    expect(historySummary([{ month: "2030-01", budgetedCents: 0, spentCents: 100 }])).toBe(
      "Spending averaged $1 a month from Jan to Jan. No budgets were set.",
    );
    expect(historySummary([{ month: "2030-01", budgetedCents: 200, spentCents: 100 }])).toContain(
      "within budget every budgeted month",
    );
  });
});
