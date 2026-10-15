import { describe, expect, it } from "vitest";
import { hasLongNumber, readReceipts, receiptDocumentSchema, receiptParts } from "./receipts";

const read = (receipt: Record<string, unknown>) =>
  readReceipts(receiptDocumentSchema.parse({ format: "hub-receipt/v1", receipts: [receipt] }))[0];

describe("reading receipts", () => {
  it("reads amounts, dates, coupons, and the card's last 4 digits", () => {
    const receipt = read({
      store: " Example Store ",
      date: "3/10/2030",
      total: "$64.80",
      cardLast4: "4321",
      items: [
        { name: "Bananas", amount: 1.29, category: "Groceries" },
        { name: "Coupon", amount: "-0.50", category: "Groceries" },
      ],
      somethingElse: "ignored",
    });
    expect(receipt).toMatchObject({
      store: "Example Store",
      date: "2030-03-10",
      totalCents: 6_480,
      type: "purchase",
      cardLast4: "4321",
      problems: [],
    });
    expect(receipt?.items.map((item) => item.amountCents)).toEqual([129, -50]);
  });

  it("refuses card and account numbers, and says what else is wrong", () => {
    const receipt = read({
      store: "Example Store",
      date: "someday",
      total: "lots",
      cardLast4: "4111 1111 1111 1111",
      items: [{ name: "Gift card 6035 1234 5678 9012", amount: 25 }],
    });
    expect(receipt?.cardLast4).toBeNull();
    expect(receipt?.problems).toEqual([
      '"someday" isn\'t a date Hub can read.',
      'The total "lots" isn\'t an amount Hub can read.',
      "Give only the card's last 4 digits.",
      "It has a long number that could be a card or account number. Remove it, then paste again.",
    ]);
    expect(hasLongNumber("Store #1234, aisle 5")).toBe(false);
    expect(hasLongNumber("Call 555-123-4567")).toBe(true);
  });

  it("caps how much one paste can hold", () => {
    const many = Array.from({ length: 51 }, () => ({ store: "A", date: "2030-01-01", total: 1 }));
    expect(
      receiptDocumentSchema.safeParse({ format: "hub-receipt/v1", receipts: many }).success,
    ).toBe(false);
    expect(
      receiptDocumentSchema.safeParse({ format: "hub-listing/v1", receipts: [] }).success,
    ).toBe(false);
  });
});

describe("splitting a receipt by category", () => {
  it("shares tax and discounts out in proportion, adding up to the total", () => {
    const items = [
      { name: "Milk", amountCents: 4_000, category: "Groceries" },
      { name: "Bread", amountCents: 2_000, category: "groceries" },
      { name: "Soap", amountCents: 3_000, category: "Shopping" },
      { name: "Coupon", amountCents: -500, category: "Shopping" },
    ];
    // Lines: $60 groceries, $25 shopping; with tax the total is $90.
    const parts = receiptParts({ items, category: "" }, 9_000);
    expect(parts).toEqual([
      { category: "Groceries", cents: 6_353 },
      { category: "Shopping", cents: 2_647 },
    ]);
    expect(parts.reduce((sum, part) => sum + part.cents, 0)).toBe(9_000);
  });

  it("keeps a receipt without lines in its own category", () => {
    expect(receiptParts({ items: [], category: "Dining out" }, 2_500)).toEqual([
      { category: "Dining out", cents: 2_500 },
    ]);
  });
});
