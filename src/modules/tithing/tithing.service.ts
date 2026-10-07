import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest } from "../../server/errors";
import {
  FUND_LABELS,
  type Fund,
  type IncomeSet,
  type LinkInput,
  type MonthRow,
  type PaymentCreate,
  type PaymentSet,
  type SourceRow,
  TITHING_PERCENT,
  type TithingStatus,
} from "../../shared/tithing";
import {
  createCategory,
  createTransaction,
  requireAccount,
  requireTransaction,
} from "../money/money.service";
import { moneyAccounts, moneyBooks, moneyCategories, moneyTransactions } from "../money/schema";
import { tithingIncome, tithingLinks, tithingPayments } from "./schema";
import { inBatches, incomeFacts, type TithingSubject } from "./transactionLinks";

export type IncomeRowJson = {
  id: number;
  date: string;
  payee: string;
  amountCents: number;
  account: { id: number; name: string };
  book: { id: number; name: string };
  source: string;
  applies: boolean;
  baseCents: number;
  /** What it's tithed on without a choice: the amount, or a sale's profit. */
  defaultBaseCents: number;
  customBase: boolean;
  owedCents: number;
  paidCents: number;
  /** Null when tithing doesn't apply. */
  status: TithingStatus | null;
};

export type PaymentRowJson = {
  /** The id of its money-out transaction. */
  id: number;
  date: string;
  payee: string;
  memo: string;
  amountCents: number;
  fund: Fund;
  account: { id: number; name: string };
  /** How much of it is linked to income. Tithing only. */
  linkedCents: number;
  links: Array<{
    incomeTransactionId: number;
    /** How much of this payment pays for that income. */
    amountCents: number;
    date: string;
    payee: string;
    /** What that income owes in all, and what every payment has covered of it. */
    owedCents: number;
    paidCents: number;
  }>;
};

export type SuggestionJson = {
  id: number;
  date: string;
  payee: string;
  amountCents: number;
  account: { id: number; name: string };
};

export type Overview = {
  year: number;
  /** Years with income or payments, newest first. Always includes the one asked for. */
  years: number[];
  percent: number;
  summary: {
    /** Tithing still unpaid on income of every year: what the red rows add up to. */
    unpaidCents: number;
    /** Income with tithing left to pay, of every year. */
    unpaidCount: number;
    /** Tithing owed on the year's income, and what tithing payments that year came to. */
    owedYearCents: number;
    paidYearCents: number;
    /** Other donations given that year. */
    fastOfferingYearCents: number;
    otherYearCents: number;
    /** Tithing payments not yet linked to income, of every year. */
    unlinkedCents: number;
    /** All money in that year (not transfers), what's tithed on, and what's exempt. */
    incomeYearCents: number;
    tithableYearCents: number;
    exemptYearCents: number;
    /** Every tithing owed minus every tithing payment, ever. Negative when ahead. */
    balanceCents: number;
  };
  /** Income of the year, newest first, exempt ones included. */
  income: IncomeRowJson[];
  /** Income of every year with tithing left to pay, oldest first. */
  open: IncomeRowJson[];
  /** Donations of the year, newest first. */
  payments: PaymentRowJson[];
  /** Tithing payments of every year with some left to link, newest first. */
  unlinkedPayments: PaymentRowJson[];
  months: MonthRow[];
  sources: SourceRow[];
  /** Bank lines that look like donations and aren't marked yet. */
  suggestions: SuggestionJson[];
};

const CATEGORY_NAME = "Tithing and offerings";

/** Words in a bank line that suggest a donation. */
const LOOKS_LIKE_DONATION =
  /\b(tith(?:ing|e|es)|fast offerings?|church of jesus christ|churchofjesuschrist|latter[- ]day|lds|ldsc|ldschurch)\b/i;

const accountNames = (db: Queryable) =>
  new Map(
    db
      .select({
        id: moneyAccounts.id,
        name: moneyAccounts.name,
        bookId: moneyBooks.id,
        bookName: moneyBooks.name,
      })
      .from(moneyAccounts)
      .innerJoin(moneyBooks, eq(moneyBooks.id, moneyAccounts.bookId))
      .all()
      .map((row) => [row.id, row]),
  );

