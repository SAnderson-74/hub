import { z } from "zod";

// Books in the accounting sense: a set of accounts, categories, and transactions
// kept apart from the others, like personal money and a small business.

export const BOOK_KINDS = ["personal", "business"] as const;
export type BookKind = (typeof BOOK_KINDS)[number];

export const BOOK_KIND_LABELS: Record<BookKind, string> = {
  personal: "Personal",
  business: "Business",
};

export const ACCOUNT_KINDS = [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "loan",
  "investment",
  "other",
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: "Spending",
  income: "Income",
};

/**
 * Categories a new book can start with, so it's usable right away. Neutral and
 * editable: rename, archive, or delete any of them.
 */
export const STARTER_CATEGORIES: Record<BookKind, Record<CategoryKind, string[]>> = {
  personal: {
    expense: [
      "Groceries",
      "Dining out",
      "Housing",
      "Utilities",
      "Transportation",
      "Insurance",
      "Health",
      "Shopping",
      "Entertainment",
      "Subscriptions",
      "Gifts",
      "Other spending",
    ],
    income: ["Paycheck", "Interest", "Other income"],
  },
  business: {
    expense: [
      "Supplies",
      "Inventory",
      "Fees",
      "Shipping",
      "Software",
      "Equipment",
      "Advertising",
      "Travel",
      "Other spending",
    ],
    income: ["Sales", "Services", "Other income"],
  },
};

const id = z.number().int().positive();
const date = z.iso.date("Use a date like 2030-01-31.");
/** Signed cents. Money in is positive, money out negative. */
const signedCents = z
  .number()
  .int("Use whole cents.")
  .min(-10_000_000_000, "Use an amount under $100,000,000.")
  .max(10_000_000_000, "Use an amount under $100,000,000.");
const name = (what: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Give the ${what} a name.`)
    .max(max, `Keep ${what} names under ${max} characters.`);
const notes = z.string().max(20_000, "Keep notes under 20,000 characters.");

// Books

export const bookCreateSchema = z
  .object({
    name: name("book", 60),
    kind: z.enum(BOOK_KINDS),
    /** Adds STARTER_CATEGORIES for the book's kind. */
    starterCategories: z.boolean().optional(),
  })
  .strict();
export type BookCreate = z.infer<typeof bookCreateSchema>;

export const bookUpdateSchema = z
  .object({ name: name("book", 60), kind: z.enum(BOOK_KINDS), archived: z.boolean() })
  .partial()
  .strict();
export type BookUpdate = z.infer<typeof bookUpdateSchema>;

// Accounts

const accountFields = {
  name: name("account", 80),
  kind: z.enum(ACCOUNT_KINDS),
  /** The bank or company, like "Example Bank". Optional. */
  institution: z.string().trim().max(80, "Keep institution names under 80 characters."),
  /** What the account held before its first transaction here. Negative for money owed. */
  openingBalanceCents: signedCents,
  notes,
  archived: z.boolean(),
};

export const accountCreateSchema = z
  .object({ bookId: id, ...accountFields })
  .partial()
  .required({ bookId: true, name: true, kind: true })
  .strict();
export type AccountCreate = z.infer<typeof accountCreateSchema>;

/** An account stays in its book, so its transactions' categories stay valid. */
export const accountUpdateSchema = z.object(accountFields).partial().strict();
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

// Categories

export const categoryCreateSchema = z
  .object({ bookId: id, name: name("category", 60), kind: z.enum(CATEGORY_KINDS) })
  .strict();
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z
  .object({ name: name("category", 60), kind: z.enum(CATEGORY_KINDS), archived: z.boolean() })
  .partial()
  .strict();
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

/** `?bookId=1` for a book's accounts or categories. */
export const bookQuerySchema = z.object({ bookId: z.coerce.number().int().positive() });

// Transactions

const transactionFields = {
  accountId: id,
  date,
  amountCents: signedCents.refine((value) => value !== 0, "Enter an amount other than $0."),
  /** Who was paid or who paid, like "Corner grocery". */
  payee: z.string().trim().max(200, "Keep payees under 200 characters."),
  memo: z.string().max(2_000, "Keep memos under 2,000 characters."),
  /** A category in the same book as the account, or null for none. */
  categoryId: id.nullable(),
};

export const transactionCreateSchema = z
  .object(transactionFields)
  .partial()
  .required({ accountId: true, date: true, amountCents: true })
  .strict();
export type TransactionCreate = z.infer<typeof transactionCreateSchema>;

export const transactionUpdateSchema = z.object(transactionFields).partial().strict();
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;

/**
 * A book's transactions, newest first, a page at a time. `categoryId=none` finds
 * uncategorized ones; `q` searches payees and memos.
 */
export const transactionQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
  accountId: z.coerce.number().int().positive().optional(),
  categoryId: z.union([z.literal("none"), z.coerce.number().int().positive()]).optional(),
  from: date.optional(),
  to: date.optional(),
  q: z.string().trim().max(100, "Search for under 100 characters.").optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
