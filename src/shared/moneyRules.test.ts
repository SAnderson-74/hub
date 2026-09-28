import { describe, expect, it } from "vitest";
import { findTransferPairs, matchRule, type RuleLike } from "./moneyRules";

const rule = (contains: string, categoryId: number, fields: Partial<RuleLike> = {}): RuleLike => ({
  contains,
  categoryId,
  direction: "any",
  renameTo: "",
  ...fields,
});

describe("matchRule", () => {
  const rules = [
    rule("grocery", 1),
    rule("refund", 2, { direction: "in" }),
    rule("amazon", 3, { direction: "out" }),
    rule("amazon", 4),
  ];

  it("takes the first rule whose text is in the payee, ignoring case", () => {
    expect(matchRule(rules, { payee: "SQ *CORNER GROCERY 4412", amountCents: -500 })).toBe(
      rules[0],
    );
    expect(matchRule(rules, { payee: "Bakery", amountCents: -500 })).toBeNull();
  });

  it("respects money in or out", () => {
    expect(matchRule(rules, { payee: "Store refund", amountCents: 500 })).toBe(rules[1]);
    expect(matchRule(rules, { payee: "Store refund", amountCents: -500 })).toBeNull();
    // The money-out rule comes first but doesn't fit, so the next one does.
    expect(matchRule(rules, { payee: "Amazon", amountCents: 900 })).toBe(rules[3]);
    expect(matchRule(rules, { payee: "Amazon", amountCents: -900 })).toBe(rules[2]);
  });

  it("ignores rules with no text", () => {
    expect(matchRule([rule("  ", 1)], { payee: "Anything", amountCents: -1 })).toBeNull();
    expect(matchRule([rule("*", 1)], { payee: "SQ *Shop", amountCents: -1 })?.categoryId).toBe(1);
    expect(matchRule([rule("#", 1)], { payee: "Shop", amountCents: -1 })).toBeNull();
  });

  it("ignores punctuation, and finds the person on a payment app", () => {
    expect(
      matchRule([rule("trader joes", 1)], { payee: "TRADER JOE'S #552", amountCents: -1 })
        ?.categoryId,
    ).toBe(1);
    expect(
      matchRule([rule("corner grocery", 1)], { payee: "SQ *CORNER-GROCERY", amountCents: -1 })
        ?.categoryId,
    ).toBe(1);
    const rent = [rule("John Smith", 2, { direction: "out" })];
    expect(
      matchRule(rent, { payee: "VENMO", amountCents: -80_000, counterparty: "John Smith" })
        ?.categoryId,
    ).toBe(2);
    expect(matchRule(rent, { payee: "VENMO", amountCents: -80_000 })).toBeNull();
  });
});

describe("findTransferPairs", () => {
  const tx = (id: number, accountId: number, date: string, amountCents: number) => ({
    id,
    accountId,
    date,
    amountCents,
  });

  it("pairs the same amount leaving one account and arriving in another", () => {
    const rows = [
      tx(1, 10, "2030-01-05", -50_000),
      tx(2, 20, "2030-01-06", 50_000),
      tx(3, 10, "2030-01-07", -4_250),
      tx(4, 10, "2030-01-07", 4_250), // same account: a refund, not a transfer
      tx(5, 30, "2030-01-20", 4_250), // too far away
    ];
    expect(findTransferPairs(rows).map(([out, into]) => [out.id, into.id])).toEqual([[1, 2]]);
  });

  it("uses each transaction once, pairing the closest dates first", () => {
    const rows = [
      tx(1, 10, "2030-01-01", -10_000),
      tx(2, 10, "2030-01-04", -10_000),
      tx(3, 20, "2030-01-04", 10_000),
      tx(4, 20, "2030-01-02", 10_000),
      tx(5, 20, "2030-01-03", 10_000),
    ];
    expect(findTransferPairs(rows).map(([out, into]) => [out.id, into.id])).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });

  it("counts calendar days across months", () => {
    const rows = [tx(1, 10, "2030-01-30", -700), tx(2, 20, "2030-02-03", 700)];
    expect(findTransferPairs(rows)).toHaveLength(1);
    expect(findTransferPairs(rows, 3)).toHaveLength(0);
  });
});
