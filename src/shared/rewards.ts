import { z } from "zod";
import { formatCents } from "./money";
import { textHas } from "./moneyRules";

// Card rewards: what a card earns on what it pays for, as cash back or points. A
// program has a base rate and bonus rates, each for a store (matched in the payee or
// the bank's text) or a spending category, optionally only between two dates (rotating
// quarterly categories) and only on the first so much spent (a cap). Estimates, from
// the card's transactions; the card's own statement is the final word.

export const REWARD_KINDS = ["cash_back", "points"] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

export const REWARD_KIND_LABELS: Record<RewardKind, string> = {
  cash_back: "Cash back",
  points: "Points",
};

const date = z.iso.date("Use a date like 2030-01-31.");
/**
 * A rate in hundredths: for cash back, of a percent (500 is 5%); for points, of a point
 * per dollar (300 is 3 points per dollar). Either way a purchase earns
 * amountCents × rate / 10,000 (cents of cash back, or points).
 */
const rate = z
  .number()
  .int("Use a rate with at most two decimals.")
  .min(0, "Rates can't be negative.")
  .max(10_000, "Use a rate of 100 or less.");

export const rewardRateSchema = z
  .object({
    /** A spending category the rate is for... */
    categoryId: z.number().int().positive().nullable().default(null),
    /** ...or a store, as text to find in the payee: "example store, exmpl store". */
    contains: z
      .string()
      .trim()
      .max(200, "Keep store names under 200 characters.")
      .transform((value) => value || null)
      .nullable()
      .default(null),
    rate,
    /** Only for purchases on or after this date, like a quarterly bonus. */
    startsOn: date.nullable().default(null),
    /** Only for purchases on or before this date. */
    endsOn: date.nullable().default(null),
    /**
     * Only on the first this much spent: in the dates above when they're set,
     * otherwise each calendar year. Past it, the base rate applies.
     */
    capCents: z
      .number()
      .int("Use whole cents.")
      .positive("Use a cap above $0, or none.")
      .max(10_000_000_000, "Use an amount under $100,000,000.")
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.categoryId === null) === (value.contains === null)) {
      ctx.addIssue({
        code: "custom",
        message: "Give each bonus rate either a category or a store.",
        path: ["categoryId"],
      });
    }
    if (value.startsOn && value.endsOn && value.endsOn < value.startsOn) {
      ctx.addIssue({
        code: "custom",
        message: "The end date has to be on or after the start.",
        path: ["endsOn"],
      });
    }
  });
export type RewardRateInput = z.input<typeof rewardRateSchema>;

export const rewardsSaveSchema = z
  .object({
    kind: z.enum(REWARD_KINDS),
    /** What everything else earns. */
    baseRate: rate,
    /** What a point is worth, in hundredths of a cent: 100 is 1¢. Unused for cash back. */
    pointValue: z
      .number()
      .int("Use a value with at most two decimals.")
      .min(1, "Give points a value above 0¢.")
      .max(10_000, "Use a value under $1 a point.")
      .default(100),
    /** What the card costs a year. */
    annualFeeCents: z
      .number()
      .int("Use whole cents.")
      .min(0, "Fees can't be negative.")
      .max(10_000_000, "Use a fee under $100,000.")
      .default(0),
    rates: z.array(rewardRateSchema).max(50, "Keep it to 50 bonus rates."),
  })
  .strict();
export type RewardsSave = z.input<typeof rewardsSaveSchema>;

/** The flat-rate card each card is compared with: 200 is 2% back on everything. */
export const DEFAULT_BASELINE = 200;

export const rewardsQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2000).max(2100),
  baseline: z.coerce.number().int().min(0).max(10_000).default(DEFAULT_BASELINE),
});

const points = z
  .number()
  .int("Use whole points.")
  .max(1_000_000_000, "Use fewer than a billion points.");

/** A points balance from a statement. */
export const pointBalanceSchema = z
  .object({ date, points: points.min(0, "A balance can't be negative.") })
  .strict();
export type PointBalanceSave = z.infer<typeof pointBalanceSchema>;

/** Points used, and what they were worth. */
export const redemptionSchema = z
  .object({
    date,
    points: points.min(1, "Enter how many points were used."),
    valueCents: z
      .number()
      .int("Use whole cents.")
      .min(0, "The value can't be negative.")
      .max(10_000_000_000, "Use an amount under $100,000,000."),
    note: z.string().trim().max(200, "Keep notes under 200 characters.").default(""),
  })
  .strict();
