import { z } from "zod";
import { parseDollars } from "./money";
import type { ItemStatus } from "./resale";

/** Hub fields a CSV column can be mapped to, in the order the mapping form shows them. */
export const IMPORT_FIELDS = [
  "title",
  "status",
  "category",
  "condition",
  "purchasedOn",
  "purchasePrice",
  "purchasePlatform",
  "purchaseFrom",
  "soldOn",
  "salePrice",
  "salePlatform",
  "fees",
  "shipping",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  title: "Title",
  status: "Status",
  category: "Category",
  condition: "Condition",
  purchasedOn: "Bought on",
  purchasePrice: "Price paid",
  purchasePlatform: "Bought on platform",
  purchaseFrom: "Seller or place",
  soldOn: "Sold on",
  salePrice: "Sold for",
  salePlatform: "Sold on platform",
  fees: "Fees",
  shipping: "Shipping",
  notes: "Notes",
};

/** Header words that suggest each field, compared without case, spaces, or punctuation. */
const SYNONYMS: Record<ImportField, string[]> = {
  title: ["title", "item", "itemname", "name", "description", "product"],
  status: ["status", "state", "stage"],
  category: ["category", "type", "kind"],
  condition: ["condition"],
  purchasedOn: [
    "purchasedon",
    "purchasedate",
    "dateofpurchase",
    "datepurchased",
    "boughton",
    "datebought",
    "buydate",
    "purchased",
    "acquired",
  ],
  purchasePrice: [
    "purchaseprice",
    "pricepaid",
    "paid",
    "cost",
    "costbasis",
    "buyprice",
    "boughtfor",
    "purchasecost",
  ],
  purchasePlatform: ["boughtonplatform", "purchaseplatform", "source", "sourcedfrom", "boughtat"],
  purchaseFrom: ["seller", "sellerorplace", "boughtfrom", "purchasedfrom", "place", "location"],
  soldOn: ["soldon", "solddate", "saledate", "datesold"],
  salePrice: ["saleprice", "soldfor", "soldprice", "sellingprice", "revenue", "sale"],
  salePlatform: ["soldonplatform", "saleplatform", "platform", "soldvia", "marketplace", "channel"],
  fees: ["fees", "fee", "sellingfees", "platformfees"],
  shipping: ["shipping", "postage", "shippingcost"],
  notes: ["notes", "note", "comments", "comment", "memo"],
};

const squash = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

export type ColumnMapping = Partial<Record<ImportField, number>>;

/** A first guess at which column holds each field, from the header names. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();
  const squashed = headers.map(squash);
  for (const field of IMPORT_FIELDS) {
    for (const synonym of SYNONYMS[field]) {
      const index = squashed.findIndex((header, i) => header === synonym && !taken.has(i));
      if (index !== -1) {
        mapping[field] = index;
        taken.add(index);
        break;
      }
    }
  }
  return mapping;
}

/** One row as the API receives it: the mapped cells, still as text. */
export type ImportRow = Partial<Record<ImportField, string>>;

export function rowsFromCsv(table: readonly string[][], mapping: ColumnMapping): ImportRow[] {
  return table.slice(1).map((cells) => {
    const row: ImportRow = {};
    for (const field of IMPORT_FIELDS) {
      const index = mapping[field];
      if (index === undefined) continue;
      const value = cells[index]?.trim() ?? "";
      if (value !== "") row[field] = value;
    }
    return row;
  });
}

const cell = z.string().max(20_000, "A cell is longer than 20,000 characters.");

export const resaleImportSchema = z
  .object({
    rows: z
      .array(z.object(Object.fromEntries(IMPORT_FIELDS.map((field) => [field, cell.optional()]))))
      .min(1, "The file has no rows to import.")
      .max(2_000, "Import at most 2,000 rows at a time. Split bigger files."),
  })
  .strict();
export type ResaleImport = { rows: ImportRow[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD from "2030-01-31", "1/31/2030", "1/31/30", "Jan 31, 2030", or
 * "31 Jan 2030". Slash dates are read month first, as in the US. null if unreadable.
 */
export function parseImportDate(value: string): string | null {
  const text = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (match) {
    const year = Number(match[3]);
    return isoDate(year < 100 ? 2000 + year : year, Number(match[1]), Number(match[2]));
  }
  match = /^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/i.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[1]?.toLowerCase() ?? "") + 1;
    return month > 0 ? isoDate(Number(match[3]), month, Number(match[2])) : null;
  }
  match = /^(\d{1,2}) ([a-z]{3})[a-z]*\.?,? (\d{4})$/i.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[2]?.toLowerCase() ?? "") + 1;
    return month > 0 ? isoDate(Number(match[3]), month, Number(match[1])) : null;
  }
  return null;
}

