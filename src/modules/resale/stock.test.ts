import { describe, expect, it } from "vitest";
import { costSummary, heldFor, listingAge, staleListings, stockSummary } from "./stock";

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
    expect(
      heldFor({ status: "sold", purchasedOn: "2030-01-01", soldOn: "2030-01-19" }, "2030-02-01"),
    ).toBe("Sold after 18 days");
    expect(
      heldFor({ status: "sold", purchasedOn: "2030-01-01", soldOn: "2030-01-01" }, "2030-02-01"),
    ).toBe("Sold the day it was bought");
    expect(heldFor({ status: "kept", purchasedOn: "2030-01-01" }, "2030-01-13")).toBeNull();
    expect(heldFor({ status: "acquired", purchasedOn: "2030-02-01" }, "2030-01-13")).toBeNull();
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

describe("listingAge", () => {
  it("counts days up, to today or to when it ended", () => {
    expect(listingAge({ listedOn: "2030-01-05", endedOn: null }, "2030-01-12")).toBe("Up 7 days");
    expect(listingAge({ listedOn: "2030-01-12", endedOn: null }, "2030-01-12")).toBe(
      "Listed today",
    );
    expect(listingAge({ listedOn: "2030-01-05", endedOn: "2030-01-06" }, "2030-02-01")).toBe(
      "Was up 1 day",
    );
  });
});

describe("staleListings", () => {
  it("finds open listings that have kept their price too long", () => {
    const today = "2030-03-31";
    const listing = (listedOn: string, changes: string[], endedOn: string | null = null) => ({
      listedOn,
      endedOn,
      priceCents: 5000,
      prices: [listedOn, ...changes].map((changedOn) => ({ changedOn })),
    });
    const stale = staleListings(
      [
        { id: 1, title: "Lamp", status: "listed", listings: [listing("2030-01-15", [])] },
        {
          id: 2,
          title: "Camera",
          status: "listed",
          listings: [listing("2030-01-01", ["2030-03-20"])],
        },
        { id: 3, title: "Bike", status: "listed", listings: [listing("2030-02-20", [])] },
        {
          id: 4,
          title: "Ended",
          status: "listed",
          listings: [listing("2030-01-01", [], "2030-02-01")],
        },
        { id: 5, title: "Sold", status: "sold", listings: [listing("2030-01-01", [])] },
      ],
      today,
    );
    expect(stale).toEqual([
      { itemId: 1, title: "Lamp", daysUp: 75, daysSamePrice: 75, priceCents: 5000 },
      { itemId: 3, title: "Bike", daysUp: 39, daysSamePrice: 39, priceCents: 5000 },
    ]);
  });
});
