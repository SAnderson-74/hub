import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import { formatCents } from "../../shared/money";
import { MATCH_TOLERANCE_CENTS, type OwedCreate, type OwedUpdate } from "../../shared/owed";
import { addDays } from "../../shared/recurrence";
import { tithingIncome, tithingLinks } from "../tithing/schema";
import { primaryCategory, splitsOf } from "./lines";
import { requireBook, requireTransaction } from "./money.service";
import { moneyAccounts, moneyCategories, moneyReimbursements, moneyTransactions } from "./schema";

// Money owed back on spending, and matching each to the repayment that settles it.

type Brief = { id: number; date: string; payee: string; amountCents: number; account: string };

export type OwedJson = {
  id: number;
  transactionId: number;
  /** Always positive. */
  amountCents: number;
  who: string;
  original: Brief & { category: string | null };
  repayment: Brief | null;
};

export type OwedListJson = {
  open: Array<OwedJson & { candidates: Brief[] }>;
  /** What's still owed back in total. */
  openCents: number;
  /** The latest repaid, newest first. */
  repaid: OwedJson[];
};

export type TransactionOwedJson = {
  /** On spending: who owes part of it back. */
  claims: OwedJson[];
  /** On money in: what it pays back. */
  repays: OwedJson[];
  /** On money in that pays nothing back yet: open claims it might settle. */
  matches: OwedJson[];
};

type ClaimRow = typeof moneyReimbursements.$inferSelect;
type TransactionRow = typeof moneyTransactions.$inferSelect;

/** How far before and after the spending a repayment is looked for. */
const LOOK_BEFORE_DAYS = 7;
const LOOK_AFTER_DAYS = 180;
const CANDIDATES = 3;

