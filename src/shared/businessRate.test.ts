import { describe, expect, it } from "vitest";
import { defaultBusinessRate, hourlyRate } from "./businessRate";

describe("hourlyRate", () => {
  it("covers the income after taxes, plus business costs, over billable hours", () => {
    // Keep $50,000 at 30% taxes: $71,428.57 of profit, plus $5,000 of costs, is
    // $76,428.57 a year over 25 × 46 = 1,150 hours: $66.46, so $67 an hour.
    expect(hourlyRate(defaultBusinessRate)).toEqual({
      hourlyCents: 6_700,
      revenueCents: 7_642_857,
      profitCents: 7_142_857,
      taxCents: 2_142_857,
      billableHours: 1_150,
    });
  });

  it("rounds up to a whole dollar and handles no taxes or costs", () => {
    expect(
      hourlyRate({
        incomeCents: 1_000_000,
        overheadCents: 0,
        taxPercent: 0,
        hoursPerWeek: 10,
        weeksPerYear: 50,
      }),
    ).toMatchObject({ hourlyCents: 2_000, taxCents: 0, billableHours: 500 });
    expect(
      hourlyRate({
        incomeCents: 1_000_001,
        overheadCents: 0,
        taxPercent: 0,
        hoursPerWeek: 10,
        weeksPerYear: 50,
      }).hourlyCents,
    ).toBe(2_100);
  });
});
