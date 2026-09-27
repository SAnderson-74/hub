import { itemProfit, type ProfitInput } from "./profit";
import { daysBetween } from "./recurrence";

/** What a buy decision rests on. Money is in cents; percents are 0-100. */
export type OfferInput = {
  saleCents: number;
  /** Platform fees as a percent of the sale price. */
  feePercent: number;
  /** Fees that don't depend on the price, like shipping or a listing fee. */
  fixedFeeCents: number;
  repairCents: number;
  /** The profit wanted, as a percent of the sale price (margin, as on the Profit view). */
  marginPercent: number;
};

export type Offer = {
  feesCents: number;
  /** The profit the target margin asks for at the expected price. */
  profitCents: number;
  /** The most to pay. Zero or less means no price leaves the target margin. */
  maxOfferCents: number;
};

/** The most to pay: the sale price minus fees, repair, and the profit wanted. */
export function maxOffer(input: OfferInput): Offer {
  const feesCents = Math.round((input.saleCents * input.feePercent) / 100) + input.fixedFeeCents;
  const profitCents = Math.round((input.saleCents * input.marginPercent) / 100);
  return {
    feesCents,
    profitCents,
    maxOfferCents: input.saleCents - feesCents - input.repairCents - profitCents,
  };
}

/** Profit and margin if you pay `paidCents` and it sells at the expected price. */
export function profitAt(
  input: OfferInput,
  paidCents: number,
): { profitCents: number; margin: number | null } {
  const { feesCents } = maxOffer(input);
  const profitCents = input.saleCents - feesCents - input.repairCents - paidCents;
  return { profitCents, margin: input.saleCents > 0 ? profitCents / input.saleCents : null };
}

/** A percent from what someone typed, like "13", "13.5", or "13%". null if unreadable. */
export function parsePercent(input: string): number | null {
  const match = /^(\d{1,3}(?:\.\d{1,2})?)\s*%?$/.exec(input.trim());
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return value <= 100 ? value : null;
}

/** The middle value (the mean of the middle two for an even count), or null if empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

const medianCents = (values: readonly number[]) => {
  const value = median(values);
  return value === null ? null : Math.round(value);
};

/** What the history needs from an item: profit inputs plus what it was and its costs. */
export type HistoryItem = ProfitInput & {
  title: string;
  category: string;
  purchasedOn: string | null;
  costs: ReadonlyArray<{ kind: string; amountCents: number }>;
};

export type HistoryFilter = {
  /** Matched against titles and categories, ignoring case. Empty matches every sale. */
  query: string;
  /** Only sales on this platform. null for any. */
  platformId: number | null;
};

export type SalesHistory = {
  sales: number;
  medianSaleCents: number | null;
  /** From sales with a purchase price only, so $0 purchases don't inflate it. 0-1. */
  medianMargin: number | null;
  pricedSales: number;
  /** Fee costs as a percent of what those sales brought in. null if none were recorded. */
  feePercent: number | null;
  /** Shipping costs per sale. null if none were recorded. */
  medianShippingCents: number | null;
  /** Parts and supplies per sale. null if none were recorded. */
  medianRepairCents: number | null;
  medianDaysHeld: number | null;
};

const costOf = (item: HistoryItem, kinds: readonly string[]) =>
  item.costs
    .filter((cost) => kinds.includes(cost.kind))
    .reduce((sum, cost) => sum + cost.amountCents, 0);

/** Typical numbers from your sold items that match the filter. */
export function salesHistory(items: readonly HistoryItem[], filter: HistoryFilter): SalesHistory {
  const needle = filter.query.trim().toLowerCase();
  const matches = items.flatMap((item) => {
    const profit = itemProfit(item);
    if (!profit) return [];
    if (filter.platformId !== null && item.salePlatform?.id !== filter.platformId) return [];
    if (
      needle !== "" &&
      !item.title.toLowerCase().includes(needle) &&
      !item.category.toLowerCase().includes(needle)
    ) {
      return [];
    }
    return [{ item, profit }];
  });

  const saleTotal = matches.reduce((sum, { profit }) => sum + profit.saleCents, 0);
  const fees = matches.map(({ item }) => costOf(item, ["fees"]));
  const shipping = matches.map(({ item }) => costOf(item, ["shipping"]));
  const repairs = matches.map(({ item }) => costOf(item, ["parts", "supplies"]));
  const feeTotal = fees.reduce((sum, value) => sum + value, 0);
  const priced = matches.filter(({ profit }) => !profit.unpriced);
  const margins = priced.flatMap(({ profit }) => (profit.margin === null ? [] : [profit.margin]));
  const days = matches.flatMap(({ item }) => {
    if (!item.purchasedOn || !item.soldOn) return [];
    const held = daysBetween(item.purchasedOn, item.soldOn);
    return held >= 0 ? [held] : [];
  });

  return {
    sales: matches.length,
    medianSaleCents: medianCents(matches.map(({ profit }) => profit.saleCents)),
    medianMargin: median(margins),
    pricedSales: priced.length,
    feePercent:
      feeTotal > 0 && saleTotal > 0 ? Math.round((feeTotal / saleTotal) * 1000) / 10 : null,
    medianShippingCents: shipping.some((value) => value > 0) ? medianCents(shipping) : null,
    medianRepairCents: repairs.some((value) => value > 0) ? medianCents(repairs) : null,
    medianDaysHeld: medianCents(days),
  };
}

/**
 * Calculator inputs suggested by the history. Only numbers the history has are
 * included, and a margin only when it's a gain.
 */
export function historyInputs(history: SalesHistory): Partial<OfferInput> {
  const inputs: Partial<OfferInput> = {};
  if (history.medianSaleCents !== null) inputs.saleCents = history.medianSaleCents;
  if (history.feePercent !== null) inputs.feePercent = history.feePercent;
  if (history.medianShippingCents !== null) inputs.fixedFeeCents = history.medianShippingCents;
  if (history.medianRepairCents !== null) inputs.repairCents = history.medianRepairCents;
  if (history.medianMargin !== null) {
    const percent = Math.round(history.medianMargin * 100);
    if (percent > 0 && percent < 100) inputs.marginPercent = percent;
  }
  return inputs;
}