export type RedemptionSave = z.input<typeof redemptionSchema>;

export type RewardRate = {
  id: number;
  categoryId: number | null;
  contains: string | null;
  rate: number;
  startsOn: string | null;
  endsOn: string | null;
  capCents: number | null;
};

export type RewardProgram = {
  kind: RewardKind;
  baseRate: number;
  pointValue: number;
  /** In the order they're tried; stores before categories. */
  rates: RewardRate[];
};

/** A card's purchase (negative) or refund (positive), with what it was for. */
export type Spend = {
  date: string;
  amountCents: number;
  categoryId: number | null;
  /** The payee and the bank's own text, for finding stores. */
  text: string;
};

/** What part of a spend earned at one rate. `rateId` null is the base rate. */
export type Earning = {
  date: string;
  rateId: number | null;
  rate: number;
  /** Spending counted: positive for purchases, negative for refunds. */
  spentCents: number;
  /** Cents of cash back, or points; a refund takes back what it earned. */
  earned: number;
};

const applies = (rate: RewardRate, date: string) =>
  (!rate.startsOn || date >= rate.startsOn) && (!rate.endsOn || date <= rate.endsOn);

const fitsStore = (rate: RewardRate, text: string) =>
  (rate.contains ?? "").split(",").some((part) => part.trim() !== "" && textHas(text, part));

/** The first bonus rate for a spend: any store's before any category's, each in order. */
export function bonusFor(rates: readonly RewardRate[], spend: Spend): RewardRate | null {
  const live = rates.filter((rate) => applies(rate, spend.date));
  return (
    live.find((rate) => fitsStore(rate, spend.text)) ??
    live.find((rate) => rate.contains === null && rate.categoryId === spend.categoryId) ??
    null
  );
}

/**
 * What each spend earned, oldest first. A capped rate counts spending toward its cap
 * in its dates (or each calendar year without them); the part past the cap earns the
 * base rate, and a refund gives back cap room before base-rate spending.
 */
export function earnRewards(program: RewardProgram, spends: readonly Spend[]): Earning[] {
  const earnings: Earning[] = [];
  const capUsed = new Map<string, number>();
  const earn = (date: string, rateId: number | null, rate: number, spentCents: number) => {
    if (spentCents !== 0) {
      earnings.push({ date, rateId, rate, spentCents, earned: (spentCents * rate) / 10_000 });
    }
  };
  const ordered = [...spends].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const spend of ordered) {
    const spent = -spend.amountCents;
    const bonus = bonusFor(program.rates, spend);
    if (!bonus) {
      earn(spend.date, null, program.baseRate, spent);
      continue;
    }
    if (bonus.capCents === null) {
      earn(spend.date, bonus.id, bonus.rate, spent);
      continue;
    }
    const window = bonus.startsOn || bonus.endsOn ? "dates" : spend.date.slice(0, 4);
    const key = `${bonus.id}|${window}`;
    const used = capUsed.get(key) ?? 0;
    if (spent > 0) {
      const atBonus = Math.min(spent, Math.max(0, bonus.capCents - used));
      capUsed.set(key, used + atBonus);
      earn(spend.date, bonus.id, bonus.rate, atBonus);
      earn(spend.date, null, program.baseRate, spent - atBonus);
    } else {
      const back = Math.min(-spent, used);
      capUsed.set(key, used - back);
      earn(spend.date, bonus.id, bonus.rate, -back);
      earn(spend.date, null, program.baseRate, spent + back);
    }
  }
  return earnings;
}

/** Cents of value for what was earned: cash back as is, points at their value. */
export function rewardValue(kind: RewardKind, pointValue: number, earned: number): number {
  return kind === "points" ? (earned * pointValue) / 100 : earned;
}

