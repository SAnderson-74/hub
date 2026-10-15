import { median } from "./insights";
import { addDays, daysBetween } from "./recurrence";
import { IN_STOCK_STATUSES, type ItemStatus } from "./resale";

// How long stock sits: age groups for what's on hand, how fast things sell, and what
// to do about items that have sat: list them, lower the price, or relist.

export const AGE_GROUPS = [
  { label: "Under 30 days", max: 30 },
  { label: "30 to 60 days", max: 60 },
  { label: "60 to 90 days", max: 90 },
  { label: "90 to 180 days", max: 180 },
  { label: "Over 180 days", max: Number.POSITIVE_INFINITY },
] as const;

/** Bought but not listed for this long: list it. */
export const LIST_AFTER_DAYS = 14;
/** In repair this long: finish it. */
export const REPAIR_AFTER_DAYS = 30;
/** One price this long: lower it. */
export const REPRICE_AFTER_DAYS = 30;
/** Up this long: a fresh listing often gets seen again. */
export const RELIST_AFTER_DAYS = 60;
/** How far back sell-through and days to sell look. */
export const WINDOW_DAYS = 90;

type AgingItem = {
  id: number;
  title: string;
  status: ItemStatus;
  category: string;
  purchasedOn: string | null;
  purchaseCents: number | null;
  costsCents: number;
  soldOn: string | null;
  createdAt: string;
  listings: ReadonlyArray<{
    listedOn: string;
    endedOn: string | null;
    priceCents: number;
    prices: ReadonlyArray<{ changedOn: string }>;
  }>;
};

export type Suggestion = {
  itemId: number;
  title: string;
  kind: "list" | "repair" | "reprice" | "relist";
  /** What to do and why, in a sentence. */
  text: string;
  days: number;
  /** For a price cut: a price to try, a tenth lower, in whole dollars. */
  priceCents?: number;
};

export type Aging = {
  groups: Array<{ label: string; count: number; cents: number }>;
  inStock: number;
  /** What's tied up in stock: prices paid plus costs. */
  stockCents: number;
  /** Sold in the window, over sold plus still in stock: null with nothing to go on. */
  sellThroughPercent: number | null;
  soldInWindow: number;
  /** The middle number of days from purchase to sale, for sales in the window. */
  medianDaysToSell: number | null;
  /** The same, by category, slowest first. */
  categories: Array<{ name: string; medianDays: number; sold: number }>;
  suggestions: Suggestion[];
};

/** When an item came in: its purchase date, or when it was added. */
const arrived = (item: AgingItem) => item.purchasedOn ?? item.createdAt.slice(0, 10);

export function inventoryAging(items: readonly AgingItem[], today: string): Aging {
  const stock = items.filter((item) => IN_STOCK_STATUSES.includes(item.status));
  const ageOf = (item: AgingItem) => Math.max(0, daysBetween(arrived(item), today));
  const tied = (item: AgingItem) => (item.purchaseCents ?? 0) + item.costsCents;

  const groups = AGE_GROUPS.map((group, index) => {
    const min = index === 0 ? 0 : (AGE_GROUPS[index - 1]?.max ?? 0);
    const inGroup = stock.filter((item) => ageOf(item) >= min && ageOf(item) < group.max);
    return {
      label: group.label,
      count: inGroup.length,
      cents: inGroup.reduce((sum, item) => sum + tied(item), 0),
    };
  });

  const since = addDays(today, -WINDOW_DAYS);
  const sold = items.filter(
    (item) =>
      item.status === "sold" &&
      item.soldOn !== null &&
      item.soldOn >= since &&
      item.soldOn <= today,
  );
  const held = (item: AgingItem) =>
    item.soldOn && item.purchasedOn
      ? Math.max(0, daysBetween(item.purchasedOn, item.soldOn))
      : null;
  const heldDays = sold.map(held).filter((days): days is number => days !== null);
  const byCategory = new Map<string, number[]>();
  for (const item of sold) {
    const days = held(item);
    if (days === null || !item.category) continue;
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), days]);
  }

  const suggestions: Suggestion[] = [];
  for (const item of stock) {
    const age = ageOf(item);
    const open = item.listings.find((listing) => listing.endedOn === null);
    if (item.status === "acquired" && age >= LIST_AFTER_DAYS) {
      suggestions.push({
        itemId: item.id,
        title: item.title,
        kind: "list",
        days: age,
        text: `In stock ${age} days and not listed. List it.`,
      });
    } else if (item.status === "repairing" && age >= REPAIR_AFTER_DAYS) {
      suggestions.push({
        itemId: item.id,
        title: item.title,
        kind: "repair",
        days: age,
        text: `In repair for ${age} days. Finish it, or list it as is.`,
      });
    } else if (item.status === "listed" && open) {
      const up = Math.max(0, daysBetween(open.listedOn, today));
      const samePrice = Math.max(
        0,
        daysBetween(open.prices.at(-1)?.changedOn ?? open.listedOn, today),
      );
      if (up >= RELIST_AFTER_DAYS) {
        suggestions.push({
          itemId: item.id,
          title: item.title,
          kind: "relist",
          days: up,
          text: `Listed ${up} days. End it and list it fresh so it shows as new.`,
        });
      } else if (samePrice >= REPRICE_AFTER_DAYS) {
        const priceCents = Math.max(100, Math.round((open.priceCents * 0.9) / 100) * 100);
        suggestions.push({
          itemId: item.id,
          title: item.title,
          kind: "reprice",
          days: samePrice,
          priceCents,
          text: `Same price for ${samePrice} days. Try about a tenth less.`,
        });
      }
    }
  }
  suggestions.sort((a, b) => b.days - a.days || a.itemId - b.itemId);

  return {
    groups,
    inStock: stock.length,
    stockCents: stock.reduce((sum, item) => sum + tied(item), 0),
    sellThroughPercent:
      sold.length + stock.length === 0
        ? null
        : Math.round((sold.length / (sold.length + stock.length)) * 100),
    soldInWindow: sold.length,
    medianDaysToSell: heldDays.length === 0 ? null : median(heldDays),
    categories: [...byCategory.entries()]
      .map(([name, days]) => ({ name, medianDays: median(days), sold: days.length }))
      .sort((a, b) => b.medianDays - a.medianDays || a.name.localeCompare(b.name)),
    suggestions,
  };
}
