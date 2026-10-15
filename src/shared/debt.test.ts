import { describe, expect, it } from "vitest";
import { aprText, type Debt, parseApr, payoffOrder, simulatePayoff } from "./debt";
import { coverageLevel, projectNetWorth, savingsLevel } from "./health";

const card: Debt = {
  id: 1,
  name: "Card",
  balanceCents: 100_000,
  aprBasisPoints: 0,
  minimumCents: 10_000,
};
const store: Debt = {
  id: 2,
  name: "Store card",
  balanceCents: 50_000,
  aprBasisPoints: 0,
  minimumCents: 5_000,
};
const loan: Debt = {
  id: 3,
  name: "Loan",
  balanceCents: 300_000,
  aprBasisPoints: 700,
  minimumCents: 20_000,
};

describe("paying off debts", () => {
  it("orders by balance, by rate, or by hand", () => {
    const rated = [card, { ...store, aprBasisPoints: 2_999 }, loan];
    expect(payoffOrder(rated, "snowball").map((debt) => debt.id)).toEqual([2, 1, 3]);
    expect(payoffOrder(rated, "avalanche").map((debt) => debt.id)).toEqual([2, 3, 1]);
    expect(payoffOrder(rated, "custom", [3, 1]).map((debt) => debt.id)).toEqual([3, 1, 2]);
  });

  it("rolls each paid-off minimum into the next debt", () => {
    // Minimums alone: ten months each.
    expect(simulatePayoff([card, store], "snowball", 0)).toMatchObject({
      months: 10,
      interestCents: 0,
    });
    // $50 extra goes to the store card first ($100 a month, 5 months), then all $200 to the card.
    const plan = simulatePayoff([card, store], "snowball", 5_000);
    expect(plan.months).toBe(8);
    expect(plan.debts).toEqual([
      { id: 2, months: 5, interestCents: 0 },
      { id: 1, months: 8, interestCents: 0 },
    ]);
    expect(plan.balances.slice(0, 3)).toEqual([150_000, 130_000, 110_000]);
    expect(plan.balances.at(-1)).toBe(0);
  });

  it("adds interest monthly, and says when payments never get there", () => {
    const owed: Debt = {
      id: 9,
      name: "Card",
      balanceCents: 100_000,
      aprBasisPoints: 1_200,
      minimumCents: 10_000,
    };
    const plan = simulatePayoff([owed], "avalanche", 0);
    expect(plan.months).toBe(11);
    expect(plan.interestCents).toBeGreaterThan(5_000);
    expect(plan.interestCents).toBeLessThan(6_000);
    // More extra, less interest.
    expect(simulatePayoff([owed], "avalanche", 10_000).interestCents).toBeLessThan(
      plan.interestCents,
    );

    const stuck = simulatePayoff(
      [{ ...owed, aprBasisPoints: 2_400, minimumCents: 1_000 }],
      "avalanche",
      0,
    );
    expect(stuck.months).toBeNull();
    expect(stuck.debts[0]?.months).toBeNull();
  });

  it("puts extra where it saves the most interest with the highest rate first", () => {
    const high: Debt = {
      id: 4,
      name: "High",
      balanceCents: 200_000,
      aprBasisPoints: 2_499,
      minimumCents: 5_000,
    };
    const low: Debt = {
      id: 5,
      name: "Low",
      balanceCents: 100_000,
      aprBasisPoints: 500,
      minimumCents: 5_000,
    };
    const avalanche = simulatePayoff([high, low], "avalanche", 20_000);
    const snowball = simulatePayoff([high, low], "snowball", 20_000);
    expect(avalanche.interestCents).toBeLessThan(snowball.interestCents);
    expect(snowball.debts[0]?.id).toBe(5);
  });

  it("reads and writes rates", () => {
    expect(parseApr("24.99")).toBe(2_499);
    expect(parseApr("7%")).toBe(700);
    expect(parseApr("abc")).toBeNull();
    expect(parseApr("101")).toBeNull();
    expect(aprText(2_499)).toBe("24.99");
    expect(aprText(700)).toBe("7");
  });
});

describe("money health", () => {
  it("names the levels", () => {
    expect(coverageLevel(0.5)).toEqual({ label: "Thin", tone: "danger" });
    expect(coverageLevel(4)).toEqual({ label: "Solid", tone: "ok" });
    expect(savingsLevel(-5).tone).toBe("danger");
    expect(savingsLevel(15)).toEqual({ label: "Healthy", tone: "ok" });
  });

  it("projects net worth from saving and growth", () => {
    const flat = projectNetWorth({
      netCents: 1_000_000,
      investedCents: 0,
      monthlyCents: 10_000,
      returnPercent: 0,
      years: 2,
    });
    expect(flat).toEqual([
      { year: 0, netCents: 1_000_000, savedOnlyCents: 1_000_000 },
      { year: 1, netCents: 1_120_000, savedOnlyCents: 1_120_000 },
      { year: 2, netCents: 1_240_000, savedOnlyCents: 1_240_000 },
    ]);
    const growing = projectNetWorth({
      netCents: 1_000_000,
      investedCents: 0,
      monthlyCents: 10_000,
      returnPercent: 12,
      years: 1,
    });
    expect(growing[1]?.netCents).toBe(1_126_825);
  });
});
