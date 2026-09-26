import { describe, expect, it } from "vitest";
import { courseBar, defaultTerm, formatCredits, monthTicks, termPercent } from "./pacing";

const term = { startDate: "2030-01-01", endDate: "2030-01-31" };

describe("pacing timeline", () => {
  it("places dates across the term, clamped to its ends", () => {
    expect(termPercent("2030-01-01", term.startDate, term.endDate)).toBe(0);
    expect(termPercent("2030-01-16", term.startDate, term.endDate)).toBe(50);
    expect(termPercent("2029-12-01", term.startDate, term.endDate)).toBe(0);
    expect(termPercent("2030-03-01", term.startDate, term.endDate)).toBe(100);
  });

  it("draws course bars, spanning the term when unplanned", () => {
    expect(courseBar({ plannedStart: "2030-01-01", plannedEnd: "2030-01-16" }, term)).toEqual({
      left: 0,
      width: 50,
      planned: true,
    });
    expect(courseBar({ plannedStart: null, plannedEnd: null }, term)).toEqual({
      left: 0,
      width: 100,
      planned: false,
    });
    expect(courseBar({ plannedStart: "2030-01-31", plannedEnd: "2030-01-31" }, term).width).toBe(2);
  });

  it("marks the months inside a term", () => {
    expect(monthTicks("2030-01-15", "2030-04-10").map((tick) => tick.label)).toEqual([
      "Feb",
      "Mar",
      "Apr",
    ]);
    expect(monthTicks("2030-11-01", "2031-01-31").map((tick) => tick.date)).toEqual([
      "2030-11-01",
      "2030-12-01",
      "2031-01-01",
    ]);
    expect(monthTicks("2030-11-01", "2031-01-31")[0]?.left).toBe(0);
  });

  it("formats credits and picks the term to show", () => {
    expect([formatCredits(1), formatCredits(3), formatCredits(1.5)]).toEqual([
      "1 credit",
      "3 credits",
      "1.5 credits",
    ]);
    const terms = [
      { id: 1, startDate: "2030-01-01", endDate: "2030-06-30" },
      { id: 2, startDate: "2030-07-01", endDate: "2030-12-31" },
    ];
    expect(defaultTerm(terms, "2030-08-01")?.id).toBe(2);
    expect(defaultTerm(terms, "2029-10-01")?.id).toBe(1);
    expect(defaultTerm(terms, "2031-03-01")?.id).toBe(2);
    expect(defaultTerm([], "2031-03-01")).toBeUndefined();
  });
});