/** Cents from "$1,250.50", "1250.5", or "USD 12". null if unreadable. */
export function parseImportMoney(value: string): number | null {
  return parseDollars(
    value
      .trim()
      .replace(/^usd\s*/i, "")
      .replace(/\s*usd$/i, ""),
  );
}

const STATUS_WORDS: Record<string, ItemStatus> = {
  sourcing: "sourcing",
  wanted: "sourcing",
  watching: "sourcing",
  acquired: "acquired",
  bought: "acquired",
  purchased: "acquired",
  instock: "acquired",
  inventory: "acquired",
  repairing: "repairing",
  repair: "repairing",
  inrepair: "repairing",
  fixing: "repairing",
  listed: "listed",
  forsale: "listed",
  active: "listed",
  selling: "listed",
  sold: "sold",
  kept: "kept",
  keep: "kept",
  personal: "kept",
};

export type ImportedItem = {
  title: string;
  status: ItemStatus;
  category: string;
  condition: string;
  purchasedOn: string | null;
  purchaseCents: number | null;
  purchasePlatform: string;
  purchaseFrom: string;
  soldOn: string | null;
  saleCents: number | null;
  salePlatform: string;
  feesCents: number | null;
  shippingCents: number | null;
  notes: string;
};

/**
 * Reads one mapped row. Returns null for a row without a title (it can't be
 * imported). Otherwise the item and what's missing or unreadable, which flags it
 * for review.
 */
export function readImportRow(row: ImportRow): { item: ImportedItem; problems: string[] } | null {
  const title = row.title?.trim().slice(0, 200) ?? "";
  if (!title) return null;
  const problems: string[] = [];

  const date = (field: "purchasedOn" | "soldOn", what: string) => {
    const value = row[field];
    if (!value) return null;
    const parsed = parseImportDate(value);
    if (!parsed) problems.push(`${what} "${value}" isn't a date Hub can read.`);
    return parsed;
  };
  const money = (field: "purchasePrice" | "salePrice" | "fees" | "shipping", what: string) => {
    const value = row[field];
    if (!value) return null;
    const parsed = parseImportMoney(value);
    if (parsed === null) problems.push(`${what} "${value}" isn't an amount Hub can read.`);
    return parsed;
  };

  const purchasedOn = date("purchasedOn", "Bought on");
  const soldOn = date("soldOn", "Sold on");
  const purchaseCents = money("purchasePrice", "Price paid");
  const saleCents = money("salePrice", "Sold for");
  const feesCents = money("fees", "Fees");
  const shippingCents = money("shipping", "Shipping");

  let status: ItemStatus;
  const statusText = row.status?.trim();
  const known = statusText
    ? STATUS_WORDS[statusText.toLowerCase().replace(/[^a-z]/g, "")]
    : undefined;
  if (known) status = known;
  else {
    // Without a known status, a sale price or date means it sold.
    status = saleCents !== null || soldOn !== null ? "sold" : "acquired";
    if (statusText) {
      problems.push(`Status "${statusText}" isn't one Hub knows, so it's ${status}.`);
    }
  }

  if (status !== "sourcing") {
    if (purchaseCents === null && !row.purchasePrice) problems.push("No price paid.");
    if (purchasedOn === null && !row.purchasedOn) problems.push("No purchase date.");
  }
  if (status === "sold") {
    if (saleCents === null && !row.salePrice) problems.push("Sold, but no sale price.");
    if (soldOn === null && !row.soldOn) problems.push("Sold, but no sale date.");
  }

  const text = (value: string | undefined, max: number) => value?.trim().slice(0, max) ?? "";
  return {
    item: {
      title,
      status,
      category: text(row.category, 80),
      condition: text(row.condition, 80),
      purchasedOn,
      purchaseCents,
      purchasePlatform: text(row.purchasePlatform, 80),
      purchaseFrom: text(row.purchaseFrom, 200),
      soldOn,
      saleCents,
      salePlatform: text(row.salePlatform, 80),
      feesCents,
      shippingCents,
      notes: text(row.notes, 20_000),
    },
    problems,
  };
}

/** What an import did (or, for a dry run, would do), row by row. */
export type ImportResult = {
  created: number;
  needsReview: number;
  duplicates: number;
  skipped: number;
  platformsCreated: string[];
  rows: Array<{
    /** 1-based, counting data rows after the header. */
    row: number;
    title: string;
    outcome: "create" | "duplicate" | "skip";
    problems: string[];
  }>;
};
