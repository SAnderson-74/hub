import { z } from "zod";
import { formatCents } from "./money";
import { hasLongNumber } from "./receipts";
import { parseImportDate } from "./resaleImport";
import { readDollars } from "./resaleListing";

// Tithing: 10% of what comes in. A money-in transaction can be switched off ("tithing
// doesn't apply") or tithed on a different amount (just the profit from a sale, gross
// pay). Payments are money-out transactions marked as a donation, and each is linked to
// the income it pays for. Income is red until its tithing is paid and green once it is.

/** Tithing is a tenth. */
export const TITHING_PERCENT = 10;

/** What tithing comes to on an amount, to the cent. */
export function tithingOwed(baseCents: number): number {
  return Math.round((Math.max(0, baseCents) * TITHING_PERCENT) / 100);
}

export const FUNDS = ["tithing", "fast_offering", "other"] as const;
export type Fund = (typeof FUNDS)[number];

export const FUND_LABELS: Record<Fund, string> = {
  tithing: "Tithing",
  fast_offering: "Fast offering",
  other: "Other donation",
};

export type TithingStatus = "unpaid" | "partial" | "paid";

export const STATUS_LABELS: Record<TithingStatus, string> = {
  unpaid: "Not paid",
  partial: "Partly paid",
  paid: "Paid",
};

/** Where income stands, from what it owes and what payments have been linked to it. */
export function tithingStatus(owedCents: number, paidCents: number): TithingStatus {
  if (owedCents <= 0 || paidCents >= owedCents) return "paid";
  return paidCents > 0 ? "partial" : "unpaid";
}

// Requests

const id = z.number().int().positive();
const date = z.iso.date("Use a date like 2030-01-31.");
const cents = z
  .number()
  .int("Use whole cents.")
  .min(0, "Use an amount of $0 or more.")
  .max(10_000_000_000, "Use an amount under $100,000,000.");

/** Whether tithing applies to money in, and the amount it's figured on. */
export const incomeSetSchema = z
  .object({
    applies: z.boolean(),
    /** The amount to tithe on, or null for the whole transaction (or a sale's profit). */
    baseCents: cents.nullable().default(null),
  })
  .strict();
export type IncomeSet = z.input<typeof incomeSetSchema>;

const linkSchema = z
  .object({ incomeTransactionId: id, amountCents: cents.min(1, "Give each link an amount.") })
  .strict();
export type LinkInput = z.infer<typeof linkSchema>;

const linksSchema = z.array(linkSchema).max(200, "Link up to 200 income transactions.");

export const paymentCreateSchema = z
  .object({
    accountId: id,
    date,
    amountCents: cents.min(1, "Enter an amount above $0."),
    fund: z.enum(FUNDS).default("tithing"),
    memo: z.string().trim().max(200, "Keep notes under 200 characters.").default(""),
    /** The income this pays for (tithing only). */
    links: linksSchema.default([]),
  })
  .strict();
export type PaymentCreate = z.input<typeof paymentCreateSchema>;

/** Marks a money-out transaction as a donation, and says which income it pays for. */
export const paymentSetSchema = z
  .object({ fund: z.enum(FUNDS), links: linksSchema.default([]) })
  .strict();
export type PaymentSet = z.input<typeof paymentSetSchema>;

/**
 * Marks income as paid (or not) without a payment in Hub, for tithing paid before Hub
 * tracked it: income picked by id, or all unpaid income through a date.
 */
export const settleSchema = z
  .object({
    incomeIds: z.array(id).min(1, "Pick the income first.").max(5_000).optional(),
    through: date.optional(),
    settled: z.boolean().default(true),
  })
  .strict()
  .refine((value) => (value.incomeIds === undefined) !== (value.through === undefined), {
    message: "Pick income, or a date to mark paid through.",
  })
  .refine((value) => value.through === undefined || value.settled, {
    message: "Undo marked-paid income by picking it.",
  });
export type SettleInput = z.input<typeof settleSchema>;

export const overviewQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

// The `hub-tithing/v1` format (docs/CLAUDE_PROJECT.md): donation history from a
// screenshot or receipt, and paychecks with their gross pay, as a Claude Project reads
// them. Pasted text is untrusted: every field has a size limit, unknown fields are
// ignored, and nothing is stored as pasted.

const dollars = z.union([z.number(), z.string().max(40)]);
const text = (max: number) => z.string().max(max, `Keep this under ${max} characters.`);

const documentPaymentSchema = z.object({
  date: text(40),
  /** What was given, in dollars. */
  amount: dollars,
  /** "tithing", "fast offering", or the fund's name for anything else. */
  fund: text(60).optional(),
  note: text(200).optional(),
});

const documentIncomeSchema = z.object({
  date: text(40),
  /** Who paid it, like "Example Employer". */
  source: text(120).optional(),
  /** What reached the account (net pay), to find the deposit in Hub. */
  deposit: dollars,
  /** Pay before taxes and deductions. Tithing is figured on this. */
  gross: dollars.optional(),
  /** The tithing amount, when the stub or the person gives it instead of gross pay. */
  tithing: dollars.optional(),
});

export const MAX_TITHING_ROWS = 200;

export const tithingDocumentSchema = z
  .object({
    format: z.literal("hub-tithing/v1", {
      error: 'This isn\'t a hub-tithing/v1 document. Its "format" should be "hub-tithing/v1".',
    }),
    payments: z
      .array(documentPaymentSchema)
      .max(MAX_TITHING_ROWS, `Paste up to ${MAX_TITHING_ROWS} payments at a time.`)
      .default([]),
    income: z
      .array(documentIncomeSchema)
      .max(MAX_TITHING_ROWS, `Paste up to ${MAX_TITHING_ROWS} paychecks at a time.`)
      .default([]),
  })
  .refine((document) => document.payments.length + document.income.length > 0, {
    message: "There are no payments or paychecks in it.",
  });
