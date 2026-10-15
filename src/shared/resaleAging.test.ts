import { describe, expect, it } from "vitest";
import { inventoryAging } from "./resaleAging";

const today = "2030-06-30";
const item = (id: number, extra: Record<string, unknown>) => ({
  id,
  title: `Item ${id}`,
  status: "acquired" as const,
  category: "",
  purchasedOn: null,
  purchaseCents: 1_000,
  costsCents: 0,
  soldOn: null,
  createdAt: "2030-06-01T00:00:00.000Z",
  listings: [],
  ...extra,
});

describe("inventory aging", () => {
  it("groups stock by age and says what to do with what's sat", () => {
    const items = [
      item(1, { purchasedOn: "2030-06-25" }),
      item(2, { purchasedOn: "2030-06-01", costsCents: 500 }),
      item(3, { purchasedOn: "2030-04-01", status: "repairing" }),
      item(4, {
        purchasedOn: "2030-03-01",
        status: "listed",
        listings: [
          {
            listedOn: "2030-03-10",
            endedOn: null,
            priceCents: 5_000,
            prices: [{ changedOn: "2030-03-10" }],
          },
        ],
      }),
      item(5, {
        purchasedOn: "2030-05-15",
        status: "listed",
        listings: [
          {
            listedOn: "2030-05-20",
            endedOn: null,
            priceCents: 4_550,
            prices: [{ changedOn: "2030-05-20" }],
          },
        ],
      }),
      item(6, { purchasedOn: "2029-11-01" }),
    ];
    const aging = inventoryAging(items, today);
    expect(aging.groups.map((group) => group.count)).toEqual([2, 1, 0, 2, 1]);
    expect(aging.groups[0]?.cents).toBe(2_500);
    expect(aging.inStock).toBe(6);
    expect(aging.suggestions.map((s) => [s.itemId, s.kind])).toEqual([
      [6, "list"],
      [4, "relist"],
      [3, "repair"],
      [5, "reprice"],
      [2, "list"],
    ]);
    expect(aging.suggestions.find((s) => s.kind === "reprice")?.priceCents).toBe(4_100);
  });

  it("works out sell-through and days to sell, by category", () => {
    const items = [
      item(1, {
        status: "sold",
        category: "Bikes",
        purchasedOn: "2030-05-01",
        soldOn: "2030-06-10",
      }),
      item(2, {
        status: "sold",
        category: "Bikes",
        purchasedOn: "2030-05-20",
        soldOn: "2030-06-09",
      }),
      item(3, {
        status: "sold",
        category: "Books",
        purchasedOn: "2030-06-01",
        soldOn: "2030-06-06",
      }),
      // Sold too long ago to count.
      item(4, {
        status: "sold",
        category: "Books",
        purchasedOn: "2029-01-01",
        soldOn: "2029-02-01",
      }),
      item(5, { purchasedOn: "2030-06-20" }),
    ];
    const aging = inventoryAging(items, today);
    expect(aging).toMatchObject({ soldInWindow: 3, sellThroughPercent: 75, medianDaysToSell: 20 });
    expect(aging.categories).toEqual([
      { name: "Bikes", medianDays: 30, sold: 2 },
      { name: "Books", medianDays: 5, sold: 1 },
    ]);
    expect(inventoryAging([], today)).toMatchObject({
      sellThroughPercent: null,
      medianDaysToSell: null,
    });
  });
});
