import { describe, expect, it } from "vitest";
import { type NetWorthPoint, netWorthSummary } from "./netWorth";

const point = (month: string, netCents: number): NetWorthPoint => ({
  month,
  date: `${month}-28`,
  assetsCents: Math.max(0, netCents),
  debtsCents: Math.max(0, -netCents),
  netCents,
});

describe("netWorthSummary", () => {
  it("says where it stands and how it moved", () => {
    expect(netWorthSummary([point("2029-10", 100_000), point("2030-03", 410_000)])).toBe(
      "Net worth is $4,100, up $3,100 since the end of Oct 2029.",
    );
    expect(netWorthSummary([point("2029-10", 50_000), point("2030-03", -25_050)])).toBe(
      "Net worth is -$250.50, down $750.50 since the end of Oct 2029.",
    );
    expect(netWorthSummary([point("2029-10", 100), point("2030-03", 100)])).toBe(
      "Net worth is $1, the same as at the end of Oct 2029.",
    );
    expect(netWorthSummary([point("2030-03", 100)])).toBe(
      "Net worth is $1. The chart fills in as months go by.",
    );
    expect(netWorthSummary([])).toBe("No accounts yet.");
  });
});