/** A money-in transaction tithing can apply to, or a message about why not. */
function requireIncome(db: Queryable, id: number) {
  const row = requireTransaction(db, id);
  if (row.transferPeerId !== null) {
    throw badRequest("A transfer between accounts isn't income, so tithing doesn't apply to it.");
  }
  if (row.amountCents <= 0) {
    throw badRequest("Tithing applies to money coming in. This transaction is money going out.");
  }
  return row;
}

/** A money-out transaction that can be a donation, or a message about why not. */
function requirePaymentTransaction(db: Queryable, id: number) {
  const row = requireTransaction(db, id);
  if (row.transferPeerId !== null) {
    throw badRequest("A transfer between accounts isn't a donation.");
  }
  if (row.amountCents >= 0) {
    throw badRequest("A donation is money going out. This transaction is money coming in.");
  }
  return row;
}

/**
 * Records whether tithing applies to money in, and the amount it's figured on. Going
 * back to what Hub would do without a choice removes the choice. Income that stops
 * owing tithing loses the payments linked to it, which free up to link elsewhere.
 */
export function setIncome(db: Queryable, id: number, input: IncomeSet): void {
  db.transaction((tx) => {
    const row = requireIncome(tx, id);
    const base = input.applies ? (input.baseCents ?? null) : null;
    const defaultBase = incomeFacts(tx, [row]).get(id)?.defaultBaseCents ?? row.amountCents;
    // Without a row the default holds, so a choice matching it needs no row.
    const dropChoice =
      input.applies === defaultApplies(tx, row) && (base === null || base === defaultBase);
    if (dropChoice) {
      tx.delete(tithingIncome).where(eq(tithingIncome.transactionId, id)).run();
    } else {
      tx.insert(tithingIncome)
        .values({ transactionId: id, applies: input.applies, baseCents: base })
        .onConflictDoUpdate({
          target: tithingIncome.transactionId,
          set: { applies: input.applies, baseCents: base, updatedAt: new Date() },
        })
        .run();
    }
    if (!input.applies) {
      tx.delete(tithingLinks).where(eq(tithingLinks.incomeTransactionId, id)).run();
    }
  });
}

/** Whether tithing applies by default: not money back into a spending category. */
function defaultApplies(db: Queryable, row: TithingSubject): boolean {
  if (row.categoryId === null) return true;
  const category = db
    .select({ kind: moneyCategories.kind })
    .from(moneyCategories)
    .where(eq(moneyCategories.id, row.categoryId))
    .get();
  return category?.kind !== "expense";
}

/**
 * Checks and replaces the income a payment pays for. Each link must be to money in
 * that owes tithing, for no more than is still owed after other payments, and the
 * links together can't be more than the payment.
 */
function replaceLinks(
  db: Queryable,
  paymentId: number,
  paymentCents: number,
  links: readonly LinkInput[],
): void {
  const ids = links.map((link) => link.incomeTransactionId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest("Each income can be linked once to a payment. Combine the amounts.");
  }
  const total = links.reduce((sum, link) => sum + link.amountCents, 0);
  if (total > paymentCents) {
    throw badRequest("Those links add up to more than the payment. Lower an amount.");
  }
  db.delete(tithingLinks).where(eq(tithingLinks.paymentTransactionId, paymentId)).run();
  if (links.length === 0) return;
  const rows = inBatches(ids, (batch) =>
    db.select().from(moneyTransactions).where(inArray(moneyTransactions.id, batch)).all(),
  );
  const facts = incomeFacts(db, rows);
  for (const link of links) {
    const fact = facts.get(link.incomeTransactionId);
    if (!fact) {
      throw badRequest("One of the linked income transactions isn't money in anymore. Remove it.");
    }
    if (!fact.applies) {
      throw badRequest("Tithing doesn't apply to one of those. Turn it on there, or remove it.");
    }
    if (fact.paidCents + link.amountCents > fact.owedCents) {
      throw badRequest(
        "One link is more than that income still owes. Lower its amount or pick another payment.",
      );
    }
  }
  db.insert(tithingLinks)
    .values(links.map((link) => ({ paymentTransactionId: paymentId, ...link })))
    .run();
}

