import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import { type CardKind, cardKindFor } from "../../shared/cards";
import {
  earnRewards,
  type RewardKind,
  type RewardProgram,
  type RewardsSave,
  rewardsSaveSchema,
  rewardValue,
  type Spend,
} from "../../shared/rewards";
import {
  moneyAccounts,
  moneyBooks,
  moneyCardRewards,
  moneyCards,
  moneyCategories,
  moneyRewardRates,
  moneyTransactions,
} from "./schema";

export type RewardRateJson = {
  id: number;
  categoryId: number | null;
  /** The category's name, when the rate is for one. */
  categoryName: string | null;
  contains: string | null;
  rate: number;
  startsOn: string | null;
  endsOn: string | null;
  capCents: number | null;
};

export type RewardProgramJson = {
  kind: RewardKind;
  baseRate: number;
  pointValue: number;
  rates: RewardRateJson[];
};

export type RewardMonthJson = {
  month: string;
  spentCents: number;
  /** Cents of cash back, or whole points. */
  earned: number;
  valueCents: number;
};

/** What one rate earned over the year. `rateId` null is the base rate. */
export type RewardByRateJson = {
  key: string;
  rateId: number | null;
  label: string;
  rate: number;
  startsOn: string | null;
  endsOn: string | null;
  capCents: number | null;
  spentCents: number;
  earned: number;
};

export type CardRewardsJson = {
  card: {
    id: number;
    name: string;
    last4: string | null;
    kind: CardKind;
    archived: boolean;
    account: { id: number; name: string };
  };
  /** Null until the card's rewards are set up; its spending still counts. */
  program: RewardProgramJson | null;
  /** Purchases less refunds on the card in the year (transfers and income aside). */
  spentCents: number;
  earned: number;
  valueCents: number;
  /** Each month of the year, January first. */
  months: RewardMonthJson[];
  byRate: RewardByRateJson[];
};

export type RewardsReportJson = {
  year: number;
  cards: CardRewardsJson[];
  /** Across cards with rewards set up. */
  totals: { spentCents: number; valueCents: number };
};

type CardRow = typeof moneyCards.$inferSelect;

function requireCard(db: Queryable, id: number) {
  const row = db
    .select({ card: moneyCards, bookId: moneyAccounts.bookId, accountKind: moneyAccounts.kind })
    .from(moneyCards)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyCards.accountId))
    .where(eq(moneyCards.id, id))
    .get();
  if (!row) throw notFound("That card doesn't exist. It may have been deleted.");
  return row;
}

/** Card rewards programs by card id, with their rates in order. */
function programs(db: Queryable, cardIds: number[]): Map<number, RewardProgramJson> {
  if (cardIds.length === 0) return new Map();
  const rates = db
    .select({ rate: moneyRewardRates, categoryName: moneyCategories.name })
    .from(moneyRewardRates)
    .leftJoin(moneyCategories, eq(moneyCategories.id, moneyRewardRates.categoryId))
    .where(inArray(moneyRewardRates.cardId, cardIds))
    .orderBy(asc(moneyRewardRates.sortOrder), asc(moneyRewardRates.id))
    .all();
  return new Map(
    db
      .select()
      .from(moneyCardRewards)
      .where(inArray(moneyCardRewards.cardId, cardIds))
      .all()
      .map((row) => [
        row.cardId,
        {
          kind: row.kind,
          baseRate: row.baseRate,
          pointValue: row.pointValue,
          rates: rates
            .filter((entry) => entry.rate.cardId === row.cardId)
            // A rate for a deleted category has nothing to match.
            .filter((entry) => entry.rate.categoryId === null || entry.categoryName !== null)
            .map(({ rate, categoryName }) => ({
              id: rate.id,
              categoryId: rate.categoryId,
              categoryName,
              contains: rate.contains,
              rate: rate.rate,
              startsOn: rate.startsOn,
              endsOn: rate.endsOn,
              capCents: rate.capCents,
            })),
        },
      ]),
  );
}

/** A card's rewards program, or null when it isn't set up. */
export function getRewards(db: Queryable, cardId: number): RewardProgramJson | null {
  requireCard(db, cardId);
  return programs(db, [cardId]).get(cardId) ?? null;
}

