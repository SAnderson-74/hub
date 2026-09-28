import { z } from "zod";
import { parseImportDate } from "./resaleImport";

// Bank and card exports: CSV files (columns matched by the person, then saved for next
// time) and OFX/QFX statements (a fixed format with the bank's own transaction ids).
// Files are read in the browser; the server receives clean transactions.

/** CSV columns that can map to a transaction. Amount, or money out and money in. */
export const BANK_FIELDS = [
  "date",
  "amount",
  "outflow",
  "inflow",
  "payee",
  "memo",
  "category",
] as const;
export type BankField = (typeof BANK_FIELDS)[number];

export const BANK_FIELD_LABELS: Record<BankField, string> = {
  date: "Date",
  amount: "Amount",
  outflow: "Money out",
  inflow: "Money in",
  payee: "Payee",
  memo: "Memo",
  category: "Category",
};

const SYNONYMS: Record<BankField, string[]> = {
  date: [
    "date",
    "transactiondate",
    "postingdate",
    "posteddate",
    "posted",
    "transdate",
    "valuedate",
  ],
  amount: ["amount", "transactionamount", "amountusd", "value", "net"],
  outflow: [
    "debit",
    "debits",
    "withdrawal",
    "withdrawals",
    "moneyout",
    "paidout",
    "spent",
    "charge",
  ],
  inflow: ["credit", "credits", "deposit", "deposits", "moneyin", "paidin", "received", "payment"],
  payee: [
    "payee",
    "description",
    "name",
    "merchant",
    "details",
    "transaction",
    "narrative",
    "counterparty",
  ],
  memo: ["memo", "notes", "note", "reference", "extendeddescription", "additionalinfo"],
  category: ["category", "type"],
};

const squash = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

export type BankColumns = Partial<Record<BankField, number>>;

export type BankOptions = {
  /** Purchases are positive in the file (some card exports), so every sign is flipped. */
  flipSigns: boolean;
  /** Slash dates are day first, like 31/01/2030. */
  dayFirst: boolean;
};

/** A first guess at which column holds each field, from the header names. */
export function guessBankColumns(headers: readonly string[]): BankColumns {
  const columns: BankColumns = {};
  const taken = new Set<number>();
  const squashed = headers.map(squash);
  for (const field of BANK_FIELDS) {
    for (const synonym of SYNONYMS[field]) {
      const index = squashed.findIndex((header, i) => header === synonym && !taken.has(i));
      if (index !== -1) {
        columns[field] = index;
        taken.add(index);
        break;
      }
    }
  }
  // One signed amount column wins over a guessed pair.
  if (columns.amount !== undefined) {
    delete columns.outflow;
    delete columns.inflow;
  }
  return columns;
}

/** Identifies a file layout by its headers, so its column choices can be saved. */
export function headerKey(headers: readonly string[]): string {
  return headers.map((header) => header.trim().toLowerCase()).join("\u001f");
}

/** Whether the columns say where the date and the amount are. */
export function columnsReady(columns: BankColumns): boolean {
  return (
    columns.date !== undefined &&
    (columns.amount !== undefined || columns.outflow !== undefined || columns.inflow !== undefined)
  );
}

/** YYYY-MM-DD from the date formats banks use, reading slash dates day first if asked. */
export function parseBankDate(value: string, dayFirst = false): string | null {
  const text = value.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})/.exec(text);
  if (compact && /^\d{8}(\d{4,6}(\.\d+)?)?(\[.*\])?$/.test(text)) {
    return parseImportDate(`${compact[1]}-${compact[2]}-${compact[3]}`);
  }
  const slash = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(text);
  if (slash && dayFirst) {
    return parseImportDate(`${slash[3]}/${slash[1]}/${slash[4]}`);
  }
  return parseImportDate(text);
}

/**
 * Signed cents from "-42.50", "$1,234.56", "(42.50)", "42.50-", "+15", ".50", or
 * "USD 12". Parentheses and a trailing minus mean negative, as accountants write it.
 * `ofx` also rounds amounts with more than two decimals, like "12.3400", which OFX
 * files use; in a CSV that could be a thousands separator, so it's refused. null if
 * unreadable.
 */
export function parseBankAmount(value: string, ofx = false): number | null {
  let text = value
    .trim()
    .replace(/^usd\s*/i, "")
    .replace(/\s*usd$/i, "")
    .replace(/\s/g, "");
  if (text === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/^[-−]/.test(text)) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  } else if (/[-−]$/.test(text)) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  const cents = bankDollars(text.replace(/^\$/, ""), ofx);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/**
 * Cents from an unsigned amount: "1,234.56", "1234.5", ".50". Commas only as
 * thousands separators. With `roundExtra`, "12.3400" or "0.125" round to the nearest
 * cent; otherwise more than two decimals is refused.
 */
