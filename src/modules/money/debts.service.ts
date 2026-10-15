import { eq, inArray } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { badRequest } from "../../server/errors";
import type { AccountKind } from "../../shared/books";
import type { DebtPlanSet, DebtStrategy, DebtTerms } from "../../shared/debt";
import { listAccounts, requireAccount, requireBook } from "./money.service";
import { moneyDebtPlans, moneyDebtTerms } from "./schema";

// The book's debts (cards and loans that owe money) with the rate and minimum entered
// for each, and the plan for paying them off. The plan itself is worked out in the
// browser (src/shared/debt.ts), so changing the extra payment answers right away.

const DEBT_KINDS: readonly AccountKind[] = ["credit_card", "loan"];

export type DebtJson = {
  id: number;
  name: string;
  kind: AccountKind;
  /** What's owed, positive. */
  balanceCents: number;
  /** Null until entered. */
  aprBasisPoints: number | null;
  minimumCents: number | null;
};

export type DebtsJson = {
  debts: DebtJson[];
  plan: { strategy: DebtStrategy; extraCents: number; order: number[] };
};

export function listDebts(db: Queryable, bookId: number): DebtsJson {
  const accounts = listAccounts(db, bookId).filter(
    (account) => !account.archived && DEBT_KINDS.includes(account.kind) && account.balanceCents < 0,
  );
  const terms = new Map(
    (accounts.length === 0
      ? []
      : db
          .select()
          .from(moneyDebtTerms)
          .where(
            inArray(
              moneyDebtTerms.accountId,
              accounts.map((account) => account.id),
            ),
          )
          .all()
    ).map((row) => [row.accountId, row]),
  );
  const plan = db.select().from(moneyDebtPlans).where(eq(moneyDebtPlans.bookId, bookId)).get();
  return {
    debts: accounts.map((account) => {
      const term = terms.get(account.id);
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        balanceCents: -account.balanceCents,
        aprBasisPoints: term?.aprBasisPoints ?? null,
        minimumCents: term?.minimumCents ?? null,
      };
    }),
    plan: {
      strategy: plan?.strategy ?? "avalanche",
      extraCents: plan?.extraCents ?? 0,
      order: plan?.order ?? [],
    },
  };
}

/** Sets a card's or loan's rate and minimum payment. */
export function setDebtTerms(db: Queryable, accountId: number, input: DebtTerms): DebtsJson {
  const account = requireAccount(db, accountId);
  if (!DEBT_KINDS.includes(account.kind)) {
    throw badRequest("Rates and minimums are for credit cards and loans. Pick one of those.");
  }
  db.insert(moneyDebtTerms)
    .values({ accountId, ...input })
    .onConflictDoUpdate({
      target: moneyDebtTerms.accountId,
      set: { ...input, updatedAt: new Date() },
    })
    .run();
  return listDebts(db, account.bookId);
}

/** Saves how a book's debts are paid off. The order keeps only this book's accounts. */
export function setDebtPlan(db: Queryable, input: DebtPlanSet): DebtsJson {
  requireBook(db, input.bookId, "body");
  const own = new Set(listAccounts(db, input.bookId).map((account) => account.id));
  const order = [...new Set(input.order)].filter((id) => own.has(id));
  const values = { strategy: input.strategy, extraCents: input.extraCents, order };
  db.insert(moneyDebtPlans)
    .values({ bookId: input.bookId, ...values })
    .onConflictDoUpdate({
      target: moneyDebtPlans.bookId,
      set: { ...values, updatedAt: new Date() },
    })
    .run();
  return listDebts(db, input.bookId);
}