/** Sets up or replaces a card's rewards program. */
export function saveRewards(db: Db, cardId: number, input: RewardsSave): RewardProgramJson {
  const program = rewardsSaveSchema.parse(input);
  return db.transaction((tx) => {
    const { bookId } = requireCard(tx, cardId);
    const categoryIds = program.rates.flatMap((rate) =>
      rate.categoryId === null ? [] : [rate.categoryId],
    );
    if (categoryIds.length > 0) {
      const found = tx
        .select({
          id: moneyCategories.id,
          bookId: moneyCategories.bookId,
          kind: moneyCategories.kind,
        })
        .from(moneyCategories)
        .where(inArray(moneyCategories.id, categoryIds))
        .all();
      for (const id of categoryIds) {
        const category = found.find((row) => row.id === id);
        if (!category || category.bookId !== bookId || category.kind !== "expense") {
          throw badRequest(
            "Bonus rates are for spending categories in this card's book. Pick one of those.",
          );
        }
      }
    }
    const now = new Date();
    tx.insert(moneyCardRewards)
      .values({
        cardId,
        kind: program.kind,
        baseRate: program.baseRate,
        pointValue: program.pointValue,
      })
      .onConflictDoUpdate({
        target: moneyCardRewards.cardId,
        set: {
          kind: program.kind,
          baseRate: program.baseRate,
          pointValue: program.pointValue,
          updatedAt: now,
        },
      })
      .run();
    tx.delete(moneyRewardRates).where(eq(moneyRewardRates.cardId, cardId)).run();
    if (program.rates.length > 0) {
      tx.insert(moneyRewardRates)
        .values(program.rates.map((rate, index) => ({ cardId, ...rate, sortOrder: index })))
        .run();
    }
    const saved = programs(tx, [cardId]).get(cardId);
    if (!saved) throw new Error("Expected the saved rewards");
    return saved;
  });
}

/** Removes cards' rewards programs and rates, for when the cards go. */
export function dropRewards(db: Queryable, cardIds: number[]): void {
  if (cardIds.length === 0) return;
  db.delete(moneyRewardRates).where(inArray(moneyRewardRates.cardId, cardIds)).run();
  db.delete(moneyCardRewards).where(inArray(moneyCardRewards.cardId, cardIds)).run();
}

/** Removes bonus rates for categories that are going. */
export function dropCategoryRates(db: Queryable, categoryIds: number[]): void {
  if (categoryIds.length === 0) return;
  db.delete(moneyRewardRates).where(inArray(moneyRewardRates.categoryId, categoryIds)).run();
}

export function deleteRewards(db: Db, cardId: number): void {
  db.transaction((tx) => {
    requireCard(tx, cardId);
    dropRewards(tx, [cardId]);
  });
}

const monthsOf = (year: number) =>
  Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);

/** A rate's name: its store text or category. The browser adds its dates and cap. */
function rateName(rate: RewardRateJson): string {
  if (rate.contains) return rate.contains;
  return rate.categoryName ?? "Category";
}

/**
 * What each of a book's cards spent and earned in a year, by month and by rate.
 * Purchases and refunds on the card count; transfers and money in to income
 * categories (like a statement credit) don't.
 */
