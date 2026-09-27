import { describe, expect, it } from "vitest";
import {
  guessMapping,
  parseImportDate,
  parseImportMoney,
  readImportRow,
  rowsFromCsv,
} from "./resaleImport";

describe("guessMapping", () => {
  it("matches common header names without case or punctuation", () => {
    expect(
      guessMapping([
        "Item Name",
        "Purchase Date",
        "Cost",
        "Sold For",
        "Date Sold",
        "Platform",
        "Notes",
      ]),
    ).toEqual({
      title: 0,
      purchasedOn: 1,
      purchasePrice: 2,
      soldOn: 4,
      salePrice: 3,
      salePlatform: 5,
      notes: 6,
    });
  });
});

describe("rowsFromCsv", () => {
  it("keeps mapped, non-empty cells", () => {
    const table = [
      ["Item", "Paid", "Extra"],
      ["Lamp", " 5 ", "x"],
      ["Chair", "", "y"],
    ];
    expect(rowsFromCsv(table, { title: 0, purchasePrice: 1 })).toEqual([
      { title: "Lamp", purchasePrice: "5" },
      { title: "Chair" },
    ]);
  });
});

describe("parseImportDate", () => {
  it("reads ISO, US slash, and written dates", () => {
    expect(parseImportDate("2030-01-31")).toBe("2030-01-31");
    expect(parseImportDate("2030-01-31T10:00:00Z")).toBe("2030-01-31");
    expect(parseImportDate("1/31/2030")).toBe("2030-01-31");
    expect(parseImportDate("1/31/30")).toBe("2030-01-31");
    expect(parseImportDate("Jan 31, 2030")).toBe("2030-01-31");
    expect(parseImportDate("January 31 2030")).toBe("2030-01-31");
    expect(parseImportDate("31 Jan 2030")).toBe("2030-01-31");
  });

  it("rejects dates that don't exist or can't be read", () => {
    expect(parseImportDate("2/30/2030")).toBeNull();
    expect(parseImportDate("31/1/2030")).toBeNull();
    expect(parseImportDate("last Tuesday")).toBeNull();
  });
});

it("reads money with symbols and separators", () => {
  expect(parseImportMoney("$1,250.50")).toBe(125_050);
  expect(parseImportMoney("USD 12")).toBe(1_200);
  expect(parseImportMoney("twelve")).toBeNull();
});

describe("readImportRow", () => {
  it("reads a complete sold row with nothing to review", () => {
    expect(
      readImportRow({
        title: "Road bike",
        status: "Sold",
        purchasedOn: "7/1/2030",
        purchasePrice: "$120",
        soldOn: "2030-08-10",
        salePrice: "210",
        salePlatform: "Local classifieds",
        fees: "5.25",
      }),
    ).toEqual({
      item: {
        title: "Road bike",
        status: "sold",
        category: "",
        condition: "",
        purchasedOn: "2030-07-01",
        purchaseCents: 12_000,
        purchasePlatform: "",
        purchaseFrom: "",
        soldOn: "2030-08-10",
        saleCents: 21_000,
        salePlatform: "Local classifieds",
        feesCents: 525,
        shippingCents: null,
        notes: "",
      },
      problems: [],
    });
  });

  it("flags what's missing or unreadable, and infers sold from a sale price", () => {
    const result = readImportRow({ title: "Lamp", purchasePrice: "cheap", salePrice: "15" });
    expect(result?.item.status).toBe("sold");
    expect(result?.problems).toEqual([
      `Price paid "cheap" isn't an amount Hub can read.`,
      "No purchase date.",
      "Sold, but no sale date.",
    ]);
    expect(readImportRow({ title: "Chair", status: "gone" })?.problems).toEqual([
      `Status "gone" isn't one Hub knows, so it's acquired.`,
      "No price paid.",
      "No purchase date.",
    ]);
    expect(readImportRow({ title: "Radio", status: "wanted" })?.problems).toEqual([]);
  });

  it("skips rows without a title", () => {
    expect(readImportRow({ purchasePrice: "5" })).toBeNull();
    expect(readImportRow({ title: "   " })).toBeNull();
  });
});
