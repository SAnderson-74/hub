import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import { type CardKind, cardKindFor } from "../../shared/cards";
import {
  bestCard,
  type CardSpend,
  DEFAULT_BASELINE,
  earnRewards,
  type PointBalanceSave,
  type RedemptionSave,
  type RewardKind,
  type RewardProgram,
  type RewardsSave,
  realPointValue,
  redemptionSchema,
  rewardsSaveSchema,
  rewardValue,
  type Spend,
  type ValuedProgram,
} from "../../shared/rewards";
import { lineAmountCents, lineCategoryId, splitJoin } from "./lines";
import {
  moneyAccounts,
  moneyBooks,
  moneyCardRewards,
  moneyCards,
  moneyCategories,
  moneyPointBalances,
  moneyPointRedemptions,
  moneyRewardRates,
  moneyTransactionSplits,
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
  annualFeeCents: number;
  rates: RewardRateJson[];
};

export type PointBalanceJson = { id: number; date: string; points: number };
export type RedemptionJson = {
  id: number;
  date: string;
  points: number;
  valueCents: number;
  note: string;
};

/** A points card's history: balances from statements and points used, newest first. */
export type PointsJson = {
  balances: PointBalanceJson[];
  redemptions: RedemptionJson[];
  /** What points were worth when used, in hundredths of a cent, or null without any. */
  realValue: number | null;
};

/**
 * Between a points card's last two statement balances: what the statements say it
 * earned (the change plus points used in between), and what Hub estimated.
 */
