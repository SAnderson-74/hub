import { describe, expect, it } from "vitest";
import { listingImportSchema, readDollars, readListingImport } from "./resaleListing";

const full = {
  format: "hub-listing/v1" as const,
  item: { title: "Stereo receiver", brand: "Example", model: "RX-100", condition: "used" },
  listing: {
    platform: "Local classifieds",
    price: 150,
    title: "Stereo receiver, works great",
    description: "Tested with speakers.",
  },
  purchase: { price: 60, date: "2030-01-10", source: "Garage sale" },
};

describe("listingImportSchema", () => {
  it("accepts the documented example and ignores unknown fields", () => {
    expect(listingImportSchema.safeParse({ ...full, extra: true }).success).toBe(true);
    const wrong = listingImportSchema.safeParse({ ...full, format: "hub-listing/v2" });
    expect(wrong.success).toBe(false);
  });
});

describe("readListingImport", () => {
  it("reads a complete listing with nothing to review", () => {
    expect(readListingImport(full)).toEqual({
      title: "Stereo receiver",
      condition: "used",
      category: "",
      notes: "Brand: Example\nModel: RX-100",
      purchasedOn: "2030-01-10",
      purchaseCents: 6_000,
      purchaseFrom: "Garage sale",
      listing: {
        platform: "Local classifieds",
        priceCents: 15_000,
        title: "Stereo receiver, works great",
        description: "Tested with speakers.",
        url: "",
      },
      problems: [],
    });
  });

  it("falls back to the listing title and flags what's missing", () => {
    const read = readListingImport({
      format: "hub-listing/v1",
      listing: { title: "Desk lamp", price: "about $20", url: "javascript:alert(1)" },
    });
    expect(read?.title).toBe("Desk lamp");
    expect(read?.listing).toMatchObject({ priceCents: null, url: "" });
    expect(read?.problems).toEqual([
      "No price paid.",
      "No purchase date.",
      `Listing price "about $20" isn't an amount Hub can read.`,
      `The listing link "javascript:alert(1)" isn't a web address, so it was left out.`,
    ]);
  });

  it("needs a title from the item or the listing", () => {
    expect(readListingImport({ format: "hub-listing/v1", purchase: { price: 5 } })).toBeNull();
  });
});

it("reads dollars from numbers and text", () => {
  expect(readDollars(12.5)).toBe(1_250);
  expect(readDollars("$1,250")).toBe(125_000);
  expect(readDollars(-3)).toBeNull();
  expect(readDollars(undefined)).toBeUndefined();
});
