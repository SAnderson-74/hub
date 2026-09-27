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

type Stocked = { status: ItemStatus; purchaseCents: number | null };

/** "4 in stock, $320 paid. 2 listed." Items without a price are counted and said. */
export function stockSummary(items: readonly Stocked[]): string {
  const stock = items.filter((item) => IN_STOCK_STATUSES.includes(item.status));
  if (items.length === 0) return "Track what you buy to resell.";
  if (stock.length === 0) return "Nothing in stock right now.";
  const paid = stock.reduce((sum, item) => sum + (item.purchaseCents ?? 0), 0);
  const unpriced = stock.filter((item) => item.purchaseCents === null).length;
  const listed = stock.filter((item) => item.status === "listed").length;
  return [
    `${stock.length} in stock, ${formatCents(paid)} paid${unpriced > 0 ? ` (${unpriced} without a price)` : ""}.`,
    listed > 0 ? `${listed} listed.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** "Held 12 days" for items still in stock with a purchase date, otherwise null. */
export function heldFor(
  item: { status: ItemStatus; purchasedOn: string | null },
  today: string,
): string | null {
  if (!item.purchasedOn || !IN_STOCK_STATUSES.includes(item.status)) return null;
  const days = Math.max(0, daysBetween(item.purchasedOn, today));
  return days === 0 ? "Bought today" : `Held ${days} ${days === 1 ? "day" : "days"}`;
}
