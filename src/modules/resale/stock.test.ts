import { describe, expect, it } from "vitest";
import { costSummary, heldFor, stockSummary } from "./stock";

describe("stockSummary", () => {
  it("adds up what's in stock and says what's missing", () => {
    expect(
      stockSummary([
        { status: "acquired", purchaseCents: 2_000, costsCents: 0 },
        { status: "listed", purchaseCents: 1_050, costsCents: 800 },
        { status: "repairing", purchaseCents: null, costsCents: 1_200 },
        { status: "sold", purchaseCents: 9_900, costsCents: 500 },
        { status: "sourcing", purchaseCents: null, costsCents: 0 },
      ]),
    ).toBe("3 in stock, $30.50 paid (1 without a price), $20 in costs. 1 listed.");
    expect(stockSummary([{ status: "listed", purchaseCents: 1_000, costsCents: 0 }])).toBe(
      "1 in stock, $10 paid. 1 listed.",
    );
    expect(stockSummary([{ status: "sold", purchaseCents: 100, costsCents: 0 }])).toBe(
      "Nothing in stock right now.",
    );
    expect(stockSummary([])).toBe("Track what you buy to resell.");
  });
});

describe("heldFor", () => {
  it("counts days only for items still in stock", () => {
    expect(heldFor({ status: "listed", purchasedOn: "2030-01-01" }, "2030-01-13")).toBe(
      "Held 12 days",
    );
    expect(heldFor({ status: "acquired", purchasedOn: "2030-01-12" }, "2030-01-13")).toBe(
      "Held 1 day",
    );
    expect(heldFor({ status: "acquired", purchasedOn: "2030-01-13" }, "2030-01-13")).toBe(
      "Bought today",
    );
    expect(heldFor({ status: "sold", purchasedOn: "2030-01-01" }, "2030-01-13")).toBeNull();
    expect(heldFor({ status: "listed", purchasedOn: null }, "2030-01-13")).toBeNull();
  });
});

describe("costSummary", () => {
  it("totals costs, with the price paid when there is one", () => {
    const cost = { id: 1 };
    expect(costSummary({ costs: [], costsCents: 0, purchaseCents: 2_500 })).toBe("No costs yet.");
    expect(costSummary({ costs: [cost], costsCents: 2_200, purchaseCents: 2_500 })).toBe(
      "$22 in costs. $47 in with the price paid.",
    );
    expect(costSummary({ costs: [cost], costsCents: 850, purchaseCents: null })).toBe(
      "$8.50 in costs.",
    );
  });
});
