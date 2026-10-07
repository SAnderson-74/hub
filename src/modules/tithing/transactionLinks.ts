import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { type Fund, type TithingStatus, tithingOwed, tithingStatus } from "../../shared/tithing";
import { moneyCategories } from "../money/schema";
import { resaleCosts, resaleItems, resaleItemTransactions } from "../resale/schema";
import { tithingIncome, tithingLinks, tithingPayments } from "./schema";

// What the rest of Money needs to know about tithing: how each transaction stands, and
// clearing it away with the transaction. The figuring itself is here too, so Money and
// the Tithing page always agree.

/** The part of a transaction tithing looks at. */
export type TithingSubject = {
  id: number;
  amountCents: number;
  transferPeerId: number | null;
  categoryId: number | null;
};

export type IncomeFacts = {
  transactionId: number;
  /** Whether tithing applies: the person's choice, or the default for this transaction. */
  applies: boolean;
  /** The amount tithing is figured on, whether or not it applies. */
  baseCents: number;
  /** What the base would be without a choice: the amount, or a sale's profit. */
  defaultBaseCents: number;
  /** The person chose a different amount to tithe on. */
  customBase: boolean;
  owedCents: number;
  paidCents: number;
  /** Marked as paid without a payment in Hub (see tithing_income.settled). */
  settled: boolean;
  /** What marking it paid covers: what's owed beyond the payments linked to it. */
  settledCents: number;
  /** Null when tithing doesn't apply. */
  status: TithingStatus | null;
  /** Where it came from, for grouping: "Resale", its category's name, or "Other income". */
  source: string;
};

export type TransactionTithing =
  | ({ kind: "income" } & Omit<IncomeFacts, "transactionId" | "source">)
  | { kind: "payment"; fund: Fund; linkedCents: number };

/** Money in that tithing can apply to: not a transfer between accounts. */
export const isIncome = (row: Pick<TithingSubject, "amountCents" | "transferPeerId">) =>
  row.amountCents > 0 && row.transferPeerId === null;

/** Runs a query over ids a batch at a time, to stay under SQLite's limit on values. */
export function inBatches<T>(ids: readonly number[], run: (batch: number[]) => T[]): T[] {
  const results: T[] = [];
  for (let start = 0; start < ids.length; start += 500) {
    results.push(...run(ids.slice(start, start + 500)));
  }
  return results;
}

/**
 * How each money-in transaction stands. The default is to tithe on all of it, except
 * money back into a spending category (a refund). A sale linked to resale items is
 * tithed on its profit: what it brought in less what those items cost. A choice the
 * person made (a row in tithing_income) wins over both.
 */