/** Marks a money-out transaction as a donation and sets which income it pays for. */
export function setPayment(db: Queryable, id: number, input: PaymentSet): void {
  db.transaction((tx) => {
    const row = requirePaymentTransaction(tx, id);
    const links = input.links ?? [];
    if (input.fund !== "tithing" && links.length > 0) {
      throw badRequest("Only tithing is linked to income. Remove the links or pick Tithing.");
    }
    tx.insert(tithingPayments)
      .values({ transactionId: id, fund: input.fund })
      .onConflictDoUpdate({
        target: tithingPayments.transactionId,
        set: { fund: input.fund, updatedAt: new Date() },
      })
      .run();
    replaceLinks(tx, id, -row.amountCents, links);
  });
}

/**
 * Marks a money-out transaction as a donation to a fund, or (null) takes the mark off.
 * Income it was matched to stays matched while it's still tithing.
 */
export function setDonation(db: Queryable, id: number, fund: Fund | null): void {
  db.transaction((tx) => {
    if (fund === null) {
      clearPayment(tx, id);
      return;
    }
    requirePaymentTransaction(tx, id);
    tx.insert(tithingPayments)
      .values({ transactionId: id, fund })
      .onConflictDoUpdate({
        target: tithingPayments.transactionId,
        set: { fund, updatedAt: new Date() },
      })
      .run();
    if (fund !== "tithing") {
      tx.delete(tithingLinks).where(eq(tithingLinks.paymentTransactionId, id)).run();
    }
  });
}

/** Takes the donation mark off a transaction. It stays as an ordinary one. */
export function clearPayment(db: Queryable, id: number): void {
  db.transaction((tx) => {
    requireTransaction(tx, id);
    tx.delete(tithingPayments).where(eq(tithingPayments.transactionId, id)).run();
    tx.delete(tithingLinks).where(eq(tithingLinks.paymentTransactionId, id)).run();
  });
}

/** The book's category for donations, made the first time one is needed. */
function donationCategory(db: Queryable, bookId: number): number {
  const found = db
    .select({ id: moneyCategories.id })
    .from(moneyCategories)
    .where(
      and(
        eq(moneyCategories.bookId, bookId),
        eq(moneyCategories.kind, "expense"),
        sql`lower(${moneyCategories.name}) = lower(${CATEGORY_NAME})`,
      ),
    )
    .get();
  if (found) return found.id;
  const taken = db
    .select({ id: moneyCategories.id })
    .from(moneyCategories)
    .where(
      and(
        eq(moneyCategories.bookId, bookId),
        sql`lower(${moneyCategories.name}) = lower(${CATEGORY_NAME})`,
      ),
    )
    .get();
  // An income category with that name is unlikely; if so, use a different name.
  return createCategory(db, {
    bookId,
    name: taken ? `${CATEGORY_NAME} (spending)` : CATEGORY_NAME,
    kind: "expense",
  }).id;
}

/** Adds a donation as a money-out transaction in a Tithing and offerings category. */
export function createPayment(db: Db, input: PaymentCreate): { id: number } {
  return db.transaction((tx) => addPayment(tx, input));
}

/** Like createPayment, inside a transaction already open. */
export function addPayment(
  tx: Queryable,
  input: {
    accountId: number;
    date: string;
    amountCents: number;
    fund?: Fund;
    memo?: string;
    links?: LinkInput[];
  },
): { id: number } {
  const fund = input.fund ?? "tithing";
  const links = input.links ?? [];
  if (fund !== "tithing" && links.length > 0) {
    throw badRequest("Only tithing is linked to income. Remove the links or pick Tithing.");
  }
  const account = requireAccount(tx, input.accountId, "body");
  const created = createTransaction(tx, {
    accountId: account.id,
    date: input.date,
    amountCents: -input.amountCents,
    payee: FUND_LABELS[fund],
    memo: input.memo ?? "",
    categoryId: donationCategory(tx, account.bookId),
  });
  tx.insert(tithingPayments).values({ transactionId: created.id, fund }).run();
  replaceLinks(tx, created.id, input.amountCents, links);
  return { id: created.id };
}

