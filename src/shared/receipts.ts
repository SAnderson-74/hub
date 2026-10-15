import { z } from "zod";
import { parseImportDate } from "./resaleImport";
import { readDollars } from "./resaleListing";

// The `hub-receipt/v1` format (docs/CLAUDE_PROJECT.md): one or more receipts, as a
// Claude Project reads them from photos, pasted into Hub. Pasted text is untrusted:
// every field has a size limit, unknown fields are ignored, and nothing is stored as
// pasted. Hub matches each receipt to the bank's transaction for it, or adds one.

/** A dollar amount as a number (12.5) or text ("$12.50"). */
const dollars = z.union([z.number(), z.string().max(40)]);
const text = (max: number) => z.string().max(max, `Keep this under ${max} characters.`);

const receiptItemSchema = z.object({
  name: text(200),
  /** What the line cost in all, after its own discounts. Negative for a coupon line. */
  amount: dollars,
  /** A category name from the book, like "Groceries". */
  category: text(60).optional(),
});

const receiptSchema = z.object({
  store: text(200),
  date: text(40),
  /** What was charged in all: items, tax, tip, less discounts. */
  total: dollars,
  /** "purchase" (money out) or "return" (money back). */
  type: z.enum(["purchase", "return"]).default("purchase"),
  /** The card's last 4 digits, if the receipt shows them. Never more. */
  cardLast4: z.string().max(20).nullable().optional(),
  /** For a receipt without items: the category for the whole thing. */
  category: text(60).optional(),
  items: z.array(receiptItemSchema).max(300, "Keep receipts to 300 lines.").default([]),
  note: text(500).optional(),
});

export const receiptDocumentSchema = z.object({
  format: z.literal("hub-receipt/v1", {
    error: 'This isn\'t a hub-receipt/v1 document. Its "format" should be "hub-receipt/v1".',
  }),
  receipts: z
    .array(receiptSchema)
    .min(1, "There are no receipts in it.")
    .max(50, "Paste up to 50 receipts at a time."),
});
export type ReceiptDocument = z.input<typeof receiptDocumentSchema>;

const id = z.number().int().positive();

/** A pasted receipts document, with the choices made in the preview. */
export const receiptImportSchema = z
  .object({
    bookId: id,
    document: receiptDocumentSchema,
    /** Where receipts without a known card go. */
    accountId: id.nullable().default(null),
    /** Category names from the receipts (any case) the book doesn't have, to its categories. */
    categoryMap: z.record(z.string().max(60), id).default({}),
    /** Receipts to leave out, by position (0 is the first). */
    skip: z.array(z.number().int().min(0).max(49)).max(50).default([]),
  })
  .strict();
export type ReceiptImportInput = z.input<typeof receiptImportSchema>;

/**
 * A run of 9 or more digits, allowing spaces and dashes between them: more than any
 * receipt needs, and the shape of a card or account number. Text with one is refused,
 * so a full number never gets into Hub.
 */
const LONG_NUMBER = /\d(?:[\s-]?\d){8,}/;

export function hasLongNumber(value: string): boolean {
  return LONG_NUMBER.test(value);
}

export type ReadItem = { name: string; amountCents: number; category: string };

export type ReadReceipt = {
  store: string;
  date: string | null;
  /** Positive for a purchase; a return is money back. */
  totalCents: number | null;
  type: "purchase" | "return";
  cardLast4: string | null;
  category: string;
  items: ReadItem[];
  note: string;
  /** Problems that stop this receipt from being added until they're fixed. */
  problems: string[];
};

/** Reads a pasted document's receipts, with what's wrong with each. */
export function readReceipts(document: z.infer<typeof receiptDocumentSchema>): ReadReceipt[] {
  return document.receipts.map((receipt) => {
    const problems: string[] = [];
    const store = receipt.store.trim();
    if (!store) problems.push("It has no store name.");
    const dateText = receipt.date.trim();
    const date = dateText ? parseImportDate(dateText) : null;
    if (!date) problems.push(`"${dateText}" isn't a date Hub can read.`);
    const total = readDollars(receipt.total);
    if (total === null || total === undefined || total === 0) {
      problems.push(`The total "${receipt.total}" isn't an amount Hub can read.`);
    }

    const last4 = receipt.cardLast4?.trim() || null;
    if (last4 !== null && !/^\d{4}$/.test(last4)) {
      problems.push("Give only the card's last 4 digits.");
    }

    const items: ReadItem[] = [];
    for (const [index, item] of receipt.items.entries()) {
      const name = item.name.trim();
      // Coupons and discounts come as negative lines.
      const raw = typeof item.amount === "number" ? item.amount : item.amount.trim();
      const negative = typeof raw === "number" ? raw < 0 : raw.startsWith("-");
      const cents = readDollars(typeof raw === "number" ? Math.abs(raw) : raw.replace(/^-/, ""));
      if (cents === null || cents === undefined) {
        problems.push(`Line ${index + 1} ("${name}") has an amount Hub can't read.`);
        continue;
      }
      items.push({
        name,
        amountCents: negative ? -cents : cents,
        category: item.category?.trim() ?? "",
      });
    }

    const note = receipt.note?.trim() ?? "";
    const texts = [store, note, ...items.map((item) => item.name)];
    if (texts.some(hasLongNumber)) {
      problems.push(
        "It has a long number that could be a card or account number. Remove it, then paste again.",
      );
    }

    return {
      store,
      date,
      totalCents: total ?? null,
      type: receipt.type,
      cardLast4: last4 !== null && /^\d{4}$/.test(last4) ? last4 : null,
      category: receipt.category?.trim() ?? "",
      items,
      note,
      problems,
    };
  });
}

/** Category names in receipts, the way they're matched: trimmed, any case. */
export const categoryKey = (name: string) => name.trim().toLowerCase();

/**
 * How a receipt's total splits by category. Lines add up by category; what the lines
 * don't cover (tax, tip, a discount on the whole receipt, rounding) is shared out in
 * proportion, so the parts add up to the total exactly. A receipt without lines, or
 * whose lines add up to nothing, is one part in its own category. Biggest part first.
 */
export function receiptParts(
  receipt: Pick<ReadReceipt, "items" | "category">,
  totalCents: number,
): Array<{ category: string; cents: number }> {
  const sums = new Map<string, { category: string; cents: number }>();
  for (const item of receipt.items) {
    const key = categoryKey(item.category);
    const entry = sums.get(key) ?? { category: item.category, cents: 0 };
    entry.cents += item.amountCents;
    sums.set(key, entry);
  }
  const groups = [...sums.values()].filter((group) => group.cents > 0);
  const covered = groups.reduce((sum, group) => sum + group.cents, 0);
  if (groups.length === 0 || covered <= 0) {
    return [
      { category: receipt.category || (receipt.items[0]?.category ?? ""), cents: totalCents },
    ];
  }
  const shared = groups.map((group) => ({
    category: group.category,
    cents: Math.floor((group.cents * totalCents) / covered),
  }));
  // Whole cents: what rounding left goes to the biggest part.
  shared.sort((a, b) => b.cents - a.cents);
  const left = totalCents - shared.reduce((sum, part) => sum + part.cents, 0);
  if (shared[0]) shared[0].cents += left;
  return shared;
}