export type PointsCheckJson = {
  from: string;
  to: string;
  statementPoints: number;
  estimatedPoints: number;
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
  /** For points: what a point is counted at, and whether that's from redemptions or the setting. */
  pointValue: number;
  pointValueSource: "redemptions" | "set";
  /** The card's cost and what's left after it, against a flat-rate card on the same spending. */
  worth: { annualFeeCents: number; netCents: number; flatCents: number };
  /** Points cards: the latest statement balance, the check, and points used this year. */
  points: {
    latest: { date: string; points: number } | null;
    check: PointsCheckJson | null;
    redeemedPoints: number;
    redeemedValueCents: number;
  } | null;
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
  /** The flat-rate card each card is compared with, in hundredths of a percent. */
  baseline: number;
  cards: CardRewardsJson[];
  /** Across cards with rewards set up. */
  totals: { spentCents: number; valueCents: number; annualFeeCents: number; netCents: number };
  /** Card purchases on the card that paid, against the best card for each. */
  best: {
    actualCents: number;
    bestCents: number;
    tips: Array<{
      label: string;
      fromCard: string;
      toCard: string;
      spentCents: number;
      missedCents: number;
    }>;
  };
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
          annualFeeCents: row.annualFeeCents,
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
        annualFeeCents: program.annualFeeCents,
      })
      .onConflictDoUpdate({
        target: moneyCardRewards.cardId,
        set: {
          kind: program.kind,
          baseRate: program.baseRate,
          pointValue: program.pointValue,
          annualFeeCents: program.annualFeeCents,
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

/** Removes cards' rewards programs, rates, and points history, for when the cards go. */
export function dropRewards(db: Queryable, cardIds: number[]): void {
  if (cardIds.length === 0) return;
  db.delete(moneyRewardRates).where(inArray(moneyRewardRates.cardId, cardIds)).run();
  db.delete(moneyCardRewards).where(inArray(moneyCardRewards.cardId, cardIds)).run();
  db.delete(moneyPointBalances).where(inArray(moneyPointBalances.cardId, cardIds)).run();
  db.delete(moneyPointRedemptions).where(inArray(moneyPointRedemptions.cardId, cardIds)).run();
}

// Points

/** A card's points history, newest first. */
export function cardPoints(db: Queryable, cardId: number): PointsJson {
  requireCard(db, cardId);
  const balances = db
    .select({
      id: moneyPointBalances.id,
      date: moneyPointBalances.date,
      points: moneyPointBalances.points,
    })
    .from(moneyPointBalances)
    .where(eq(moneyPointBalances.cardId, cardId))
    .orderBy(desc(moneyPointBalances.date))
    .all();
  const redemptions = db
    .select({
      id: moneyPointRedemptions.id,
      date: moneyPointRedemptions.date,
      points: moneyPointRedemptions.points,
      valueCents: moneyPointRedemptions.valueCents,
      note: moneyPointRedemptions.note,
    })
    .from(moneyPointRedemptions)
    .where(eq(moneyPointRedemptions.cardId, cardId))
    .orderBy(desc(moneyPointRedemptions.date), desc(moneyPointRedemptions.id))
    .all();
  return { balances, redemptions, realValue: realPointValue(redemptions) };
}

/** Saves a statement balance; a second one for the same day replaces the first. */
export function savePointBalance(db: Db, cardId: number, input: PointBalanceSave): PointsJson {
  return db.transaction((tx) => {
    requireCard(tx, cardId);
    tx.insert(moneyPointBalances)
      .values({ cardId, date: input.date, points: input.points })
      .onConflictDoUpdate({
        target: [moneyPointBalances.cardId, moneyPointBalances.date],
        set: { points: input.points, updatedAt: new Date() },
      })
      .run();
    return cardPoints(tx, cardId);
  });
}

export function deletePointBalance(db: Db, id: number): PointsJson {
  return db.transaction((tx) => {
    const row = tx.select().from(moneyPointBalances).where(eq(moneyPointBalances.id, id)).get();
    if (!row) throw notFound("That balance doesn't exist. It may have been deleted.");
    tx.delete(moneyPointBalances).where(eq(moneyPointBalances.id, id)).run();
    return cardPoints(tx, row.cardId);
  });
}

export function addRedemption(db: Db, cardId: number, input: RedemptionSave): PointsJson {
  const redemption = redemptionSchema.parse(input);
  return db.transaction((tx) => {
    requireCard(tx, cardId);
    tx.insert(moneyPointRedemptions)
      .values({ cardId, ...redemption })
      .run();
    return cardPoints(tx, cardId);
  });
}

export function deleteRedemption(db: Db, id: number): PointsJson {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(moneyPointRedemptions)
      .where(eq(moneyPointRedemptions.id, id))
      .get();
    if (!row) throw notFound("That redemption doesn't exist. It may have been deleted.");
    tx.delete(moneyPointRedemptions).where(eq(moneyPointRedemptions.id, id)).run();
    return cardPoints(tx, row.cardId);
  });
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

type SpendRow = {
  cardId: number | null;
  date: string;
  amountCents: number;
  categoryId: number | null;
  categoryName: string | null;
  payee: string;
  bankPayee: string | null;
};

const toSpend = (row: SpendRow): Spend => ({
  date: row.date,
  amountCents: row.amountCents,
  categoryId: row.categoryId,
  text: [row.payee, row.bankPayee ?? ""].join(" "),
});

/**
 * A card's purchases and refunds between two dates: transfers and money in to income
 * categories (like a statement credit) aside.
 */
function cardSpends(db: Queryable, cardIds: number[], from: string, to: string): SpendRow[] {
  if (cardIds.length === 0) return [];
  return db
    .select({
      cardId: moneyTransactions.cardId,
      date: moneyTransactions.date,
      // A split purchase earns on each part at its category's rate.
      amountCents: lineAmountCents,
      categoryId: lineCategoryId,
      categoryName: moneyCategories.name,
      categoryKind: moneyCategories.kind,
      payee: moneyTransactions.payee,
      bankPayee: moneyTransactions.bankPayee,
    })
    .from(moneyTransactions)
    .leftJoin(moneyTransactionSplits, splitJoin)
    .leftJoin(moneyCategories, eq(moneyCategories.id, lineCategoryId))
    .where(
      and(
        inArray(moneyTransactions.cardId, cardIds),
        isNull(moneyTransactions.transferPeerId),
        gte(moneyTransactions.date, from),
        lte(moneyTransactions.date, to),
      ),
    )
    .all()
    .filter((row) => row.categoryKind !== "income")
    .map(({ categoryKind: _kind, ...row }) => row);
}

/**
 * The statements' word against Hub's estimate, between a points card's last two
 * balances: the change, plus points used in between, against what Hub estimated the
 * card earned on purchases after the first statement through the second.
 */
function pointsCheck(
  db: Queryable,
  cardId: number,
  program: RewardProgram,
  balances: PointBalanceJson[],
  redemptions: RedemptionJson[],
): PointsCheckJson | null {
  const [latest, previous] = balances;
  if (!latest || !previous) return null;
  const used = redemptions
    .filter((entry) => entry.date > previous.date && entry.date <= latest.date)
    .reduce((sum, entry) => sum + entry.points, 0);
  const after = (date: string) => {
    const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  };
  const spends = cardSpends(db, [cardId], after(previous.date), latest.date).map(toSpend);
  const estimated = earnRewards(program, spends).reduce((sum, earning) => sum + earning.earned, 0);
  return {
    from: previous.date,
    to: latest.date,
    statementPoints: latest.points - previous.points + used,
    estimatedPoints: Math.round(estimated),
  };
}

/**
 * What each of a book's cards spent and earned in a year, by month and by rate; what
 * each is worth after its annual fee, against a flat-rate card on the same spending;
 * and what using the best card for each purchase would have earned. Purchases and
 * refunds on the card count; transfers and money in to income categories (like a
 * statement credit) don't. Points count at what redemptions got for them, or at the
 * card's set value until there are some.
 */
export function rewardsReport(
  db: Queryable,
  bookId: number,
  year: number,
  baseline = DEFAULT_BASELINE,
): RewardsReportJson {
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
  const rows = cardSpends(db, cardIds, `${year}-01-01`, `${year}-12-31`);
  const months = monthsOf(year);

  const report = cards
    .map(({ card, accountName, accountKind }) => {
      const program = programsByCard.get(card.id) ?? null;
      const history = program?.kind === "points" ? cardPoints(db, card.id) : null;
      return cardReport(db, {
        card,
        account: { name: accountName, kind: cardKindFor(accountKind) ?? "debit" },
        program,
        history,
        rows: rows.filter((row) => row.cardId === card.id),
        months,
        year,
        baseline,
      });
    })
    .filter((entry) => !entry.card.archived || entry.spentCents !== 0);
  const withRewards = report.filter((entry) => entry.program !== null);

  const valued: ValuedProgram[] = withRewards.flatMap((entry) =>
    entry.program
      ? [
          {
            cardId: entry.card.id,
            name: entry.card.name,
            program: entry.program,
            pointValue: entry.pointValue,
          },
        ]
      : [],
  );
  const names = new Map(cards.map((row) => [row.card.id, row.card.name]));
  const best = bestCard(
    valued,
    rows.flatMap((row): CardSpend[] =>
      row.cardId === null
        ? []
        : [
            {
              ...toSpend(row),
              cardId: row.cardId,
              categoryName: row.categoryName ?? "Uncategorized",
            },
          ],
    ),
  );

  const sum = (pick: (entry: CardRewardsJson) => number) =>
    withRewards.reduce((total, entry) => total + pick(entry), 0);
  return {
    year,
    baseline,
    cards: report,
    totals: {
      spentCents: sum((entry) => entry.spentCents),
      valueCents: sum((entry) => entry.valueCents),
      annualFeeCents: sum((entry) => entry.worth.annualFeeCents),
      netCents: sum((entry) => entry.worth.netCents),
    },
    best: {
      actualCents: best.actualCents,
      bestCents: best.bestCents,
      tips: best.tips.map((tip) => ({
        label: tip.label,
        fromCard: names.get(tip.fromCardId) ?? "",
        toCard: names.get(tip.toCardId) ?? "",
        spentCents: tip.spentCents,
        missedCents: tip.missedCents,
      })),
    },
  };
}

function cardReport(
  db: Queryable,
  {
    card,
    account,
    program,
    history,
    rows,
    months,
    year,
    baseline,
  }: {
    card: CardRow;
    account: { name: string; kind: CardKind };
    program: RewardProgramJson | null;
    history: PointsJson | null;
    rows: SpendRow[];
    months: string[];
    year: number;
    baseline: number;
  },
): CardRewardsJson {
  const spends = rows.map(toSpend);
  const plan: RewardProgram = program ?? {
    kind: "cash_back",
    baseRate: 0,
    pointValue: 100,
    rates: [],
  };
  const pointValue = history?.realValue ?? plan.pointValue;
  const earnings = earnRewards(plan, spends);
  const value = (earned: number) => rewardValue(plan.kind, pointValue, earned);

  // Rounded per month, and the year is the sum of the months, so the table adds up.
  const byMonth = months.map((month) => {
    const inMonth = earnings.filter((earning) => earning.date.startsWith(month));
    const earned = inMonth.reduce((sum, earning) => sum + earning.earned, 0);
    return {
      month,
      spentCents: inMonth.reduce((sum, earning) => sum + earning.spentCents, 0),
      earned: program ? Math.round(earned) : 0,
      valueCents: program ? Math.round(value(earned)) : 0,
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

  const spentCents = byMonth.reduce((sum, month) => sum + month.spentCents, 0);
  const valueCents = byMonth.reduce((sum, month) => sum + month.valueCents, 0);
  const annualFeeCents = program?.annualFeeCents ?? 0;
  const thisYear = (date: string) => date.startsWith(`${year}-`);
  const used = (history?.redemptions ?? []).filter((entry) => thisYear(entry.date));
  return {
    pointValue,
    pointValueSource: history?.realValue == null ? "set" : "redemptions",
    worth: {
      annualFeeCents,
      netCents: valueCents - annualFeeCents,
      flatCents: Math.round((Math.max(0, spentCents) * baseline) / 10_000),
    },
    points: history
      ? {
          latest: history.balances[0]
            ? { date: history.balances[0].date, points: history.balances[0].points }
            : null,
          check: pointsCheck(db, card.id, plan, history.balances, history.redemptions),
          redeemedPoints: used.reduce((sum, entry) => sum + entry.points, 0),
          redeemedValueCents: used.reduce((sum, entry) => sum + entry.valueCents, 0),
        }
      : null,
    card: {
      id: card.id,
      name: card.name,
      last4: card.last4,
      kind: account.kind,
      archived: card.archived,
      account: { id: card.accountId, name: account.name },
    },
    program,
    spentCents,
    earned: byMonth.reduce((sum, month) => sum + month.earned, 0),
    valueCents,
    months: byMonth,
    byRate: program ? byRate : [],
  };
}