/** Bank lines that look like donations and haven't been marked, newest first. */
function suggestions(db: Queryable, accounts: ReturnType<typeof accountNames>): SuggestionJson[] {
  const marked = new Set(
    db
      .select({ id: tithingPayments.transactionId })
      .from(tithingPayments)
      .all()
      .map((row) => row.id),
  );
  return db
    .select()
    .from(moneyTransactions)
    .where(and(lt(moneyTransactions.amountCents, 0), isNull(moneyTransactions.transferPeerId)))
    .orderBy(desc(moneyTransactions.date), desc(moneyTransactions.id))
    .all()
    .filter(
      (row) =>
        !marked.has(row.id) &&
        LOOKS_LIKE_DONATION.test(`${row.payee} ${row.bankPayee ?? ""} ${row.memo}`),
    )
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      date: row.date,
      payee: row.payee,
      amountCents: -row.amountCents,
      account: { id: row.accountId, name: accounts.get(row.accountId)?.name ?? "" },
    }));
}

const monthOf = (date: string) => date.slice(0, 7);

/**
 * Everything the Tithing page shows for a year: what's owed and paid, income and
 * donations, the unpaid income of every year, and the chart data.
 */
export function overview(
  db: Queryable,
  requestedYear: number | undefined,
  now = new Date(),
): Overview {
  const accounts = accountNames(db);
  const transactions = db
    .select()
    .from(moneyTransactions)
    .orderBy(asc(moneyTransactions.date), asc(moneyTransactions.id))
    .all();
  const facts = incomeFacts(db, transactions);
  const payments = new Map(
    db
      .select()
      .from(tithingPayments)
      .all()
      .map((row) => [row.transactionId, row.fund]),
  );
  const links = db.select().from(tithingLinks).all();
  const linksByPayment = new Map<
    number,
    Array<{ incomeTransactionId: number; amountCents: number }>
  >();
  for (const link of links) {
    const list = linksByPayment.get(link.paymentTransactionId) ?? [];
    list.push({ incomeTransactionId: link.incomeTransactionId, amountCents: link.amountCents });
    linksByPayment.set(link.paymentTransactionId, list);
  }

  const incomeRows: IncomeRowJson[] = [];
  for (const row of transactions) {
    const fact = facts.get(row.id);
    if (!fact) continue;
    const account = accounts.get(row.accountId);
    incomeRows.push({
      id: row.id,
      date: row.date,
      payee: row.payee,
      amountCents: row.amountCents,
      account: { id: row.accountId, name: account?.name ?? "" },
      book: { id: account?.bookId ?? 0, name: account?.bookName ?? "" },
      source: fact.source,
      applies: fact.applies,
      baseCents: fact.baseCents,
      defaultBaseCents: fact.defaultBaseCents,
      customBase: fact.customBase,
      owedCents: fact.owedCents,
      paidCents: fact.paidCents,
      status: fact.status,
    });
  }
  const incomeById = new Map(incomeRows.map((row) => [row.id, row]));
  const paymentRows: PaymentRowJson[] = [];
  for (const row of transactions) {
    const fund = payments.get(row.id);
    if (fund === undefined || row.amountCents >= 0 || row.transferPeerId !== null) continue;
    const mine = (linksByPayment.get(row.id) ?? []).flatMap((link) => {
      const income = incomeById.get(link.incomeTransactionId);
      return income
        ? [
            {
              incomeTransactionId: link.incomeTransactionId,
              amountCents: link.amountCents,
              date: income.date,
              payee: income.payee,
              owedCents: income.owedCents,
              paidCents: income.paidCents,
            },
          ]
        : [];
    });
    paymentRows.push({
      id: row.id,
      date: row.date,
      payee: row.payee,
      memo: row.memo,
      amountCents: -row.amountCents,
      fund,
      account: { id: row.accountId, name: accounts.get(row.accountId)?.name ?? "" },
      linkedCents: mine.reduce((sum, link) => sum + link.amountCents, 0),
      links: mine,
    });
  }

  const thisYear = now.getUTCFullYear();
  const yearSet = new Set(
    [...incomeRows, ...paymentRows].map((row) => Number(row.date.slice(0, 4))),
  );
  const year =
    requestedYear ??
    (yearSet.has(thisYear) || yearSet.size === 0 ? thisYear : Math.max(...yearSet));
  yearSet.add(year);
  const inYear = (date: string) => date.startsWith(`${year}-`);

  const tithingPaid = paymentRows.filter((row) => row.fund === "tithing");
  const yearIncome = incomeRows.filter((row) => inYear(row.date));
  const open = incomeRows.filter((row) => row.status === "unpaid" || row.status === "partial");
  const yearPayments = paymentRows.filter((row) => inYear(row.date));
  const sumFund = (fund: Fund) =>
    yearPayments.filter((row) => row.fund === fund).reduce((sum, row) => sum + row.amountCents, 0);
  const allOwed = incomeRows.reduce((sum, row) => sum + row.owedCents, 0);
  const allPaid = tithingPaid.reduce((sum, row) => sum + row.amountCents, 0);

  // Month by month: owed and paid in it, and what was still owed at its end.
  const months: MonthRow[] = [];
  let owedBefore = incomeRows
    .filter((row) => row.date < `${year}-01`)
    .reduce((s, r) => s + r.owedCents, 0);
  let paidBefore = tithingPaid
    .filter((row) => row.date < `${year}-01`)
    .reduce((s, r) => s + r.amountCents, 0);
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const owedCents = incomeRows
      .filter((row) => monthOf(row.date) === key)
      .reduce((s, r) => s + r.owedCents, 0);
    const paidCents = tithingPaid
      .filter((row) => monthOf(row.date) === key)
      .reduce((s, r) => s + r.amountCents, 0);
    owedBefore += owedCents;
    paidBefore += paidCents;
    months.push({ month: key, owedCents, paidCents, balanceCents: owedBefore - paidBefore });
  }

  const bySource = new Map<string, SourceRow>();
  for (const row of yearIncome) {
    const entry = bySource.get(row.source) ?? {
      source: row.source,
      incomeCents: 0,
      tithableCents: 0,
    };
    entry.incomeCents += row.amountCents;
    entry.tithableCents += row.applies ? row.baseCents : 0;
    bySource.set(row.source, entry);
  }

  return {
    year,
    years: [...yearSet].sort((a, b) => b - a),
    percent: TITHING_PERCENT,
    summary: {
      unpaidCents: open.reduce((sum, row) => sum + row.owedCents - row.paidCents, 0),
      unpaidCount: open.length,
      owedYearCents: yearIncome.reduce((sum, row) => sum + row.owedCents, 0),
      paidYearCents: sumFund("tithing"),
      fastOfferingYearCents: sumFund("fast_offering"),
      otherYearCents: sumFund("other"),
      unlinkedCents: tithingPaid.reduce((sum, row) => sum + row.amountCents - row.linkedCents, 0),
      incomeYearCents: yearIncome.reduce((sum, row) => sum + row.amountCents, 0),
      tithableYearCents: yearIncome.reduce(
        (sum, row) => sum + (row.applies ? row.baseCents : 0),
        0,
      ),
      exemptYearCents: yearIncome.reduce(
        (sum, row) => sum + (row.applies ? 0 : row.amountCents),
        0,
      ),
      balanceCents: allOwed - allPaid,
    },
    income: yearIncome.reverse(),
    open,
    payments: yearPayments.reverse(),
    unlinkedPayments: tithingPaid.filter((row) => row.amountCents > row.linkedCents).reverse(),
    months,
    sources: [...bySource.values()].sort(
      (a, b) => b.tithableCents - a.tithableCents || b.incomeCents - a.incomeCents,
    ),
    suggestions: suggestions(db, accounts),
  };
}
