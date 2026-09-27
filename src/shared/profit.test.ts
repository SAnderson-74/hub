import { describe, expect, it } from "vitest";
import {
  formatMargin,
  formatPerHour,
  itemProfit,
  monthSummary,
  type ProfitInput,
  platformSummary,
  profitByMonth,
  profitByPlatform,
  profitTotals,
} from "./profit";

const market = { id: 1, name: "Local classifieds" };
const shop = { id: 2, name: "Example Market" };
const sold = (id: number, fields: Partial<ProfitInput>): ProfitInput => ({
  id,
  status: "sold",
  soldOn: "2030-03-10",
  saleCents: 10_000,
  purchaseCents: 4_000,
  costsCents: 1_000,
  timeMinutes: 0,
  salePlatform: market,
  ...fields,
});

describe("itemProfit", () => {
  it("takes the price paid and costs from the sale", () => {
    expect(itemProfit(sold(1, { timeMinutes: 90 }))).toEqual({
      saleCents: 10_000,
      spentCents: 5_000,
      profitCents: 5_000,
      margin: 0.5,
      perHourCents: 3_333,
      unpriced: false,
    });
  });

  it("counts a missing price as $0 and says so, and skips unsold items", () => {
    expect(itemProfit(sold(1, { purchaseCents: null }))).toMatchObject({
      profitCents: 9_000,
      unpriced: true,
      perHourCents: null,
    });
    expect(itemProfit(sold(1, { status: "listed" }))).toBeNull();
    expect(itemProfit(sold(1, { saleCents: null }))).toBeNull();
    expect(itemProfit(sold(1, { saleCents: 0 }))?.margin).toBeNull();
  });
});

describe("profitTotals", () => {
  it("adds up sales and bases profit per hour on timed sales only", () => {
    const totals = profitTotals([
      sold(1, { timeMinutes: 60 }),
      sold(2, { saleCents: 3_000, purchaseCents: 2_000, costsCents: 1_500 }),
      sold(3, { saleCents: null }),
      sold(4, { status: "listed" }),
    ]);
    expect(totals).toEqual({
      sales: 2,
      saleCents: 13_000,
      profitCents: 4_500,
      margin: 4_500 / 13_000,
      perHourCents: 5_000,
      timedSales: 1,
      missingSalePrice: 1,
      unpriced: 0,
    });
  });
});

describe("profitByMonth", () => {
  it("lists every month in the window, oldest first, across a year boundary", () => {
    const months = profitByMonth(
      [
        sold(1, { soldOn: "2030-01-05" }),
        sold(2, { soldOn: "2030-01-20", saleCents: 4_000 }),
        sold(3, { soldOn: "2029-11-02", saleCents: 3_000 }),
        sold(4, { soldOn: "2028-01-01" }),
      ],
      "2030-02",
      4,
    );
    expect(months).toEqual([
      { month: "2029-11", sales: 1, saleCents: 3_000, profitCents: -2_000 },
      { month: "2029-12", sales: 0, saleCents: 0, profitCents: 0 },
      { month: "2030-01", sales: 2, saleCents: 14_000, profitCents: 4_000 },
      { month: "2030-02", sales: 0, saleCents: 0, profitCents: 0 },
    ]);
    expect(monthSummary(months)).toBe(
      "$20 profit over the last 4 months, best in Jan 2030 ($40). 1 month at a loss.",
    );
    expect(monthSummary(profitByMonth([], "2030-02", 12))).toBe("No sales in the last 12 months.");
  });
});

describe("profitByPlatform", () => {
  it("groups by platform sold on, most profitable first", () => {
    const platforms = profitByPlatform([
      sold(1, {}),
      sold(2, { salePlatform: shop, saleCents: 20_000 }),
      sold(3, { salePlatform: null, saleCents: 4_000 }),
    ]);
    expect(platforms.map((entry) => [entry.name, entry.sales, entry.profitCents])).toEqual([
      ["Example Market", 1, 15_000],
      ["Local classifieds", 1, 5_000],
      ["No platform", 1, -1_000],
    ]);
    expect(platformSummary(platforms)).toBe("Most profit on Example Market: $150 from 1 sale.");
    expect(platformSummary(platforms.slice(1, 2))).toBe(
      "All profit so far is from Local classifieds: $50 from 1 sale.",
    );
  });
});

it("formats margins and hourly profit, including losses", () => {
  expect(formatMargin(0.404)).toBe("40%");
  expect(formatMargin(-0.125)).toBe("-13%");
  expect(formatMargin(null)).toBe("No margin");
  expect(formatPerHour(3_350)).toBe("$33.50/h");
  expect(formatPerHour(-500)).toBe("-$5/h");
  expect(formatPerHour(null)).toBe("No time logged");
});