/** "5%", "1.5%", "3x" */
export function rateLabel(kind: RewardKind, rate: number): string {
  const amount = (rate / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return kind === "points" ? `${amount}x` : `${amount}%`;
}

/** "1¢", "1.25¢" per point */
export function pointValueLabel(pointValue: number): string {
  return `${(pointValue / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}¢`;
}

/** Hundredths from what someone typed: "5", "5%", "1.5", "3x". Null when it isn't a rate. */
export function parseRate(input: string): number | null {
  const match = /^\s*(\d{1,3}(?:\.\d{1,2})?|\.\d{1,2})\s*[%x×]?\s*$/i.exec(input);
  if (!match?.[1]) return null;
  const hundredths = Math.round(Number(match[1]) * 100);
  return hundredths <= 10_000 ? hundredths : null;
}

/** The form's text for a stored rate: 150 is "1.5". */
export const rateToInput = (rate: number) => String(rate / 100);

/** What was earned, in words: "$12.34" of cash back, or "1,234 points (about $12.34)". */
export function earnedLabel(kind: RewardKind, earned: number, valueCents: number): string {
  if (kind === "cash_back") return formatCents(valueCents);
  const points = Math.round(earned).toLocaleString("en-US");
  return `${points} ${Math.round(earned) === 1 ? "point" : "points"} (about ${formatCents(valueCents)})`;
}

/**
 * What points were really worth when used, in hundredths of a cent per point, or null
 * without redemptions. 15,000 points for $187.50 is 125 (1.25¢).
 */
export function realPointValue(
  redemptions: ReadonlyArray<{ points: number; valueCents: number }>,
): number | null {
  const used = redemptions.reduce((sum, entry) => sum + entry.points, 0);
  if (used <= 0) return null;
  const value = redemptions.reduce((sum, entry) => sum + entry.valueCents, 0);
  return Math.round((value * 100) / used);
}

/** A card's program, valued per cent: what a dollar spent earns in cents of value. */
export type ValuedProgram = {
  cardId: number;
  name: string;
  program: RewardProgram;
  /** Hundredths of a cent per point, for points programs. */
  pointValue: number;
};

/** A purchase made with a card, for asking which card would have earned the most. */
export type CardSpend = Spend & { cardId: number; categoryName: string };

export type BestCardTip = {
  /** What the purchases were for: a category, or "Uncategorized". */
  label: string;
  /** The card that paid, and the one that would have earned the most. */
  fromCardId: number;
  toCardId: number;
  spentCents: number;
  /** Cents more the best card would have earned. */
  missedCents: number;
};

export type BestCard = {
  /** What the cards that paid earned, in cents of value, without caps. */
  actualCents: number;
  /** What the best card for each purchase would have earned, without caps. */
  bestCents: number;
  tips: BestCardTip[];
};

/** What a purchase earns on a program, in cents of value, ignoring caps. */
function purchaseValue(card: ValuedProgram, spend: Spend): number {
  const bonus = bonusFor(card.program.rates, spend);
  const rate = bonus ? bonus.rate : card.program.baseRate;
  const earned = (-spend.amountCents * rate) / 10_000;
  return rewardValue(card.program.kind, card.pointValue, earned);
}

/**
 * For each card purchase, what the card that paid earned against what the best of
 * the book's cards with rewards would have, ignoring caps (which depend on what else
 * went on each card). Tips group what was missed by category and card, biggest first.
 */
export function bestCard(
  cards: readonly ValuedProgram[],
  spends: readonly CardSpend[],
  maxTips = 3,
): BestCard {
  let actualCents = 0;
  let bestCents = 0;
  const tips = new Map<string, BestCardTip>();
  for (const spend of spends) {
    if (spend.amountCents >= 0 || cards.length === 0) continue;
    const paid = cards.find((card) => card.cardId === spend.cardId);
    const actual = paid ? purchaseValue(paid, spend) : 0;
    let best = { cardId: spend.cardId, value: actual };
    for (const card of cards) {
      const value = purchaseValue(card, spend);
      if (value > best.value + 1e-9) best = { cardId: card.cardId, value };
    }
    actualCents += actual;
    bestCents += best.value;
    if (best.cardId === spend.cardId) continue;
    const key = `${spend.categoryName}|${spend.cardId}|${best.cardId}`;
    const tip = tips.get(key) ?? {
      label: spend.categoryName,
      fromCardId: spend.cardId,
      toCardId: best.cardId,
      spentCents: 0,
      missedCents: 0,
    };
    tip.spentCents += -spend.amountCents;
    tip.missedCents += best.value - actual;
    tips.set(key, tip);
  }
  return {
    actualCents: Math.round(actualCents),
    bestCents: Math.round(bestCents),
    tips: [...tips.values()]
      .map((tip) => ({ ...tip, missedCents: Math.round(tip.missedCents) }))
      .filter((tip) => tip.missedCents > 0)
      .sort((a, b) => b.missedCents - a.missedCents)
      .slice(0, maxTips),
  };
}
