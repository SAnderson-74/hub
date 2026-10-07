import { and, eq, gt, gte, isNull, lte } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { addDays } from "../../shared/recurrence";
import {
  type Fund,
  readTithing,
  type TithingImportInput,
  tithingDocumentSchema,
} from "../../shared/tithing";
import { requireAccount } from "../money/money.service";
import { moneyAccounts, moneyTransactions } from "../money/schema";
import { tithingPayments } from "./schema";
import { addPayment, setIncome } from "./tithing.service";
import { incomeFacts } from "./transactionLinks";

export type ImportMatch = { id: number; date: string; account: string };

export type PaymentOutcome = "create" | "mark" | "duplicate" | "skipped" | "problem";
export type IncomeOutcome = "set" | "unchanged" | "unmatched" | "skipped" | "problem";

export type TithingImportResult = {
  payments: Array<{
    row: number;
    date: string | null;
    amountCents: number | null;
    fund: Fund;
    note: string;
    outcome: PaymentOutcome;
    problems: string[];
    match: ImportMatch | null;
  }>;
  income: Array<{
    row: number;
    date: string | null;
    source: string;
    depositCents: number | null;
    baseCents: number | null;
    outcome: IncomeOutcome;
    problems: string[];
    match: ImportMatch | null;
  }>;
  /** Donations added as new transactions, marked on bank lines already there, and income set. */
  created: number;
  marked: number;
  set: number;
};

/** A donation's bank line posts a few days after the day it was given; a paycheck lands near its date. */
const PAYMENT_DAYS = { before: 2, after: 7 };
const INCOME_DAYS = { before: 2, after: 4 };

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * Adds donations and sets the tithing base on paychecks from a pasted
 * `hub-tithing/v1` document. A donation is matched to a bank line of the same amount
 * within a few days, which then becomes the donation, so it isn't counted twice; it
 * is added as a new transaction only when there's none. A donation already marked
 * counts as done, so pasting again changes nothing. A paycheck is matched to the
 * deposit of the same amount, whose tithing base becomes its gross pay. A dry run says
 * what would happen and changes nothing.
 */
export function importTithing(db: Db, input: TithingImportInput, dryRun: boolean) {
  return db.transaction((tx): TithingImportResult => {
    const accountId = input.accountId;
    requireAccount(tx, accountId, "body");
    const document = tithingDocumentSchema.parse(input.document);
    const read = readTithing(document);
    const skipPayments = new Set(input.skipPayments ?? []);
    const skipIncome = new Set(input.skipIncome ?? []);
    const accounts = new Map(
      tx
        .select({ id: moneyAccounts.id, name: moneyAccounts.name })
        .from(moneyAccounts)
        .all()
        .map((row) => [row.id, row.name]),
    );
    const marked = new Map(
      tx
        .select()
        .from(tithingPayments)
        .all()
        .map((row) => [row.transactionId, row.fund]),
    );
    const matchOf = (row: { id: number; date: string; accountId: number }): ImportMatch => ({
      id: row.id,
      date: row.date,
      account: accounts.get(row.accountId) ?? "",
    });
    const nearest = <T extends { date: string }>(rows: T[], date: string): T | undefined =>
      [...rows].sort(
        (a, b) =>
          Math.abs(dayNumber(a.date) - dayNumber(date)) -
            Math.abs(dayNumber(b.date) - dayNumber(date)) || a.date.localeCompare(b.date),
      )[0];

    const used = new Set<number>();
    const toMark: Array<{ id: number; fund: Fund }> = [];
    const toCreate: Array<{ date: string; amountCents: number; fund: Fund; memo: string }> = [];
    const payments = read.payments.map(
      (payment, index): TithingImportResult["payments"][number] => {
        const base = {
          row: index + 1,
          date: payment.date,
          amountCents: payment.amountCents,
          fund: payment.fund,
          note: payment.note,
          problems: payment.problems,
          match: null,
        };
        if (skipPayments.has(index)) return { ...base, outcome: "skipped" };
        if (payment.problems.length > 0 || !payment.date || !payment.amountCents) {
          return { ...base, outcome: "problem" };
        }
        const candidates = tx
          .select()
          .from(moneyTransactions)
          .where(
            and(
              eq(moneyTransactions.amountCents, -payment.amountCents),
              isNull(moneyTransactions.transferPeerId),
              gte(moneyTransactions.date, addDays(payment.date, -PAYMENT_DAYS.before)),
              lte(moneyTransactions.date, addDays(payment.date, PAYMENT_DAYS.after)),
            ),
          )
          .all()
          .filter((row) => !used.has(row.id));
        const already = nearest(
          candidates.filter((row) => marked.has(row.id)),
          payment.date,
        );
        if (already) {
          used.add(already.id);
          return { ...base, outcome: "duplicate", match: matchOf(already) };
        }
        const line = nearest(candidates, payment.date);
        if (line) {
          used.add(line.id);
          toMark.push({ id: line.id, fund: payment.fund });
          return { ...base, outcome: "mark", match: matchOf(line) };
        }
        toCreate.push({
          date: payment.date,
          amountCents: payment.amountCents,
          fund: payment.fund,
          memo: payment.note,
        });
        return { ...base, outcome: "create" };
      },
    );

    const toSet: Array<{ id: number; baseCents: number }> = [];
    const income = read.income.map((row, index): TithingImportResult["income"][number] => {
      const base = {
        row: index + 1,
        date: row.date,
        source: row.source,
        depositCents: row.depositCents,
        baseCents: row.baseCents,
        problems: row.problems,
        match: null,
      };
      if (skipIncome.has(index)) return { ...base, outcome: "skipped" };
      if (row.problems.length > 0 || !row.date || !row.depositCents || row.baseCents === null) {
        return { ...base, outcome: "problem" };
      }
      const candidates = tx
        .select()
        .from(moneyTransactions)
        .where(
          and(
            eq(moneyTransactions.amountCents, row.depositCents),
            isNull(moneyTransactions.transferPeerId),
            gt(moneyTransactions.amountCents, 0),
            gte(moneyTransactions.date, addDays(row.date, -INCOME_DAYS.before)),
            lte(moneyTransactions.date, addDays(row.date, INCOME_DAYS.after)),
          ),
        )
        .all()
        .filter((line) => !used.has(line.id));
      const deposit = nearest(candidates, row.date);
      if (!deposit) return { ...base, outcome: "unmatched" };
      used.add(deposit.id);
      const facts = incomeFacts(tx, [deposit]).get(deposit.id);
      const unchanged = facts?.applies === true && facts.baseCents === row.baseCents;
      if (!unchanged) toSet.push({ id: deposit.id, baseCents: row.baseCents });
      return { ...base, outcome: unchanged ? "unchanged" : "set", match: matchOf(deposit) };
    });

    const result: TithingImportResult = {
      payments,
      income,
      created: toCreate.length,
      marked: toMark.length,
      set: toSet.length,
    };
    if (dryRun) return result;

    for (const line of toMark) {
      tx.insert(tithingPayments)
        .values({ transactionId: line.id, fund: line.fund })
        .onConflictDoNothing()
        .run();
    }
    for (const payment of toCreate) {
      addPayment(tx as Queryable, { accountId, ...payment });
    }
    for (const entry of toSet) {
      setIncome(tx, entry.id, { applies: true, baseCents: entry.baseCents });
    }
    return result;
  });
}