export type TithingDocument = z.input<typeof tithingDocumentSchema>;

/** A pasted document with the choices made in the preview. */
export const tithingImportSchema = z
  .object({
    document: tithingDocumentSchema,
    /** Where a payment with no matching bank transaction is added. */
    accountId: id,
    /** Payments and paychecks to leave out, by position (0 is the first). */
    skipPayments: z.array(z.number().int().min(0)).max(MAX_TITHING_ROWS).default([]),
    skipIncome: z.array(z.number().int().min(0)).max(MAX_TITHING_ROWS).default([]),
  })
  .strict();
export type TithingImportInput = z.input<typeof tithingImportSchema>;

/** The fund a pasted name means: "Tithing", "fast offering", anything else is "other". */
export function readFund(name: string | undefined): Fund {
  const text = (name ?? "").toLowerCase();
  if (text.includes("tith")) return "tithing";
  if (text.includes("fast")) return "fast_offering";
  return text.trim() === "" ? "tithing" : "other";
}

export type ReadPayment = {
  date: string | null;
  amountCents: number | null;
  fund: Fund;
  /** The fund's own name when it isn't tithing or fast offering. */
  note: string;
  problems: string[];
};

export type ReadIncome = {
  date: string | null;
  source: string;
  depositCents: number | null;
  /** The amount tithing is figured on, from gross pay or the tithing amount. */
  baseCents: number | null;
  problems: string[];
};

/** Reads a pasted document's payments and paychecks, with what's wrong with each. */
export function readTithing(document: z.infer<typeof tithingDocumentSchema>): {
  payments: ReadPayment[];
  income: ReadIncome[];
} {
  const payments = document.payments.map((payment): ReadPayment => {
    const problems: string[] = [];
    const dateText = payment.date.trim();
    const date = dateText ? parseImportDate(dateText) : null;
    if (!date) problems.push(`"${dateText}" isn't a date Hub can read.`);
    const amount = readDollars(payment.amount);
    if (amount === null || amount === undefined || amount === 0) {
      problems.push(`The amount "${String(payment.amount)}" isn't an amount Hub can read.`);
    }
    const fund = readFund(payment.fund);
    const note = [fund === "other" ? (payment.fund ?? "").trim() : "", payment.note?.trim() ?? ""]
      .filter(Boolean)
      .join(": ");
    if (hasLongNumber(note)) {
      problems.push("It has a long number that could be an account number. Remove it.");
    }
    return { date, amountCents: amount ?? null, fund, note, problems };
  });

  const income = document.income.map((row): ReadIncome => {
    const problems: string[] = [];
    const dateText = row.date.trim();
    const date = dateText ? parseImportDate(dateText) : null;
    if (!date) problems.push(`"${dateText}" isn't a date Hub can read.`);
    const deposit = readDollars(row.deposit);
    if (deposit === null || deposit === undefined || deposit === 0) {
      problems.push(`The deposit "${String(row.deposit)}" isn't an amount Hub can read.`);
    }
    const gross = readDollars(row.gross);
    const tithing = readDollars(row.tithing);
    if (gross === null || tithing === null) {
      problems.push("The gross pay or tithing amount can't be read.");
    }
    let baseCents: number | null = null;
    if (typeof gross === "number") baseCents = gross;
    else if (typeof tithing === "number") baseCents = Math.round(tithing * (100 / TITHING_PERCENT));
    else if (gross === undefined && tithing === undefined) {
      problems.push("It has neither gross pay nor a tithing amount, so there's nothing to set.");
    }
    const source = (row.source ?? "").trim();
    if (hasLongNumber(source)) {
      problems.push("It has a long number that could be an account number. Remove it.");
    }
    return { date, source, depositCents: deposit ?? null, baseCents, problems };
  });
  return { payments, income };
}

// Chart summaries

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mar" from a YYYY-MM month. */
export const monthName = (month: string): string => MONTHS[Number(month.slice(5)) - 1] ?? month;

export type MonthRow = {
  /** YYYY-MM */
  month: string;
  owedCents: number;
  paidCents: number;
  /** Tithing owed minus tithing paid, from the start through the month's end. */
  balanceCents: number;
};

/** The monthly chart's one-line summary. */
export function monthlySummary(year: number, months: readonly MonthRow[]): string {
  const owed = months.reduce((sum, row) => sum + row.owedCents, 0);
  const paid = months.reduce((sum, row) => sum + row.paidCents, 0);
  const end = months.at(-1)?.balanceCents ?? 0;
  if (owed === 0 && paid === 0) return `No tithing owed or paid in ${year}.`;
  const standing =
    end > 0
      ? `${formatCents(end)} still owed at the end of the year`
      : end < 0
        ? `${formatCents(-end)} paid ahead at the end of the year`
        : "paid up at the end of the year";
  return `${formatCents(owed)} owed and ${formatCents(paid)} paid in ${year}: ${standing}.`;
}

export type SourceRow = { source: string; incomeCents: number; tithableCents: number };

/** The income-by-source chart's one-line summary. */
export function sourceSummary(year: number, sources: readonly SourceRow[]): string {
  const income = sources.reduce((sum, row) => sum + row.incomeCents, 0);
  if (income === 0) return `No income in ${year}.`;
  const tithable = sources.reduce((sum, row) => sum + row.tithableCents, 0);
  const top = sources.reduce((best, row) => (row.tithableCents > best.tithableCents ? row : best));
  const lead = top.tithableCents > 0 ? ` Most of it is from ${top.source}.` : "";
  return `${formatCents(tithable)} of ${formatCents(income)} income in ${year} is tithed on.${lead}`;
}
