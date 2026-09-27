import { describe, expect, it } from "vitest";
import {
  estimatedTaxDates,
  resaleYear,
  resaleYears,
  setAside,
  setAsideSummary,
  type TaxItem,
} from "./estimate";
import { isStale, TAX_LESSONS } from "./lessons";

const item = (fields: Partial<TaxItem>): TaxItem => ({
  status: "sold",
  purchasedOn: null,
  purchaseCents: 1_000,
  soldOn: "2030-05-01",
  saleCents: 5_000,
  costsCents: 0,
  ...fields,
});

describe("resaleYear", () => {
  it("adds up the year's sales against what the sold items cost", () => {
    const summary = resaleYear(
      [
        item({ saleCents: 9_500, purchaseCents: 4_000, costsCents: 1_200 }),
        item({ saleCents: 2_000, purchaseCents: null, soldOn: "2030-12-31" }),
        item({ soldOn: "2029-12-31" }), // another year
        item({ saleCents: null }), // sold with no price
        item({ soldOn: null }), // sold with no date
        // Bought this year and still on hand: inventory, not a cost yet.
        item({
          status: "listed",
          purchasedOn: "2030-02-01",
          purchaseCents: 3_000,
          costsCents: 500,
        }),
        item({ status: "acquired", purchasedOn: "2029-02-01" }),
      ],
      2030,
    );
    expect(summary).toEqual({
      year: 2030,
      sold: 2,
      salesCents: 11_500,
      itemCostCents: 4_000,
      otherCostCents: 1_200,
      profitCents: 6_300,
      unpriced: 1,
      missingSalePrice: 1,
      undated: 1,
      onHand: 1,
      onHandCents: 3_500,
    });
  });

  it("lists years with sales and the current year, newest first", () => {
    expect(
      resaleYears(
        [
          item({ soldOn: "2028-01-01" }),
          item({ soldOn: "2030-01-01" }),
          item({ status: "listed" }),
        ],
        2031,
      ),
    ).toEqual([2031, 2030, 2028]);
  });
});

describe("setAside", () => {
  it("adds self-employment tax and income tax at the bracket", () => {
    // $10,000 profit: SE tax is 15.3% of $9,235 = $1,412.96. Income tax is 12% of
    // $10,000 less half of that ($9,293.52) = $1,115.22.
    const result = setAside(1_000_000, 12, 2026);
    expect(result).toMatchObject({
      selfEmploymentCents: 141_296,
      incomeTaxCents: 111_522,
      totalCents: 252_818,
      underMinimum: false,
      overWageBase: false,
    });
    expect(result.share).toBeCloseTo(0.2528, 4);
    expect(setAsideSummary(result)).toBe("Set aside about $2,528 (25% of profit).");
  });

  it("skips self-employment tax under $400 of net earnings, and has nothing for a loss", () => {
    // $430 profit is $397.11 of net earnings.
    expect(setAside(43_000, 10, 2026)).toMatchObject({
      selfEmploymentCents: 0,
      incomeTaxCents: 4_300,
      underMinimum: true,
    });
    const loss = setAside(-5_000, 22, 2026);
    expect(loss.totalCents).toBe(0);
    expect(setAsideSummary(loss)).toBe("No profit, so nothing to set aside.");
  });

  it("flags earnings past the year's Social Security limit", () => {
    // $184,500 of 2026 net earnings needs about $199,784 of profit.
    expect(setAside(19_000_000, 24, 2026).overWageBase).toBe(false);
    expect(setAside(20_000_000, 24, 2026).overWageBase).toBe(true);
    expect(setAside(19_500_000, 24, 2025).overWageBase).toBe(true); // $176,100 limit
    // Years without a known limit use the latest one.
    expect(setAside(20_000_000, 24, 2031).overWageBase).toBe(true);
  });

  it("lists the estimated payment dates, the last in January", () => {
    expect(estimatedTaxDates(2026)).toEqual([
      "2026-04-15",
      "2026-06-15",
      "2026-09-15",
      "2027-01-15",
    ]);
  });
});

describe("lessons", () => {
  it("each have sources on official sites and a review date", () => {
    for (const lesson of TAX_LESSONS) {
      expect(lesson.sources.length, lesson.id).toBeGreaterThan(0);
      for (const source of lesson.sources) {
        expect(source.url, lesson.id).toMatch(/^https:\/\/www\.(irs|ssa)\.gov\//);
      }
      expect(lesson.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(new Set(TAX_LESSONS.map((lesson) => lesson.id)).size).toBe(TAX_LESSONS.length);
  });

  it("go stale a year after review", () => {
    expect(isStale("2026-09-27", "2027-09-27")).toBe(false);
    expect(isStale("2026-09-27", "2027-09-29")).toBe(true);
  });
});