export function rewardsReport(db: Queryable, bookId: number, year: number): RewardsReportJson {
  const book = db.select().from(moneyBooks).where(eq(moneyBooks.id, bookId)).get();
  if (!book) throw notFound("That book doesn't exist. It may have been deleted.");
  const cards = db
    .select({
      card: moneyCards,
      accountName: moneyAccounts.name,
      accountKind: moneyAccounts.kind,
    })
    .from(moneyCards)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyCards.accountId))
    .where(eq(moneyAccounts.bookId, bookId))
    .orderBy(asc(moneyCards.archived), asc(moneyAccounts.sortOrder), asc(moneyCards.id))
    .all();
  const cardIds = cards.map((row) => row.card.id);
  const programsByCard = programs(db, cardIds);
  const rows =
    cardIds.length === 0
      ? []
      : db
          .select({
            cardId: moneyTransactions.cardId,
            date: moneyTransactions.date,
            amountCents: moneyTransactions.amountCents,
            categoryId: moneyTransactions.categoryId,
            categoryKind: moneyCategories.kind,
            payee: moneyTransactions.payee,
            bankPayee: moneyTransactions.bankPayee,
          })
          .from(moneyTransactions)
          .leftJoin(moneyCategories, eq(moneyCategories.id, moneyTransactions.categoryId))
          .where(
            and(
              inArray(moneyTransactions.cardId, cardIds),
              isNull(moneyTransactions.transferPeerId),
              gte(moneyTransactions.date, `${year}-01-01`),
              lte(moneyTransactions.date, `${year}-12-31`),
            ),
          )
          .all()
          .filter((row) => row.categoryKind !== "income");
  const months = monthsOf(year);

  const report = cards
    .map(({ card, accountName, accountKind }) =>
      cardReport(
        card,
        { name: accountName, kind: cardKindFor(accountKind) ?? "debit" },
        programsByCard.get(card.id) ?? null,
        rows.filter((row) => row.cardId === card.id),
        months,
      ),
    )
    .filter((entry) => !entry.card.archived || entry.spentCents !== 0);
  const withRewards = report.filter((entry) => entry.program !== null);
  return {
    year,
    cards: report,
    totals: {
      spentCents: withRewards.reduce((sum, entry) => sum + entry.spentCents, 0),
      valueCents: withRewards.reduce((sum, entry) => sum + entry.valueCents, 0),
    },
  };
}

function cardReport(
  card: CardRow,
  account: { name: string; kind: CardKind },
  program: RewardProgramJson | null,
  rows: Array<{
    date: string;
    amountCents: number;
    categoryId: number | null;
    payee: string;
    bankPayee: string | null;
  }>,
  months: string[],
): CardRewardsJson {
  const spends: Spend[] = rows.map((row) => ({
    date: row.date,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    text: [row.payee, row.bankPayee ?? ""].join(" "),
  }));
  const plan: RewardProgram = program ?? {
    kind: "cash_back",
    baseRate: 0,
    pointValue: 100,
    rates: [],
  };
  const earnings = earnRewards(plan, spends);
  const value = (earned: number) => rewardValue(plan.kind, plan.pointValue, earned);

  // Rounded per month, and the year is the sum of the months, so the table adds up.
  const byMonth = months.map((month) => {
    const inMonth = earnings.filter((earning) => earning.date.startsWith(month));
    const earned = inMonth.reduce((sum, earning) => sum + earning.earned, 0);
    return {
      month,
      spentCents: inMonth.reduce((sum, earning) => sum + earning.spentCents, 0),
      earned: Math.round(earned),
      valueCents: Math.round(value(earned)),
    };
  });

  const byRate: RewardByRateJson[] = [
    ...(program?.rates ?? []).map((rate) => ({ rate, id: rate.id as number | null })),
    { rate: null, id: null },
  ].map(({ rate, id }) => {
    const mine = earnings.filter((earning) => earning.rateId === id);
    return {
      key: id === null ? "base" : `rate-${id}`,
      rateId: id,
      label: rate ? rateName(rate) : "Everything else",
      rate: rate ? rate.rate : plan.baseRate,
      startsOn: rate?.startsOn ?? null,
      endsOn: rate?.endsOn ?? null,
      capCents: rate?.capCents ?? null,
      spentCents: mine.reduce((sum, earning) => sum + earning.spentCents, 0),
      earned: Math.round(mine.reduce((sum, earning) => sum + earning.earned, 0)),
    };
  });

  return {
    card: {
      id: card.id,
      name: card.name,
      last4: card.last4,
      kind: account.kind,
      archived: card.archived,
      account: { id: card.accountId, name: account.name },
    },
    program,
    spentCents: byMonth.reduce((sum, month) => sum + month.spentCents, 0),
    earned: program ? byMonth.reduce((sum, month) => sum + month.earned, 0) : 0,
    valueCents: program ? byMonth.reduce((sum, month) => sum + month.valueCents, 0) : 0,
    months: program ? byMonth : byMonth.map((month) => ({ ...month, earned: 0, valueCents: 0 })),
    byRate: program ? byRate : [],
  };
}
