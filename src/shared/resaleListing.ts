import { z } from "zod";
import { parseImportDate, parseImportMoney } from "./resaleImport";

/** A price in this format: dollars as a number (150, 12.5) or text ("$150"). */
const price = z.union([z.number(), z.string().max(40)]).optional();
const text = (max: number) => z.string().max(max).optional();

/**
 * The `hub-listing/v1` format (see docs/PLAN.md): what a writing assistant produces
 * at the end of a listing, pasted into the app or sent by an iOS Shortcut. Every
 * part is optional apart from the format and a title; unknown fields are ignored.
 */
export const listingImportSchema = z.object({
  format: z.literal("hub-listing/v1", {
    error: 'This isn\'t a hub-listing/v1 listing. Its "format" should be "hub-listing/v1".',
  }),
  item: z
    .object({
      title: text(200),
      brand: text(80),
      model: text(80),
      condition: text(80),
      category: text(80),
    })
    .optional(),
  listing: z
    .object({
      platform: text(80),
      price,
      title: text(200),
      description: text(20_000),
      url: text(2_000),
    })
    .optional(),
  purchase: z
    .object({
      price,
      date: text(40),
      source: text(200),
    })
    .optional(),
});
export type ListingImport = z.infer<typeof listingImportSchema>;

/** Cents from a dollar amount given as a number or text, or null if unreadable. */
export function readDollars(value: number | string | undefined): number | null | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 1_000_000
      ? Math.round(value * 100)
      : null;
  }
  return parseImportMoney(value);
}

export type ReadListing = {
  title: string;
  condition: string;
  category: string;
  /** Brand and model, for the item's notes. */
  notes: string;
  purchasedOn: string | null;
  purchaseCents: number | null;
  purchaseFrom: string;
  listing: {
    platform: string;
    priceCents: number | null;
    title: string;
    description: string;
    url: string;
  } | null;
  problems: string[];
};

/**
 * Reads a hub-listing/v1 document. The item's title falls back to the listing's.
 * Returns null without any title. Missing or unreadable values become problems,
 * which flag a new item for review.
 */
export function readListingImport(data: ListingImport): ReadListing | null {
  const clean = (value: string | undefined) => value?.trim() ?? "";
  const title = clean(data.item?.title) || clean(data.listing?.title);
  if (!title) return null;
  const problems: string[] = [];

  const paid = readDollars(data.purchase?.price);
  if (paid === null)
    problems.push(`Price paid "${data.purchase?.price}" isn't an amount Hub can read.`);
  else if (paid === undefined) problems.push("No price paid.");

  const dateText = clean(data.purchase?.date);
  const purchasedOn = dateText ? parseImportDate(dateText) : null;
  if (dateText && !purchasedOn) problems.push(`Bought on "${dateText}" isn't a date Hub can read.`);
  else if (!dateText) problems.push("No purchase date.");

  let listing: ReadListing["listing"] = null;
  if (data.listing) {
    const asking = readDollars(data.listing.price);
    if (asking === null) {
      problems.push(`Listing price "${data.listing.price}" isn't an amount Hub can read.`);
    } else if (asking === undefined) {
      problems.push("The listing has no price.");
    }
    const url = clean(data.listing.url);
    const urlOk = url === "" || /^https?:\/\/\S+$/i.test(url);
    if (!urlOk) problems.push(`The listing link "${url}" isn't a web address, so it was left out.`);
    listing = {
      platform: clean(data.listing.platform),
      priceCents: asking ?? null,
      title: clean(data.listing.title),
      description: data.listing.description?.trim() ?? "",
      url: urlOk ? url : "",
    };
  }

  const notes = [
    clean(data.item?.brand) ? `Brand: ${clean(data.item?.brand)}` : "",
    clean(data.item?.model) ? `Model: ${clean(data.item?.model)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    title,
    condition: clean(data.item?.condition),
    category: clean(data.item?.category),
    notes,
    purchasedOn,
    purchaseCents: paid ?? null,
    purchaseFrom: clean(data.purchase?.source),
    listing,
    problems,
  };
}

/**
 * What a listing import did (or would do): added a new item, listed an item already
 * in Hub, or changed nothing. `message` is a sentence for a Shortcut to show.
 */
export type ListingImportResult = {
  outcome: "created" | "listed" | "unchanged";
  itemId: number | null;
  title: string;
  platformCreated: string | null;
  needsReview: boolean;
  problems: string[];
  message: string;
};