/** Transactions with their account and category names, by id. */
function briefs(db: Queryable, ids: number[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0)
    return new Map<number, Brief & { category: string | null; bookId: number }>();
  const rows = db
    .select({
      id: moneyTransactions.id,
      date: moneyTransactions.date,
      payee: moneyTransactions.payee,
      amountCents: moneyTransactions.amountCents,
      account: moneyAccounts.name,
      bookId: moneyAccounts.bookId,
      category: moneyCategories.name,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .leftJoin(moneyCategories, eq(moneyCategories.id, moneyTransactions.categoryId))
    .where(inArray(moneyTransactions.id, unique))
    .all();
  return new Map(rows.map((row) => [row.id, row]));
}

function toJson(rows: readonly ClaimRow[], db: Queryable): OwedJson[] {
  const found = briefs(
    db,
    rows.flatMap((row) =>
      row.repaymentId === null ? [row.transactionId] : [row.transactionId, row.repaymentId],
    ),
  );
  return rows.flatMap((row) => {
    const original = found.get(row.transactionId);
    if (!original) return [];
    const repayment = row.repaymentId === null ? undefined : found.get(row.repaymentId);
    const { bookId: _, ...rest } = original;
    return [
      {
        id: row.id,
        transactionId: row.transactionId,
        amountCents: row.amountCents,
        who: row.who,
        original: rest,
        repayment: repayment
          ? {
              id: repayment.id,
              date: repayment.date,
              payee: repayment.payee,
              amountCents: repayment.amountCents,
              account: repayment.account,
            }
          : null,
      },
    ];
  });
}

/** The book a transaction's account is in. */
function bookOf(db: Queryable, transaction: TransactionRow): number {
  const account = db
    .select({ bookId: moneyAccounts.bookId })
    .from(moneyAccounts)
    .where(eq(moneyAccounts.id, transaction.accountId))
    .get();
  return account?.bookId ?? 0;
}

function requireClaim(db: Queryable, id: number): ClaimRow {
  const row = db.select().from(moneyReimbursements).where(eq(moneyReimbursements.id, id)).get();
  if (!row) throw notFound("That isn't owed back any more. It may have been removed.");
  return row;
}

/** What the claims on a transaction add up to, leaving one out. */
function claimedOn(db: Queryable, transactionId: number, exceptId?: number): number {
  return db
    .select({ id: moneyReimbursements.id, amountCents: moneyReimbursements.amountCents })
    .from(moneyReimbursements)
    .where(eq(moneyReimbursements.transactionId, transactionId))
    .all()
    .filter((row) => row.id !== exceptId)
    .reduce((sum, row) => sum + row.amountCents, 0);
}

/** What a repayment already pays back, leaving one claim out. */
function repaidBy(db: Queryable, repaymentId: number, exceptId?: number): number {
  return db
    .select({ id: moneyReimbursements.id, amountCents: moneyReimbursements.amountCents })
    .from(moneyReimbursements)
    .where(eq(moneyReimbursements.repaymentId, repaymentId))
    .all()
    .filter((row) => row.id !== exceptId)
    .reduce((sum, row) => sum + row.amountCents, 0);
}

function checkSpending(transaction: TransactionRow) {
  if (transaction.amountCents >= 0 || transaction.transferPeerId !== null) {
    throw badRequest("Only spending can be owed back. Pick money out that isn't a transfer.");
  }
}

function checkAmount(
  db: Queryable,
  transaction: TransactionRow,
  amountCents: number,
  exceptId?: number,
) {
  const room = -transaction.amountCents - claimedOn(db, transaction.id, exceptId);
  if (amountCents > room) {
    throw badRequest(
      `That's more than the ${formatCents(room)} of this transaction not already owed back. Use a smaller amount.`,
    );
  }
}

export function createOwed(db: Queryable, input: OwedCreate): OwedJson {
  return db.transaction((tx) => {
    const transaction = requireTransaction(tx, input.transactionId);
    checkSpending(transaction);
    checkAmount(tx, transaction, input.amountCents);
    const row = tx
      .insert(moneyReimbursements)
      .values({
        transactionId: transaction.id,
        amountCents: input.amountCents,
        who: (input.who ?? "").trim(),
      })
      .returning()
      .get();
    return toJson([row], tx)[0] as OwedJson;
  });
}

export function updateOwed(db: Queryable, id: number, patch: OwedUpdate): OwedJson {
  return db.transaction((tx) => {
    const current = requireClaim(tx, id);
    if (patch.amountCents !== undefined) {
      checkAmount(tx, requireTransaction(tx, current.transactionId), patch.amountCents, id);
      if (current.repaymentId !== null) {
        const repayment = requireTransaction(tx, current.repaymentId);
        if (repaidBy(tx, repayment.id, id) + patch.amountCents > repayment.amountCents) {
          throw badRequest(
            "That's more than its repayment brought in. Unmatch the repayment first, or use a smaller amount.",
          );
        }
      }
    }
    const row = tx
      .update(moneyReimbursements)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(moneyReimbursements.id, id))
      .returning()
      .get();
    return toJson([row], tx)[0] as OwedJson;
  });
}

export function deleteOwed(db: Queryable, id: number): void {
  requireClaim(db, id);
  db.delete(moneyReimbursements).where(eq(moneyReimbursements.id, id)).run();
}

/**
 * Matches a claim to the money in that pays it back. The repayment takes the original's
 * category, so it counts as a refund there, and any tithing choice on it goes: money
 * paid back isn't income.
 */
export function matchRepayment(db: Queryable, id: number, repaymentId: number): OwedJson {
  return db.transaction((tx) => {
    const claim = requireClaim(tx, id);
    const original = requireTransaction(tx, claim.transactionId);
    const repayment = tx
      .select()
      .from(moneyTransactions)
      .where(eq(moneyTransactions.id, repaymentId))
      .get();
    if (!repayment) throw badRequest("That repayment doesn't exist. It may have been deleted.");
    if (repayment.amountCents <= 0 || repayment.transferPeerId !== null) {
      throw badRequest("A repayment is money in that isn't a transfer. Pick another transaction.");
    }
    if (bookOf(tx, repayment) !== bookOf(tx, original)) {
      throw badRequest("That repayment is in another book. Pick one from this book.");
    }
    if (splitsOf(tx, [repayment.id]).has(repayment.id)) {
      throw badRequest("That repayment is split into categories. Put it in one category first.");
    }
    if (repaidBy(tx, repayment.id, id) + claim.amountCents > repayment.amountCents) {
      throw badRequest(
        "That's more than the repayment brought in. Lower what's owed, or pick another payment.",
      );
    }
    const linked = tx
      .select({ n: sql<number>`count(*)` })
      .from(tithingLinks)
      .where(eq(tithingLinks.incomeTransactionId, repayment.id))
      .get();
    if ((linked?.n ?? 0) > 0) {
      throw conflict(
        "Tithing was paid on that money. Unlink the tithing payment on Tithing first, then match it.",
      );
    }
    const parts = splitsOf(tx, [original.id]).get(original.id);
    const categoryId = parts ? primaryCategory(parts) : original.categoryId;
    tx.update(moneyTransactions)
      .set({ categoryId, updatedAt: new Date() })
      .where(eq(moneyTransactions.id, repayment.id))
      .run();
    tx.delete(tithingIncome).where(eq(tithingIncome.transactionId, repayment.id)).run();
    const row = tx
      .update(moneyReimbursements)
      .set({ repaymentId: repayment.id, updatedAt: new Date() })
      .where(eq(moneyReimbursements.id, id))
      .returning()
      .get();
    return toJson([row], tx)[0] as OwedJson;
  });
}

/** Takes the match away. The repayment keeps its category; change it on the transaction. */
export function unmatchRepayment(db: Queryable, id: number): OwedJson {
  requireClaim(db, id);
  const row = db
    .update(moneyReimbursements)
    .set({ repaymentId: null, updatedAt: new Date() })
    .where(eq(moneyReimbursements.id, id))
    .returning()
    .get();
  return toJson([row], db)[0] as OwedJson;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);

/** Whether a transaction names the person: any word of theirs in its payee, memo, or counterparty. */
function names(row: { payee: string; memo: string; counterparty: string | null }, who: string) {
  const theirs = words(who);
  if (theirs.length === 0) return false;
  const text = new Set(words(`${row.payee} ${row.memo} ${row.counterparty ?? ""}`));
  return theirs.some((word) => text.has(word));
}

/** Money in within the window around each claim's spending that could pay it back, likeliest first. */
function candidatesFor(
  db: Queryable,
  bookId: number,
  claims: ReadonlyArray<ClaimRow & { date: string }>,
): Map<number, Brief[]> {
  const result = new Map<number, Brief[]>();
  if (claims.length === 0) return result;
  const from = addDays(
    claims.reduce((low, row) => (row.date < low ? row.date : low), claims[0]?.date ?? ""),
    -LOOK_BEFORE_DAYS,
  );
  const to = addDays(
    claims.reduce((high, row) => (row.date > high ? row.date : high), ""),
    LOOK_AFTER_DAYS,
  );
  const incoming = db
    .select({
      id: moneyTransactions.id,
      date: moneyTransactions.date,
      payee: moneyTransactions.payee,
      memo: moneyTransactions.memo,
      counterparty: moneyTransactions.counterparty,
      amountCents: moneyTransactions.amountCents,
      account: moneyAccounts.name,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        isNull(moneyTransactions.transferPeerId),
        sql`${moneyTransactions.amountCents} > 0`,
        gte(moneyTransactions.date, from),
        lte(moneyTransactions.date, to),
      ),
    )
    .all();
  const used = new Map<number, number>();
  for (const row of db
    .select({ id: moneyReimbursements.repaymentId, amountCents: moneyReimbursements.amountCents })
    .from(moneyReimbursements)
    .where(isNotNull(moneyReimbursements.repaymentId))
    .all()) {
    if (row.id !== null) used.set(row.id, (used.get(row.id) ?? 0) + row.amountCents);
  }
  const split = splitsOf(
    db,
    incoming.map((row) => row.id),
  );
  for (const claim of claims) {
    const earliest = addDays(claim.date, -LOOK_BEFORE_DAYS);
    const latest = addDays(claim.date, LOOK_AFTER_DAYS);
    const scored = incoming
      .filter((row) => row.date >= earliest && row.date <= latest && !split.has(row.id))
      .map((row) => {
        const room = row.amountCents - (used.get(row.id) ?? 0);
        const close = Math.abs(room - claim.amountCents) <= MATCH_TOLERANCE_CENTS;
        const named = names(row, claim.who) && room >= claim.amountCents;
        return { row, close, named, room };
      })
      .filter((entry) => entry.room >= claim.amountCents && (entry.close || entry.named))
      .sort(
        (a, b) =>
          Number(b.named) - Number(a.named) ||
          Math.abs(a.room - claim.amountCents) - Math.abs(b.room - claim.amountCents) ||
          Math.abs(Date.parse(a.row.date) - Date.parse(claim.date)) -
            Math.abs(Date.parse(b.row.date) - Date.parse(claim.date)),
      )
      .slice(0, CANDIDATES)
      .map(({ row }) => ({
        id: row.id,
        date: row.date,
        payee: row.payee,
        amountCents: row.amountCents,
        account: row.account,
      }));
    result.set(claim.id, scored);
  }
  return result;
}

/** Claims in a book: those you're still owed with likely repayments, and the latest repaid. */
export function listOwed(db: Queryable, bookId: number): OwedListJson {
  requireBook(db, bookId);
  const rows = db
    .select({ claim: moneyReimbursements, date: moneyTransactions.date })
    .from(moneyReimbursements)
    .innerJoin(moneyTransactions, eq(moneyTransactions.id, moneyReimbursements.transactionId))
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(eq(moneyAccounts.bookId, bookId))
    .orderBy(desc(moneyTransactions.date), desc(moneyReimbursements.id))
    .all();
  const open = rows.filter((row) => row.claim.repaymentId === null);
  const candidates = candidatesFor(
    db,
    bookId,
    open.map((row) => ({ ...row.claim, date: row.date })),
  );
  const openJson = toJson(
    open.map((row) => row.claim),
    db,
  ).map((claim) => ({ ...claim, candidates: candidates.get(claim.id) ?? [] }));
  const repaid = toJson(
    rows.filter((row) => row.claim.repaymentId !== null).map((row) => row.claim),
    db,
  )
    .sort((a, b) => ((b.repayment?.date ?? "") > (a.repayment?.date ?? "") ? 1 : -1))
    .slice(0, 5);
  return {
    open: openJson,
    openCents: openJson.reduce((sum, claim) => sum + claim.amountCents, 0),
    repaid,
  };
}

/** What a transaction has to do with money owed back. */
export function transactionOwed(db: Queryable, transactionId: number): TransactionOwedJson {
  const transaction = requireTransaction(db, transactionId);
  const claims = toJson(
    db
      .select()
      .from(moneyReimbursements)
      .where(eq(moneyReimbursements.transactionId, transactionId))
      .all(),
    db,
  );
  const repays = toJson(
    db
      .select()
      .from(moneyReimbursements)
      .where(eq(moneyReimbursements.repaymentId, transactionId))
      .all(),
    db,
  );
  if (transaction.amountCents <= 0 || transaction.transferPeerId !== null || repays.length > 0) {
    return { claims, repays, matches: [] };
  }
  // Open claims this money in could settle: those it shows up as a likely repayment for.
  const bookId = bookOf(db, transaction);
  const open = db
    .select({ claim: moneyReimbursements, date: moneyTransactions.date })
    .from(moneyReimbursements)
    .innerJoin(moneyTransactions, eq(moneyTransactions.id, moneyReimbursements.transactionId))
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(and(eq(moneyAccounts.bookId, bookId), isNull(moneyReimbursements.repaymentId)))
    .all();
  const candidates = candidatesFor(
    db,
    bookId,
    open.map((row) => ({ ...row.claim, date: row.date })),
  );
  const fits = open
    .map((row) => row.claim)
    .filter((claim) => candidates.get(claim.id)?.some((brief) => brief.id === transactionId));
  return { claims, repays, matches: toJson(fits, db) };
}