function bankDollars(text: string, roundExtra: boolean): number | null {
  const match = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d+))?$/.exec(text);
  if (!match || (!match[1] && !match[2])) return null;
  const decimals = match[2] ?? "";
  if (decimals.length > 2 && !roundExtra) return null;
  const whole = Number((match[1] ?? "").replace(/,/g, "") || "0");
  const digits = decimals.padEnd(3, "0");
  const cents = whole * 100 + Number(digits.slice(0, 2)) + (Number(digits[2]) >= 5 ? 1 : 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** A transaction read from a file, ready for the server. */
export type BankTransaction = {
  date: string;
  /** Positive for money in, negative for money out. */
  amountCents: number;
  payee: string;
  memo: string;
  /** A category name to match in the book. Unknown names are left uncategorized. */
  category?: string;
  /** The bank's own id for the transaction (OFX FITID), when the file has one. */
  externalId?: string;
};

export type ReadProblem = { row: number; message: string };

/** The balance a statement file reports, as of a date (OFX LEDGERBAL). */
export type StatementBalance = { date: string; balanceCents: number };

export type ReadResult = {
  transactions: BankTransaction[];
  problems: ReadProblem[];
  /** Only OFX files say what the bank's balance was. */
  statementBalance?: StatementBalance;
};

const clip = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);

/**
 * Reads a CSV table (header row first) with the chosen columns. Rows without a
 * readable date or amount become problems and aren't imported. Rows are numbered
 * from 1 after the header, as the file shows them.
 */
