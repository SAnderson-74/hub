import { describe, expect, it } from "vitest";
import {
  monthlySummary,
  readFund,
  readTithing,
  sourceSummary,
  tithingDocumentSchema,
  tithingOwed,
  tithingStatus,
} from "./tithing";

describe("tithing owed", () => {
  it("is a tenth, to the cent", () => {
    expect(tithingOwed(200_000)).toBe(20_000);
    expect(tithingOwed(1_234)).toBe(123);
    expect(tithingOwed(1_235)).toBe(124);
    expect(tithingOwed(0)).toBe(0);
    expect(tithingOwed(-500)).toBe(0);
  });

  it("is unpaid, partly paid, or paid", () => {
    expect(tithingStatus(1_000, 0)).toBe("unpaid");
    expect(tithingStatus(1_000, 400)).toBe("partial");
    expect(tithingStatus(1_000, 1_000)).toBe("paid");
    expect(tithingStatus(1_000, 1_500)).toBe("paid");
    // Nothing owed is nothing left to pay.
    expect(tithingStatus(0, 0)).toBe("paid");
  });
});

describe("reading a pasted document", () => {
  const read = (extra: object) =>
    readTithing(tithingDocumentSchema.parse({ format: "hub-tithing/v1", ...extra }));

  it("knows the fund by its name", () => {
    expect(readFund(undefined)).toBe("tithing");
    expect(readFund("Tithing")).toBe("tithing");
    expect(readFund("Fast offering")).toBe("fast_offering");
    expect(readFund("Missionary fund")).toBe("other");
  });

  it("reads payments and keeps another fund's name in the note", () => {
    const { payments } = read({
      payments: [
        { date: "2030-03-15", amount: 250 },
        { date: "March 3, 2030", amount: "$40.50", fund: "Missionary fund", note: "Online" },
      ],
    });
    expect(payments.map((row) => [row.date, row.amountCents, row.fund, row.note])).toEqual([
      ["2030-03-15", 25_000, "tithing", ""],
      ["2030-03-03", 4_050, "other", "Missionary fund: Online"],
    ]);
  });

  it("figures the base from gross pay, or ten times the tithing amount", () => {
    const { income } = read({
      income: [
        { date: "2030-03-15", deposit: 2000, gross: 2600 },
        { date: "2030-03-16", deposit: 1500, tithing: 200 },
        { date: "2030-03-17", deposit: 1500 },
      ],
    });
    expect(income.map((row) => [row.depositCents, row.baseCents, row.problems.length])).toEqual([
      [200_000, 260_000, 0],
      [150_000, 200_000, 0],
      [150_000, null, 1],
    ]);
  });

  it("says what can't be read", () => {
    const { payments, income } = read({
      payments: [
        { date: "someday", amount: 10 },
        { date: "2030-03-15", amount: "lots" },
        { date: "2030-03-15", amount: 0 },
        { date: "2030-03-15", amount: 5, note: "ref 1234567890123" },
      ],
      income: [{ date: "2030-03-15", deposit: "?", gross: 100 }],
    });
    expect(payments.map((row) => row.problems.length > 0)).toEqual([true, true, true, true]);
    expect(payments[0]?.problems[0]).toContain("isn't a date");
    expect(payments[3]?.problems[0]).toContain("long number");
    expect(income[0]?.problems[0]).toContain("deposit");
  });

  it("needs something in it", () => {
    expect(tithingDocumentSchema.safeParse({ format: "hub-tithing/v1" }).success).toBe(false);
    expect(
      tithingDocumentSchema.safeParse({ format: "hub-other/v1", payments: [{}] }).success,
    ).toBe(false);
  });
});

describe("chart summaries", () => {
  const month = (m: number, owedCents: number, paidCents: number, balanceCents: number) => ({
    month: `2030-${String(m).padStart(2, "0")}`,
    owedCents,
    paidCents,
    balanceCents,
  });

  it("sums up the year", () => {
    expect(monthlySummary(2030, [month(1, 0, 0, 0), month(2, 0, 0, 0)])).toBe(
      "No tithing owed or paid in 2030.",
    );
    expect(monthlySummary(2030, [month(1, 20_000, 0, 20_000), month(2, 0, 15_000, 5_000)])).toBe(
      "$200 owed and $150 paid in 2030: $50 still owed at the end of the year.",
    );
    expect(monthlySummary(2030, [month(1, 10_000, 12_000, -2_000)])).toBe(
      "$100 owed and $120 paid in 2030: $20 paid ahead at the end of the year.",
    );
    expect(monthlySummary(2030, [month(1, 10_000, 10_000, 0)])).toContain("paid up");
  });

  it("names the biggest source", () => {
    expect(sourceSummary(2030, [])).toBe("No income in 2030.");
    expect(
      sourceSummary(2030, [
        { source: "Paycheck", incomeCents: 200_000, tithableCents: 200_000 },
        { source: "Resale", incomeCents: 100_000, tithableCents: 40_000 },
      ]),
    ).toBe("$2,400 of $3,000 income in 2030 is tithed on. Most of it is from Paycheck.");
  });
});
