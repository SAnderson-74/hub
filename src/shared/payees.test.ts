import { describe, expect, it } from "vitest";
import { findPerson, memoWithPerson, merchantWords, nameCase, payeeGroup } from "./payees";

describe("findPerson", () => {
  it("reads the person from the ways banks write payment-app payees", () => {
    const cases: Array<[string, string, number, string, string, "to" | "from"]> = [
      ["VENMO *JOHN SMITH", "", -2_500, "Venmo", "John Smith", "to"],
      ["Venmo - Jane Doe", "", 4_000, "Venmo", "Jane Doe", "from"],
      ["VENMO PAYMENT TO JOHN SMITH", "", -2_500, "Venmo", "John Smith", "to"],
      ["VENMO FROM JANE DOE", "", -100, "Venmo", "Jane Doe", "from"],
      ["Zelle payment to John Smith Conf# 1a2b3c", "", -5_000, "Zelle", "John Smith", "to"],
      ["ZELLE FROM JANE DOE ON 09/12 REF # PP0ABC", "", 5_000, "Zelle", "Jane Doe", "from"],
      ["CASH APP*JANE DOE*SAN FRANCISCO CA", "", -1_200, "Cash App", "Jane Doe", "to"],
      ["SQC*CASH APP*JOHN O'BRIEN", "", -1_200, "Cash App", "John O'Brien", "to"],
      ["APPLE CASH SENT MONEY TO JOHN SMITH", "", -900, "Apple Cash", "John Smith", "to"],
    ];
    for (const [payee, memo, amount, app, name, direction] of cases) {
      expect(findPerson(payee, memo, amount), payee).toEqual({ app, name, direction });
    }
  });

  it("looks in the memo when the payee doesn't say", () => {
    expect(findPerson("VENMO", "Payment to John Smith", -100)).toEqual({
      app: "Venmo",
      name: "John Smith",
      direction: "to",
    });
    expect(findPerson("VENMO", "JANE DOE", 100)).toEqual({
      app: "Venmo",
      name: "Jane Doe",
      direction: "from",
    });
    // A note someone typed isn't taken for a name.
    expect(findPerson("VENMO", "Pizza night", -100)).toBeNull();
  });

  it("finds no one when there isn't a person", () => {
    for (const payee of [
      "VENMO PAYMENT 1023456789 WEB ID: 3264681992",
      "VENMO CASHOUT",
      "Zelle Transfer Conf# ab12cd",
      "CORNER GROCERY",
      "VENMO *",
    ]) {
      expect(findPerson(payee, "", -100), payee).toBeNull();
    }
  });

  it("keeps names written in mixed case", () => {
    expect(nameCase("JOHN SMITH")).toBe("John Smith");
    expect(nameCase("mary-kate o'neil")).toBe("Mary-Kate O'Neil");
    expect(nameCase("DeShawn McDonald")).toBe("DeShawn McDonald");
  });
});

describe("memoWithPerson", () => {
  const person = { app: "Venmo" as const, name: "John Smith", direction: "to" as const };
  it("puts who it was with in the memo", () => {
    expect(memoWithPerson("", person)).toBe("Venmo to John Smith");
    expect(memoWithPerson("JOHN SMITH", person)).toBe("Venmo to John Smith");
    expect(memoWithPerson("Pizza night", person)).toBe("Venmo to John Smith · Pizza night");
    expect(memoWithPerson("Venmo to John Smith · Pizza night", person)).toBe(
      "Venmo to John Smith · Pizza night",
    );
  });
});

describe("merchantWords", () => {
  it("drops processors, numbers, and where it was", () => {
    const cases: Array<[string, string]> = [
      ["SQ *CORNER GROCERY 4412 SEATTLE WA", "corner grocery"],
      ["TST* THE PIZZA PLACE", "pizza place"],
      ["PURCHASE AUTHORIZED ON 09/12 SHELL OIL 57442 PORTLAND OR", "shell oil"],
      ["AMAZON.COM*2K3L45 AMZN.COM/BILL WA", "amazon"],
      ["NETFLIX.COM LOS GATOS CA", "netflix"],
      ["STARBUCKS STORE #12345", "starbucks"],
      ["TRADER JOE'S #552", "trader joes"],
      ["DEBIT CARD PURCHASE WHOLE FOODS MARKET 10234", "whole foods market"],
      ["Rent", "rent"],
    ];
    for (const [payee, words] of cases) expect(merchantWords(payee).join(" "), payee).toBe(words);
  });
});

describe("payeeGroup", () => {
  it("groups a merchant's stores together, and payment-app transactions by person", () => {
    const one = payeeGroup({ payee: "SQ *CORNER GROCERY 4412", memo: "", amountCents: -1 });
    const two = payeeGroup({ payee: "CORNER GROCERY SEATTLE WA", memo: "", amountCents: -1 });
    expect(one.key).toBe(two.key);
    expect(one).toEqual({
      key: "merchant:corner grocery",
      name: "Corner Grocery",
      ruleText: "corner grocery",
    });
    expect(payeeGroup({ payee: "VENMO *JOHN SMITH", memo: "", amountCents: -1 })).toEqual({
      key: "person:venmo:john smith",
      name: "Venmo: John Smith",
      ruleText: "John Smith",
    });
    // A name saved on the transaction wins.
    expect(
      payeeGroup({ payee: "VENMO", memo: "", amountCents: -1, counterparty: "Jane Doe" }).key,
    ).toBe("person:venmo:jane doe");
    expect(payeeGroup({ payee: "", memo: "", amountCents: -1 }).name).toBe("No payee");
  });
});
