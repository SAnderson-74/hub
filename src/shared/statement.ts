import { z } from "zod";
import {
  type BankTransaction,
  parseBankAmount,
  type ReadProblem,
  type ReadResult,
} from "./bankImport";
import { parseImportDate } from "./resaleImport";

// The `hub-statement/v1` format (docs/CLAUDE_PROJECT.md): a bank or card statement, or
// a list of transactions, as a Claude Project reads it from a screenshot or PDF. It
// becomes the same clean transactions a bank file does and goes through the same
// import, with its duplicate checks and undo. Pasted text is untrusted: every field
// has a size limit, unknown fields are ignored, and long digit runs are masked.

const dollars = z.union([z.number(), z.string().max(40)]);
const text = (max: number) => z.string().max(max, `Keep this under ${max} characters.`);

const statementLineSchema = z.object({
  date: text(40),
  /** The statement's text for it, as printed. */
  description: text(200),
  /** Negative for money out, positive for money in, as the account sees it. */
  amount: dollars,
  memo: text(500).optional(),
});

export const MAX_STATEMENT_LINES = 1_000;

export const statementDocumentSchema = z.object({
  format: z.literal("hub-statement/v1", {
    error: 'This isn\'t a hub-statement/v1 document. Its "format" should be "hub-statement/v1".',
  }),
  account: z
    .object({
      /** The account's or card's last 4 digits. Never more. */
      last4: z.string().max(40).nullable().optional(),
    })
    .optional(),
  period: z.object({ start: text(40).optional(), end: text(40).optional() }).optional(),
  /** The balance at the end of the period: negative for money owed. */
  closingBalance: dollars.nullable().optional(),
  transactions: z
    .array(statementLineSchema)
    .min(1, "There are no transactions in it.")
    .max(
      MAX_STATEMENT_LINES,
      `Paste up to ${MAX_STATEMENT_LINES.toLocaleString("en-US")} transactions at a time.`,
    ),
});
export type StatementDocument = z.input<typeof statementDocumentSchema>;

/**
 * A run of 9 or more digits, allowing spaces and dashes between them: the shape of an
 * account, card, or reference number. Statements print these in descriptions, so
 * instead of refusing the line, all but the last 4 digits are hidden.
 */
const LONG_NUMBER = /\d(?:[\s-]?\d){8,}/g;

export function maskLongNumbers(value: string): string {
  return value.replace(LONG_NUMBER, (run) => `••${run.replace(/\D/g, "").slice(-4)}`);
}

/** Signed cents from a number (12.5) or text ("-$12.50", "(12.50)"). null if unreadable. */
function signedCents(value: number | string): number | null {
  if (typeof value === "number") {
    const cents = Math.round(value * 100);
    return Number.isFinite(value) && Math.abs(cents) <= 10_000_000_000 ? cents : null;
  }
  const cents = parseBankAmount(value);
  return cents !== null && Math.abs(cents) <= 10_000_000_000 ? cents : null;
}

export type ReadStatement = ReadResult & {
  /** The account's last 4 digits, to pick the account. null when missing or not 4 digits. */
  last4: string | null;
  /** Notes about the document as a whole, like digits that aren't a last 4. */
  notes: string[];
  /** The last day the statement covers, for naming the import. */
  endDate: string | null;
};

/**
 * Reads a pasted statement into the transactions a bank file gives. Lines without a
 * readable date or amount become problems and are left out, numbered from 1 as pasted.
 * The closing balance is checked against Hub's on the statement's last day.
 */
export function readStatement(document: z.infer<typeof statementDocumentSchema>): ReadStatement {
  const notes: string[] = [];
  const raw = document.account?.last4?.trim() || null;
  const last4 = raw !== null && /^\d{4}$/.test(raw) ? raw : null;
  if (raw !== null && last4 === null) {
    notes.push("The account's digits weren't a last 4, so they were left out. Pick the account.");
  }

  const transactions: BankTransaction[] = [];
  const problems: ReadProblem[] = [];
  document.transactions.forEach((line, index) => {
    const row = index + 1;
    const date = parseImportDate(line.date);
    if (!date) {
      problems.push({ row, message: `"${line.date.slice(0, 40)}" isn't a date Hub can read.` });
      return;
    }
    const amountCents = signedCents(line.amount);
    if (amountCents === null || amountCents === 0) {
      problems.push({
        row,
        message: `The amount "${String(line.amount).slice(0, 40)}" can't be read.`,
      });
      return;
    }
    transactions.push({
      date,
      amountCents,
      payee: maskLongNumbers(line.description.trim()),
      memo: maskLongNumbers(line.memo?.trim() ?? ""),
    });
  });

  const dates = transactions.map((row) => row.date).sort();
  const endText = document.period?.end?.trim() ?? "";
  const endDate = (endText ? parseImportDate(endText) : null) ?? dates.at(-1) ?? null;
  const closing =
    document.closingBalance === null || document.closingBalance === undefined
      ? null
      : signedCents(document.closingBalance);
  if (document.closingBalance != null && closing === null) {
    notes.push("The closing balance couldn't be read, so it isn't checked.");
  }
  const periodEnd = endText ? parseImportDate(endText) : null;
  if (closing !== null && !periodEnd) {
    notes.push("It doesn't say the day the statement ends, so its balance isn't checked.");
  }
  return {
    transactions,
    problems,
    // Only a stated period end dates the balance; the last transaction's day may not be it.
    ...(closing !== null && periodEnd
      ? { statementBalance: { date: periodEnd, balanceCents: closing } }
      : {}),
    last4,
    notes,
    endDate,
  };
}