export function incomeFacts(
  db: Queryable,
  rows: readonly TithingSubject[],
): Map<number, IncomeFacts> {
  const income = rows.filter(isIncome);
  const facts = new Map<number, IncomeFacts>();
  if (income.length === 0) return facts;
  const ids = income.map((row) => row.id);

  const choices = new Map(
    inBatches(ids, (batch) =>
      db.select().from(tithingIncome).where(inArray(tithingIncome.transactionId, batch)).all(),
    ).map((row) => [row.transactionId, row]),
  );
  const categoryIds = [
    ...new Set(income.flatMap((row) => (row.categoryId === null ? [] : [row.categoryId]))),
  ];
  const categories = new Map(
    inBatches(categoryIds, (batch) =>
      db
        .select({ id: moneyCategories.id, name: moneyCategories.name, kind: moneyCategories.kind })
        .from(moneyCategories)
        .where(inArray(moneyCategories.id, batch))
        .all(),
    ).map((row) => [row.id, row]),
  );
  // What the resale items each sale brought in cost: their price and their costs.
  const costByItem = new Map(
    db
      .select({ itemId: resaleCosts.itemId, total: sql<number>`sum(${resaleCosts.amountCents})` })
      .from(resaleCosts)
      .groupBy(resaleCosts.itemId)
      .all()
      .map((row) => [row.itemId, row.total]),
  );
  const sales = new Map<number, number>();
  const sold = new Set<number>();
  for (const row of inBatches(ids, (batch) =>
    db
      .select({
        transactionId: resaleItemTransactions.transactionId,
        itemId: resaleItems.id,
        purchaseCents: resaleItems.purchaseCents,
      })
      .from(resaleItemTransactions)
      .innerJoin(resaleItems, eq(resaleItems.id, resaleItemTransactions.itemId))
      .where(
        and(
          inArray(resaleItemTransactions.transactionId, batch),
          eq(resaleItemTransactions.role, "sale"),
        ),
      )
      .all(),
  )) {
    sold.add(row.transactionId);
    sales.set(
      row.transactionId,
      (sales.get(row.transactionId) ?? 0) +
        (row.purchaseCents ?? 0) +
        (costByItem.get(row.itemId) ?? 0),
    );
  }
  const paid = new Map<number, number>();
  for (const row of inBatches(ids, (batch) =>
    db
      .select({
        incomeId: tithingLinks.incomeTransactionId,
        total: sql<number>`sum(${tithingLinks.amountCents})`,
      })
      .from(tithingLinks)
      .where(inArray(tithingLinks.incomeTransactionId, batch))
      .groupBy(tithingLinks.incomeTransactionId)
      .all(),
  )) {
    paid.set(row.incomeId, row.total);
  }

  for (const row of income) {
    const choice = choices.get(row.id);
    const category = row.categoryId === null ? undefined : categories.get(row.categoryId);
    const defaultBaseCents = sold.has(row.id)
      ? Math.max(0, row.amountCents - (sales.get(row.id) ?? 0))
      : row.amountCents;
    const applies = choice ? choice.applies : category?.kind !== "expense";
    const baseCents = choice?.baseCents ?? defaultBaseCents;
    const owedCents = applies ? tithingOwed(baseCents) : 0;
    const paidCents = paid.get(row.id) ?? 0;
    const settled = applies && choice?.settled === true;
    facts.set(row.id, {
      transactionId: row.id,
      applies,
      baseCents,
      defaultBaseCents,
      customBase: choice?.baseCents != null,
      owedCents,
      paidCents,
      settled,
      settledCents: settled ? Math.max(0, owedCents - paidCents) : 0,
      status: applies ? (settled ? "paid" : tithingStatus(owedCents, paidCents)) : null,
      source: sold.has(row.id) ? "Resale" : (category?.name ?? "Other income"),
    });
  }
  return facts;
}

/** Tithing as each transaction's JSON shows it: its standing as income, or its fund as a payment. */
export function tithingOf(
  db: Queryable,
  rows: readonly TithingSubject[],
): Map<number, TransactionTithing> {
  const result = new Map<number, TransactionTithing>();
  for (const [id, { transactionId: _, source: __, ...facts }] of incomeFacts(db, rows)) {
    result.set(id, { kind: "income", ...facts });
  }
  const outgoing = rows.filter((row) => row.amountCents < 0 && row.transferPeerId === null);
  const ids = outgoing.map((row) => row.id);
  const linked = new Map(
    inBatches(ids, (batch) =>
      db
        .select({
          id: tithingLinks.paymentTransactionId,
          total: sql<number>`sum(${tithingLinks.amountCents})`,
        })
        .from(tithingLinks)
        .where(inArray(tithingLinks.paymentTransactionId, batch))
        .groupBy(tithingLinks.paymentTransactionId)
        .all(),
    ).map((row) => [row.id, row.total]),
  );
  for (const row of inBatches(ids, (batch) =>
    db.select().from(tithingPayments).where(inArray(tithingPayments.transactionId, batch)).all(),
  )) {
    result.set(row.transactionId, {
      kind: "payment",
      fund: row.fund,
      linkedCents: linked.get(row.transactionId) ?? 0,
    });
  }
  return result;
}

/** Clears tithing choices, payments, and links for transactions that are going. */
export function dropTithing(db: Queryable, transactionIds: readonly number[]): void {
  for (let start = 0; start < transactionIds.length; start += 500) {
    const batch = transactionIds.slice(start, start + 500);
    db.delete(tithingIncome).where(inArray(tithingIncome.transactionId, batch)).run();
    db.delete(tithingPayments).where(inArray(tithingPayments.transactionId, batch)).run();
    db.delete(tithingLinks).where(inArray(tithingLinks.paymentTransactionId, batch)).run();
    db.delete(tithingLinks).where(inArray(tithingLinks.incomeTransactionId, batch)).run();
  }
}
