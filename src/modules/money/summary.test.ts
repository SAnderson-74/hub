import { describe, expect, it } from "vitest";
import { accountsSummary, netBalance } from "./summary";

describe("accountsSummary", () => {
  it("nets money owed against money held, archived accounts included", () => {
    const accounts = [
      { balanceCents: 150_000, archived: false },
      { balanceCents: -40_000, archived: false },
      { balanceCents: 1_000, archived: true },
    ];
    expect(netBalance(accounts)).toBe(111_000);
    expect(accountsSummary(accounts)).toBe("2 accounts, $1,110 net");
    expect(accountsSummary([{ balanceCents: -2_550, archived: false }])).toBe(
      "1 account, -$25.50 net",
    );
    expect(accountsSummary([])).toBe("No accounts yet");
  });
});
