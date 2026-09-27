import type { Tone } from "../../client/components/StatusDot";
import { formatCents } from "../../shared/money";
import { IN_STOCK_STATUSES, type ItemStatus } from "../../shared/resale";
import { daysBetween } from "../tasks/dates";

/** Status lights; the status name is always shown next to them. */
export const STATUS_TONES: Record<ItemStatus, Tone> = {
  sourcing: "idle",
  acquired: "accent",
  repairing: "warn",
  listed: "accent",
  sold: "ok",
  kept: "idle",
};

type Stocked = { status: ItemStatus; purchaseCents: number | null; costsCents: number };

/**
 * "4 in stock, $320 paid, $45 in costs. 2 listed." Items without a price are
 * counted and said.
 */
export function stockSummary(items: readonly Stocked[]): string {
  const stock = items.filter((item) => IN_STOCK_STATUSES.includes(item.status));
  if (items.length === 0) return "Track what you buy to resell.";
  if (stock.length === 0) return "Nothing in stock right now.";
  const paid = stock.reduce((sum, item) => sum + (item.purchaseCents ?? 0), 0);
  const costs = stock.reduce((sum, item) => sum + item.costsCents, 0);
  const unpriced = stock.filter((item) => item.purchaseCents === null).length;
  const listed = stock.filter((item) => item.status === "listed").length;
  return [
    `${stock.length} in stock, ${formatCents(paid)} paid${unpriced > 0 ? ` (${unpriced} without a price)` : ""}${costs > 0 ? `, ${formatCents(costs)} in costs` : ""}.`,
    listed > 0 ? `${listed} listed.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

/**
 * Days held: from purchase to sale for sold items ("Sold after 18 days"), or to
 * today for items in stock ("Held 12 days"). null without the dates to count.
 */
export function heldFor(
  item: { status: ItemStatus; purchasedOn: string | null; soldOn?: string | null },
  today: string,
): string | null {
  if (!item.purchasedOn) return null;
  if (item.status === "sold") {
    if (!item.soldOn) return null;
    const days = Math.max(0, daysBetween(item.purchasedOn, item.soldOn));
    return days === 0 ? "Sold the day it was bought" : `Sold after ${dayCount(days)}`;
  }
  if (!IN_STOCK_STATUSES.includes(item.status)) return null;
  const days = Math.max(0, daysBetween(item.purchasedOn, today));
  return days === 0 ? "Bought today" : `Held ${dayCount(days)}`;
}

/** "Up 7 days" for an open listing, "Was up 7 days" for one that ended. */
export function listingAge(
  listing: { listedOn: string; endedOn: string | null },
  today: string,
): string {
  const end = listing.endedOn ?? today;
  const days = Math.max(0, daysBetween(listing.listedOn, end));
  if (listing.endedOn) return `Was up ${dayCount(days)}`;
  return days === 0 ? "Listed today" : `Up ${dayCount(days)}`;
}

/** "$22 in costs. $47 in with the price paid." */
export function costSummary(item: {
  costs: readonly unknown[];
  costsCents: number;
  purchaseCents: number | null;
}): string {
  if (item.costs.length === 0) return "No costs yet.";
  const costs = `${formatCents(item.costsCents)} in costs.`;
  return item.purchaseCents === null
    ? costs
    : `${costs} ${formatCents(item.costsCents + item.purchaseCents)} in with the price paid.`;
}
