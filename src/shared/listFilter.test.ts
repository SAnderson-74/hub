import { describe, expect, it } from "vitest";
import {
  compareFor,
  inAmountRange,
  inDateRange,
  matchesWords,
  presetOf,
  presetRange,
  type Sort,
  sliderMax,
} from "./listFilter";

describe("date presets", () => {
  it("end today and start that long before", () => {
    expect(presetRange("1m", "2030-03-15")).toEqual({ from: "2030-02-15", to: "2030-03-15" });
    expect(presetRange("3m", "2030-03-15").from).toBe("2029-12-15");
    expect(presetRange("1y", "2030-03-15").from).toBe("2029-03-15");
    expect(presetRange("ytd", "2030-03-15").from).toBe("2030-01-01");
    // A short month: the 31st lands on the last day.
    expect(presetRange("1m", "2030-03-31").from).toBe("2030-02-28");
  });

  it("are recognized from their dates", () => {
    const { from, to } = presetRange("6m", "2030-03-15");
    expect(presetOf(from, to, "2030-03-15")).toBe("6m");
    expect(presetOf("2030-01-02", to, "2030-03-15")).toBeNull();
  });
});

describe("sorting", () => {
  const rows = [
    { id: 1, date: "2030-01-10", amountCents: -5_000 },
    { id: 2, date: "2030-01-20", amountCents: 20_000 },
    { id: 3, date: "2030-01-20", amountCents: -20_000 },
    { id: 4, date: "2030-01-05", amountCents: 100 },
  ];
  const order = (sort: Sort) => [...rows].sort(compareFor(sort)).map((row) => row.id);

  it("goes by date or by size", () => {
    expect(order("newest")).toEqual([3, 2, 1, 4]);
    expect(order("oldest")).toEqual([4, 1, 2, 3]);
    // Size ignores the sign, and ties go newest first.
    expect(order("largest")).toEqual([3, 2, 1, 4]);
    expect(order("smallest")).toEqual([4, 1, 3, 2]);
  });
});

describe("filters", () => {
  it("compare amounts by size", () => {
    expect(inAmountRange(-20_000, 10_000, null)).toBe(true);
    expect(inAmountRange(5_000, 10_000, null)).toBe(false);
    expect(inAmountRange(-5_000, null, 5_000)).toBe(true);
    expect(inAmountRange(5_001, null, 5_000)).toBe(false);
    expect(inAmountRange(1, null, null)).toBe(true);
  });

  it("include both ends of a date range", () => {
    expect(inDateRange("2030-01-01", "2030-01-01", "2030-01-31")).toBe(true);
    expect(inDateRange("2030-01-31", "2030-01-01", "2030-01-31")).toBe(true);
    expect(inDateRange("2030-02-01", "2030-01-01", "2030-01-31")).toBe(false);
    expect(inDateRange("2030-02-01", null, null)).toBe(true);
  });

  it("match every word typed", () => {
    expect(matchesWords("Example Employer paycheck", "PAYCHECK example")).toBe(true);
    expect(matchesWords("Example Employer", "paycheck")).toBe(false);
    expect(matchesWords("anything", "  ")).toBe(true);
  });

  it("round a slider's top up to a tidy number", () => {
    expect(sliderMax(0)).toBe(10);
    expect(sliderMax(4_250)).toBe(50);
    expect(sliderMax(240_000)).toBe(2_500);
    expect(sliderMax(12_345_600)).toBe(125_000);
  });
});