export function readBankCsv(
  table: readonly string[][],
  columns: BankColumns,
  options: BankOptions,
): ReadResult {
  const transactions: BankTransaction[] = [];
  const problems: ReadProblem[] = [];
  const cell = (cells: readonly string[], field: BankField) => {
    const index = columns[field];
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  table.slice(1).forEach((cells, index) => {
    const row = index + 1;
    const dateText = cell(cells, "date");
    const date = dateText ? parseBankDate(dateText, options.dayFirst) : null;
    if (!date) {
      problems.push({
        row,
        message: dateText ? `The date "${dateText}" isn't one Hub can read.` : "No date.",
      });
      return;
    }

    let amountCents: number | null = null;
    if (columns.amount !== undefined) {
      const text = cell(cells, "amount");
      amountCents = text ? parseBankAmount(text) : null;
      if (amountCents === null) {
        problems.push({
          row,
          message: text ? `The amount "${text}" isn't one Hub can read.` : "No amount.",
        });
        return;
      }
    } else {
      // Money out and money in columns: each holds a size, usually with the other blank.
      const outText = cell(cells, "outflow");
      const inText = cell(cells, "inflow");
      const out = outText ? parseBankAmount(outText) : 0;
      const into = inText ? parseBankAmount(inText) : 0;
      if (out === null || into === null) {
        const bad = out === null ? outText : inText;
        problems.push({ row, message: `The amount "${bad}" isn't one Hub can read.` });
        return;
      }
      amountCents = Math.abs(into) - Math.abs(out);
    }
    if (options.flipSigns) amountCents = -amountCents;
    if (amountCents === 0) {
      problems.push({ row, message: "The amount is $0." });
      return;
    }

    const category = clip(cell(cells, "category"), 60);
    transactions.push({
      date,
      amountCents,
      payee: clip(cell(cells, "payee"), 200),
      memo: clip(cell(cells, "memo"), 2_000),
      ...(category ? { category } : {}),
    });
  });
  return { transactions, problems };
}

/** Whether text looks like an OFX or QFX statement rather than a CSV. */
export function isOfx(text: string): boolean {
  const start = text.slice(0, 2_000).toUpperCase();
  return start.includes("OFXHEADER") || start.includes("<OFX>") || start.includes("<?OFX");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (value: string) =>
  value.replace(
    /&(amp|lt|gt|quot|apos);/gi,
    (_, name: string) => ENTITIES[name.toLowerCase()] ?? "",
  );

/** A leaf value inside an OFX block. Works for OFX 1 (no closing tags) and OFX 2 (XML). */
function ofxValue(block: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return match?.[1] ? decode(match[1].trim()) : "";
}

/**
 * Reads the transactions in an OFX or QFX statement. Account numbers in the file
 * are ignored; the person picks the account in Hub.
 */
export function readOfx(text: string): ReadResult {
  const transactions: BankTransaction[] = [];
  const problems: ReadProblem[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  blocks.forEach((block, index) => {
    const row = index + 1;
    const dateText = ofxValue(block, "DTPOSTED");
    const date = dateText ? parseBankDate(dateText) : null;
    const amountText = ofxValue(block, "TRNAMT");
    const amountCents = amountText
      ? parseBankAmount(amountText.replace(/,(\d{1,2})$/, ".$1"), true)
      : null;
    if (!date) {
      problems.push({
        row,
        message: dateText ? `The date "${dateText}" isn't one Hub can read.` : "No date.",
      });
      return;
    }
    if (amountCents === null || amountCents === 0) {
      problems.push({
        row,
        message: amountText ? `The amount "${amountText}" isn't one Hub can read.` : "No amount.",
      });
      return;
    }
    const name = ofxValue(block, "NAME") || ofxValue(block, "PAYEE");
    const memo = ofxValue(block, "MEMO");
    const externalId = ofxValue(block, "FITID").slice(0, 255);
    transactions.push({
      date,
      amountCents,
      // Some banks put everything in MEMO and leave NAME empty.
      payee: clip(name || memo, 200),
      memo: name ? clip(memo, 2_000) : "",
      ...(externalId ? { externalId } : {}),
    });
  });
  const statementBalance = readLedgerBalance(text);
  return { transactions, problems, ...(statementBalance ? { statementBalance } : {}) };
}

/** The bank's own balance in the file (LEDGERBAL), to check Hub's against. */
function readLedgerBalance(text: string): StatementBalance | undefined {
  const block = /<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i.exec(
    text,
  )?.[0];
  if (!block) return undefined;
  const amount = ofxValue(block, "BALAMT");
  const dateText = ofxValue(block, "DTASOF");
  const balanceCents = amount ? parseBankAmount(amount.replace(/,(\d{1,2})$/, ".$1"), true) : null;
  const date = dateText ? parseBankDate(dateText) : null;
  return balanceCents === null || !date ? undefined : { date, balanceCents };
}

// What the browser sends

const MAX_ROWS = 5_000;

export const bankTransactionSchema = z
  .object({
    date: z.iso.date("Use a date like 2030-01-31."),
    amountCents: z
      .number()
      .int()
      .min(-10_000_000_000)
      .max(10_000_000_000)
      .refine((value) => value !== 0, "Amounts can't be $0."),
    payee: z.string().max(200),
    memo: z.string().max(2_000),
    category: z.string().max(60).optional(),
    externalId: z.string().max(255).optional(),
  })
  .strict();

const columnIndex = z.number().int().min(0).max(500);

export const bankLayoutSchema = z
  .object({
    headerKey: z.string().min(1).max(5_000),
    columns: z
      .object(Object.fromEntries(BANK_FIELDS.map((field) => [field, columnIndex.optional()])))
      .strict(),
    options: z.object({ flipSigns: z.boolean(), dayFirst: z.boolean() }).strict(),
  })
  .strict();
export type BankLayout = { headerKey: string; columns: BankColumns; options: BankOptions };

export const bankImportSchema = z
  .object({
    accountId: z.number().int().positive(),
    source: z.enum(["csv", "ofx"]),
    fileName: z.string().trim().max(200).default(""),
    transactions: z
      .array(bankTransactionSchema)
      .min(1, "The file has no transactions to import.")
      .max(
        MAX_ROWS,
        `Import at most ${MAX_ROWS.toLocaleString("en-US")} transactions at a time. Split bigger files.`,
      ),
    /** A CSV's column choices, saved for the next file with the same headers. */
    layout: bankLayoutSchema.optional(),
    /** The balance the file reports, to compare with Hub's after the import. */
    statementBalance: z
      .object({
        date: z.iso.date(),
        balanceCents: z.number().int().min(-100_000_000_000).max(100_000_000_000),
      })
      .strict()
      .optional(),
  })
  .strict();
export type BankImport = z.input<typeof bankImportSchema>;

/** What an import did (or, for a dry run, would do), row by row. */
export type BankImportResult = {
  importId: number | null;
  created: number;
  duplicates: number;
  /** Category names in the file that aren't in the book; those rows stay uncategorized. */
  unknownCategories: string[];
  /** New transactions given a category (and maybe a cleaner payee) by the book's rules. */
  categorizedByRules: number;
  rows: Array<{
    /** 1-based, in the order sent. */
    row: number;
    date: string;
    amountCents: number;
    payee: string;
    outcome: "create" | "duplicate";
  }>;
  /**
   * The file's own balance next to Hub's for the end of that day, counting this
   * import. null when the file doesn't say.
   */
  balanceCheck: { date: string; bankCents: number; hubCents: number } | null;
};
