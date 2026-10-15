import { describe, expect, it } from "vitest";
import { maskLongNumbers, readStatement, statementDocumentSchema } from "./statement";

const read = (document: Record<string, unknown>) =>
  readStatement(statementDocumentSchema.parse({ format: "hub-statement/v1", ...document }));

describe("reading a pasted statement", () => {
  it("reads signed amounts, dates, and the closing balance on the period's last day", () => {
    const statement = read({
      account: { last4: "1234" },
      period: { start: "2030-03-01", end: "3/31/2030" },
      closingBalance: "-$1,520.40",
      transactions: [
        { date: "2030-03-02", description: " EXAMPLE STORE 12 ", amount: -64.8 },
        { date: "Mar 5, 2030", description: "PAYMENT THANK YOU", amount: "500.00" },
        { date: "2030-03-07", description: "Refund", amount: "(12.50)", memo: "Returned item" },
      ],
      somethingElse: "ignored",
    });
    expect(statement.transactions).toEqual([
      { date: "2030-03-02", amountCents: -6_480, payee: "EXAMPLE STORE 12", memo: "" },
      { date: "2030-03-05", amountCents: 50_000, payee: "PAYMENT THANK YOU", memo: "" },
      { date: "2030-03-07", amountCents: -1_250, payee: "Refund", memo: "Returned item" },
    ]);
    expect(statement).toMatchObject({
      last4: "1234",
      endDate: "2030-03-31",
      statementBalance: { date: "2030-03-31", balanceCents: -152_040 },
      problems: [],
      notes: [],
    });
  });

  it("hides long numbers down to their last 4 digits", () => {
    expect(maskLongNumbers("ACH DEBIT 1234567890 PPD")).toBe("ACH DEBIT ••7890 PPD");
    expect(maskLongNumbers("Card 4111 1111 1111 1111")).toBe("Card ••1111");
    expect(maskLongNumbers("Store #1234, aisle 5")).toBe("Store #1234, aisle 5");
    const statement = read({
      transactions: [
        {
          date: "2030-03-02",
          description: "Transfer to 000123456789",
          amount: -10,
          memo: "Ref 9876-5432-10",
        },
      ],
    });
    expect(statement.transactions[0]).toMatchObject({
      payee: "Transfer to ••6789",
      memo: "Ref ••3210",
    });
  });

  it("leaves out lines it can't read, and digits that aren't a last 4", () => {
    const statement = read({
      account: { last4: "000123456789" },
      closingBalance: 10,
      transactions: [
        { date: "someday", description: "A", amount: -1 },
        { date: "2030-03-02", description: "B", amount: "lots" },
        { date: "2030-03-03", description: "C", amount: 0 },
        { date: "2030-03-04", description: "D", amount: -2 },
      ],
    });
    expect(statement.transactions.map((row) => row.payee)).toEqual(["D"]);
    expect(statement.problems.map((problem) => problem.row)).toEqual([1, 2, 3]);
    expect(statement.last4).toBeNull();
    // Without the statement's last day, its balance can't be dated.
    expect(statement.statementBalance).toBeUndefined();
    expect(statement.endDate).toBe("2030-03-04");
    expect(statement.notes).toEqual([
      "The account's digits weren't a last 4, so they were left out. Pick the account.",
      "It doesn't say the day the statement ends, so its balance isn't checked.",
    ]);
  });

  it("caps how much one paste can hold", () => {
    const line = { date: "2030-01-01", description: "A", amount: -1 };
    const many = Array.from({ length: 1_001 }, () => line);
    expect(
      statementDocumentSchema.safeParse({ format: "hub-statement/v1", transactions: many }).success,
    ).toBe(false);
    expect(
      statementDocumentSchema.safeParse({
        format: "hub-statement/v1",
        transactions: [{ ...line, description: "x".repeat(201) }],
      }).success,
    ).toBe(false);
  });
});
