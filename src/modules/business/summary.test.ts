import { describe, expect, it } from "vitest";
import { expiryStatus, leadTotals, phaseLine, planTotals } from "./summary";

describe("planTotals", () => {
  it("counts steps and what's left to spend on unfinished ones", () => {
    const totals = planTotals([
      { done: true, estimateCents: 60_000, spentCents: 55_000 },
      { done: false, estimateCents: 20_000, spentCents: 5_000 },
      { done: false, estimateCents: 1_000, spentCents: 3_000 }, // over: nothing left
      { done: false, estimateCents: null, spentCents: null },
    ]);
    expect(totals).toEqual({
      steps: 4,
      done: 1,
      estimateCents: 81_000,
      spentCents: 63_000,
      leftCents: 15_000,
    });
    expect(phaseLine(totals)).toBe("1 of 4 done · $810 estimated · $630 spent");
    expect(phaseLine(planTotals([]))).toBe("No steps yet");
  });
});

describe("expiryStatus", () => {
  it("flags expired and soon-to-expire certifications", () => {
    expect(expiryStatus(null, "2030-01-01")).toBeNull();
    expect(expiryStatus("2029-12-31", "2030-01-01")).toMatchObject({
      expired: true,
      tone: "danger",
    });
    expect(expiryStatus("2030-04-01", "2030-01-01")).toMatchObject({ soon: true, tone: "warn" });
    expect(expiryStatus("2030-04-02", "2030-01-01")).toMatchObject({ soon: false, tone: "muted" });
  });
});

describe("leadTotals", () => {
  it("adds up open and won leads", () => {
    expect(
      leadTotals([
        { status: "new", valueCents: 10_000 },
        { status: "quoted", valueCents: 25_000 },
        { status: "won", valueCents: 40_000 },
        { status: "lost", valueCents: 99_000 },
        { status: "contacted", valueCents: null },
      ]),
    ).toEqual({ open: 3, openCents: 35_000, wonCents: 40_000 });
  });
});
