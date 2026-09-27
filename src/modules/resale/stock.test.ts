import { describe, expect, it } from "vitest";
import { heldFor, stockSummary } from "./stock";

describe("stockSummary", () => {
  it("adds up what's in stock and says what's missing", () => {
    expect(
      stockSummary([
        { status: "acquired", purchaseCents: 2_000 },
        { status: "listed", purchaseCents: 1_050 },
        { status: "repairing", purchaseCents: null },
        { status: "sold", purchaseCents: 9_900 },
        { status: "sourcing", purchaseCents: null },
      ]),
    ).toBe("3 in stock, $30.50 paid (1 without a price). 1 listed.");
    expect(stockSummary([{ status: "sold", purchaseCents: 100 }])).toBe(
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
