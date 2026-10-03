import { describe, expect, it } from "vitest";
import {
  earnedLabel,
  earnRewards,
  parseRate,
  pointValueLabel,
  type RewardProgram,
  type RewardRate,
  rateLabel,
  rewardsSaveSchema,
  rewardValue,
  type Spend,
} from "./rewards";

const GROCERIES = 1;
const DINING = 2;

const rate = (fields: Partial<RewardRate> & { id: number; rate: number }): RewardRate => ({
  categoryId: null,
  contains: null,
  startsOn: null,
  endsOn: null,
  capCents: null,
  ...fields,
});

const spend = (
  date: string,
  amountCents: number,
  text: string,
  categoryId: number | null = null,
): Spend => ({ date, amountCents, text, categoryId });

const program = (rates: RewardRate[], baseRate = 100): RewardProgram => ({
  kind: "cash_back",
  baseRate,
  pointValue: 100,
  rates,
});

describe("earning rewards", () => {
  it("uses a store's rate before a category's, and the base rate otherwise", () => {
    const plan = program([
      rate({ id: 1, categoryId: GROCERIES, rate: 300 }),
      rate({ id: 2, contains: "example store, exmpl", rate: 500 }),
    ]);
    const earnings = earnRewards(plan, [
      spend("2030-01-02", -10_000, "EXMPL MKTP US*1A2B3C", GROCERIES),
      spend("2030-01-03", -10_000, "Corner grocery", GROCERIES),
      spend("2030-01-04", -10_000, "Corner gas"),
    ]);
    expect(earnings.map((earning) => [earning.rateId, earning.earned])).toEqual([
      [2, 500],
      [1, 300],
      [null, 100],
    ]);
  });

  it("matches stores ignoring case and punctuation, in the payee or the bank's text", () => {
    const plan = program([rate({ id: 1, contains: "joes market", rate: 500 })]);
    const [earning] = earnRewards(plan, [
      spend("2030-01-02", -2_000, "Groceries JOE'S MARKET #12"),
    ]);
    expect(earning?.rateId).toBe(1);
  });

  it("only uses a dated rate between its dates", () => {
    const plan = program([
      rate({ id: 1, categoryId: DINING, rate: 500, startsOn: "2030-04-01", endsOn: "2030-06-30" }),
    ]);
    const earnings = earnRewards(plan, [
      spend("2030-03-31", -1_000, "Pizza", DINING),
      spend("2030-04-01", -1_000, "Pizza", DINING),
      spend("2030-07-01", -1_000, "Pizza", DINING),
    ]);
    expect(earnings.map((earning) => earning.rateId)).toEqual([null, 1, null]);
  });

  it("earns the bonus up to its cap, then the base rate, and refunds give room back", () => {
    const plan = program([
      rate({
        id: 1,
        categoryId: GROCERIES,
        rate: 500,
        startsOn: "2030-01-01",
        endsOn: "2030-03-31",
        capCents: 150_000,
      }),
    ]);
    const earnings = earnRewards(plan, [
      // Out of order on purpose: the cap fills by date.
      spend("2030-02-01", -100_000, "Grocer", GROCERIES),
      spend("2030-01-15", -100_000, "Grocer", GROCERIES),
      spend("2030-02-10", 20_000, "Refund: Grocer", GROCERIES),
      spend("2030-03-01", -30_000, "Grocer", GROCERIES),
    ]);
    expect(earnings.map((earning) => [earning.date, earning.rateId, earning.spentCents])).toEqual([
      ["2030-01-15", 1, 100_000],
      ["2030-02-01", 1, 50_000],
      ["2030-02-01", null, 50_000],
      ["2030-02-10", 1, -20_000],
      ["2030-03-01", 1, 20_000],
      ["2030-03-01", null, 10_000],
    ]);
    // Exactly the cap at 5%, and the rest at 1%.
    const total = earnings.reduce((sum, earning) => sum + earning.earned, 0);
    expect(total).toBe(150_000 * 0.05 + 60_000 * 0.01);
  });

  it("starts an undated cap over each calendar year", () => {
    const plan = program([rate({ id: 1, categoryId: GROCERIES, rate: 600, capCents: 1_000 })]);
    const earnings = earnRewards(plan, [
      spend("2030-12-30", -1_000, "Grocer", GROCERIES),
      spend("2030-12-31", -1_000, "Grocer", GROCERIES),
      spend("2031-01-01", -1_000, "Grocer", GROCERIES),
    ]);
    expect(earnings.map((earning) => earning.rateId)).toEqual([1, null, 1]);
  });

  it("values points at their worth", () => {
    expect(rewardValue("points", 125, 1_000)).toBe(1_250);
    expect(rewardValue("cash_back", 125, 1_000)).toBe(1_000);
    expect(earnedLabel("points", 1_234.4, 1_543)).toBe("1,234 points (about $15.43)");
    expect(earnedLabel("cash_back", 1_543, 1_543)).toBe("$15.43");
  });
});

describe("rates in words", () => {
  it("reads rates as people type them", () => {
    expect(parseRate("5")).toBe(500);
    expect(parseRate("5%")).toBe(500);
    expect(parseRate("1.5")).toBe(150);
    expect(parseRate("3x")).toBe(300);
    expect(parseRate(".25")).toBe(25);
    expect(parseRate("101")).toBeNull();
    expect(parseRate("1.555")).toBeNull();
    expect(parseRate("five")).toBeNull();
  });

  it("labels rates and point values", () => {
    expect(rateLabel("cash_back", 150)).toBe("1.5%");
    expect(rateLabel("points", 300)).toBe("3x");
    expect(pointValueLabel(125)).toBe("1.25¢");
  });

  it("needs a category or a store for each bonus rate, and dates in order", () => {
    const base = { kind: "cash_back", baseRate: 100 } as const;
    expect(rewardsSaveSchema.safeParse({ ...base, rates: [{ rate: 300 }] }).success).toBe(false);
    expect(
      rewardsSaveSchema.safeParse({
        ...base,
        rates: [{ rate: 300, categoryId: 1, contains: "store" }],
      }).success,
    ).toBe(false);
    expect(
      rewardsSaveSchema.safeParse({
        ...base,
        rates: [{ rate: 300, contains: "store", startsOn: "2030-02-01", endsOn: "2030-01-01" }],
      }).success,
    ).toBe(false);
    expect(
      rewardsSaveSchema.parse({ ...base, rates: [{ rate: 300, contains: " store " }] }),
    ).toEqual({
      ...base,
      pointValue: 100,
      rates: [
        {
          rate: 300,
          categoryId: null,
          contains: "store",
          startsOn: null,
          endsOn: null,
          capCents: null,
        },
      ],
    });
  });
});
