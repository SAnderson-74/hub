import { z } from "zod";
import type { AccountKind } from "./books";

// Payment cards. A card belongs to the account it spends from: a credit card to its
// credit card account, a debit card to the checking (or other) account it draws on.
// Only the last 4 digits are ever kept, for telling cards apart and matching bank
// text and receipts.

export const CARD_KINDS = ["credit", "debit"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const CARD_KIND_LABELS: Record<CardKind, string> = {
  credit: "Credit card",
  debit: "Debit card",
};

/** The kind of card an account can have, or null when it can't have cards (loans, cash). */
export function cardKindFor(accountKind: AccountKind): CardKind | null {
  if (accountKind === "credit_card") return "credit";
  if (accountKind === "checking" || accountKind === "savings" || accountKind === "other") {
    return "debit";
  }
  return null;
}

const last4 = z
  .string()
  .trim()
  .regex(/^(\d{4})?$/, "Enter only the last 4 digits of the card, like 1234.")
  .transform((value) => value || null)
  .nullable();

const cardName = z
  .string()
  .trim()
  .min(1, "Give the card a name.")
  .max(60, "Keep card names under 60 characters.");

export const cardCreateSchema = z
  .object({
    accountId: z.number().int().positive(),
    name: cardName,
    last4: last4.optional(),
  })
  .strict();
export type CardCreate = z.infer<typeof cardCreateSchema>;

/** A card stays on its account. */
export const cardUpdateSchema = z
  .object({ name: cardName, last4, archived: z.boolean() })
  .partial()
  .strict();
export type CardUpdate = z.infer<typeof cardUpdateSchema>;

export type CardForGuess = { id: number; last4: string | null; archived: boolean };

/** Card digits as banks write them: "x1234", "XXXX1234", "*1234", "...1234", "ending in 1234", "card 1234". */
const DIGITS =
  /(?:\bx+|\*+|\.{2,}|\bending(?:\s+in)?|\bcard(?:\s*(?:no\.?|number|#))?)\s*(\d{4})\b/gi;

/** Words banks put on debit card purchases, as opposed to checks, transfers, and fees. */
const CARD_WORDS =
  /\b(?:debit card|debit crd|dbt crd|dbt card|card purchase|card pmt|checkcard|check card|chkcard|pos|point of sale|visa|mastercard)\b/i;

/** A payment toward the card, which isn't a purchase made with it. */
const PAYMENT = /\b(?:payment|autopay|auto pay|thank you)\b/i;

/**
 * Which of an account's cards a transaction was made with, when the bank's text or
 * the account makes it clear, or null when it doesn't:
 * - card digits in the text pick the card with those last 4 digits;
 * - on a credit card account with one card, everything but payments is that card;
 * - on a checking account with one debit card, text like "debit card purchase" or
 *   "POS" means that card.
 */
export function guessCard(
  accountKind: AccountKind,
  cards: readonly CardForGuess[],
  row: { payee: string; memo: string; amountCents: number },
): number | null {
  if (cards.length === 0 || cardKindFor(accountKind) === null) return null;
  const text = `${row.payee} ${row.memo}`;
  const digits = new Set([...text.matchAll(DIGITS)].map((match) => match[1]));
  const byDigits = cards.filter((card) => card.last4 !== null && digits.has(card.last4));
  if (byDigits.length === 1) return byDigits[0]?.id ?? null;
  const active = cards.filter((card) => !card.archived);
  const [only] = active;
  if (active.length !== 1 || !only) return null;
  if (accountKind === "credit_card") {
    return row.amountCents > 0 && PAYMENT.test(text) ? null : only.id;
  }
  return CARD_WORDS.test(text) ? only.id : null;
}

/** "Rewards card ••4321", or the name alone without digits. */
export function cardLabel(card: { name: string; last4: string | null }): string {
  return card.last4 ? `${card.name} ••${card.last4}` : card.name;
}
