import { z } from "zod";
import type { ImportRow } from "./resaleImport";
import { maskLongNumbers } from "./statement";

// The `hub-inventory/v1` format (docs/CLAUDE_PROJECT.md): several things to sell, as
// a Claude Project reads them from photos or a list. Each becomes a row for Resale's
// item import, which previews, skips duplicates, and flags missing details for review
// the same way it does for a spreadsheet. Pasted text is untrusted: every field has a
// size limit, unknown fields are ignored, and device identifiers are taken out.

const text = (max: number) => z.string().max(max, `Keep this under ${max} characters.`);
const dollars = z.union([z.number(), z.string().max(40)]);

/** Statuses for something to sell. Sold and kept items don't come in this way. */
export const INVENTORY_STATUSES = ["acquired", "repairing"] as const;

const inventoryItemSchema = z.object({
  title: text(200),
  brand: text(80).optional(),
  model: text(80).optional(),
  condition: text(80).optional(),
  category: text(80).optional(),
  status: z.enum(INVENTORY_STATUSES).optional(),
  purchase: z
    .object({ price: dollars.optional(), date: text(40).optional(), from: text(200).optional() })
    .optional(),
  notes: text(2_000).optional(),
});

export const MAX_INVENTORY_ITEMS = 100;

export const inventoryDocumentSchema = z.object({
  format: z.literal("hub-inventory/v1", {
    error: 'This isn\'t a hub-inventory/v1 document. Its "format" should be "hub-inventory/v1".',
  }),
  items: z
    .array(inventoryItemSchema)
    .min(1, "There are no items in it.")
    .max(MAX_INVENTORY_ITEMS, `Paste up to ${MAX_INVENTORY_ITEMS} items at a time.`),
});
export type InventoryDocument = z.input<typeof inventoryDocumentSchema>;

/**
 * A labeled device identifier: "Serial: C02XG0FD", "S/N 4815-1623", "IMEI 35…",
 * "MEID: A1000…". The label and the value both go.
 */
const IDENTIFIER =
  /\b(?:serial(?:\s*(?:no\.?|number|#))?|s\/n|imei\s*\d?|meid|esn)\s*[:#.]?\s*[a-z0-9][a-z0-9-]{3,}/gi;

/**
 * Text with device identifiers taken out: labeled serial, IMEI, and MEID numbers are
 * removed, and any other run of 9 or more digits is hidden down to its last 4.
 */
export function withoutIdentifiers(value: string): string {
  return maskLongNumbers(value.replace(IDENTIFIER, ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, "")
    .trim();
}

/**
 * The items as rows for Resale's item import, with identifiers taken out of every
 * text field. `cleaned` counts the items that had any.
 */
export function inventoryRows(document: z.infer<typeof inventoryDocumentSchema>): {
  rows: ImportRow[];
  cleaned: number;
} {
  let cleaned = 0;
  const rows = document.items.map((item) => {
    let changed = false;
    const clean = (value: string | undefined) => {
      const before = value?.trim() ?? "";
      const after = withoutIdentifiers(before);
      if (after !== before) changed = true;
      return after;
    };
    const brand = clean(item.brand);
    const model = clean(item.model);
    const notes = [
      brand ? `Brand: ${brand}` : "",
      model ? `Model: ${model}` : "",
      clean(item.notes),
    ]
      .filter(Boolean)
      .join("\n");
    const price = item.purchase?.price;
    const row: ImportRow = {
      title: clean(item.title),
      status: item.status ?? "acquired",
      category: clean(item.category),
      condition: clean(item.condition),
      purchasedOn: item.purchase?.date?.trim() ?? "",
      purchasePrice: price === undefined ? "" : String(price).trim(),
      purchaseFrom: clean(item.purchase?.from),
      notes,
    };
    if (changed) cleaned += 1;
    // Empty values are left out, as a spreadsheet's empty cells are.
    return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== "")) as ImportRow;
  });
  return { rows, cleaned };
}
