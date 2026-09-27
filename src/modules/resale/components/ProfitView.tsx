import { lazy, Suspense } from "react";
import { Panel } from "../../../client/components/Panel";
import { LoadingRows } from "../../../client/components/States";
import { formatCents } from "../../../shared/money";
import {
  formatMargin,
  formatPerHour,
  formatSigned,
  itemProfit,
  monthSummary,
  platformSummary,
  profitByMonth,
  profitByPlatform,
  profitTotals,
} from "../../../shared/profit";
import { formatMinutes } from "../../../shared/time";
import { formatShortDate } from "../../tasks/dates";
import type { Item } from "../queries";
import { heldFor } from "../stock";

// Charts load on demand, so the rest of the app doesn't carry the chart library.
const MonthChart = lazy(() =>
  import("./ProfitCharts").then((module) => ({ default: module.MonthChart })),
);
const PlatformChart = lazy(() =>
  import("./ProfitCharts").then((module) => ({ default: module.PlatformChart })),
);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold tracking-[-0.02em] text-fg tabular-nums">
        {value}
      </p>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
    </div>
  );
}

/** Profit, margin, and profit per hour across sold items, by month and platform. */
export function ProfitView({
  items,
  today,
  onOpen,
}: {
  items: Item[];
  today: string;
  onOpen: (id: number) => void;
}) {
  const totals = profitTotals(items);
  const months = profitByMonth(items, today.slice(0, 7));
  const platforms = profitByPlatform(items);
  const sold = items
    .map((item) => ({ item, profit: itemProfit(item) }))
    .filter((entry) => entry.profit !== null)
    .sort((a, b) => (b.item.soldOn ?? "").localeCompare(a.item.soldOn ?? ""));
  const gaps = [
    totals.missingSalePrice > 0
      ? `${totals.missingSalePrice} sold ${totals.missingSalePrice === 1 ? "item has" : "items have"} no sale price and ${totals.missingSalePrice === 1 ? "isn't" : "aren't"} counted.`
      : "",
    totals.unpriced > 0
      ? `${totals.unpriced} ${totals.unpriced === 1 ? "sale has" : "sales have"} no purchase price, counted as $0.`
      : "",
  ].filter(Boolean);

  if (totals.sales === 0) {
    return (
      <Panel title="Profit">
        <p className="text-muted">
          {totals.missingSalePrice > 0
            ? "Add a sale price to your sold items to see profit here."
            : "Profit shows here once you've sold something. Mark an item sold and add its sale price."}
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <Panel
        title="Profit"
        description={gaps.length > 0 ? gaps.join(" ") : "Sale price minus price paid and costs."}
        className="lg:col-span-12"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Profit"
            value={formatSigned(totals.profitCents)}
            note={`From ${totals.sales} ${totals.sales === 1 ? "sale" : "sales"}`}
          />
          <Stat label="Sold for" value={formatCents(totals.saleCents)} />
          <Stat label="Margin" value={formatMargin(totals.margin)} />
          <Stat
            label="Profit per hour"
            value={formatPerHour(totals.perHourCents)}
            note={
              totals.perHourCents === null
                ? "Log time on items to see this"
                : `From ${totals.timedSales} timed ${totals.timedSales === 1 ? "sale" : "sales"}`
            }
          />
        </div>
      </Panel>

      <Panel title="By month" className="lg:col-span-7">
        <Suspense fallback={<LoadingRows rows={3} />}>
          <MonthChart months={months} summary={monthSummary(months)} />
        </Suspense>
      </Panel>
      <Panel title="By platform" className="lg:col-span-5">
        <Suspense fallback={<LoadingRows rows={2} />}>
          <PlatformChart platforms={platforms} summary={platformSummary(platforms)} />
        </Suspense>
      </Panel>

      <Panel title="Sales" className="lg:col-span-12">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sold.map(({ item, profit }) =>
            profit ? (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="block w-full rounded-tile bg-base/80 p-4 text-left ring-1 ring-surface-0/50 hover:ring-surface-1"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-semibold break-words text-fg">{item.title}</span>
                    <span
                      className={`shrink-0 font-bold tabular-nums ${profit.profitCents < 0 ? "text-danger" : "text-fg"}`}
                    >
                      {formatSigned(profit.profitCents)}
                      <span className="sr-only"> profit</span>
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-muted tabular-nums">
                    Sold for {formatCents(profit.saleCents)}, in for{" "}
                    {formatCents(profit.spentCents)}
                    {profit.unpriced ? " (no purchase price)" : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted tabular-nums">
                    <span>{formatMargin(profit.margin)} margin</span>
                    {profit.perHourCents !== null ? (
                      <span>
                        {formatPerHour(profit.perHourCents)} over {formatMinutes(item.timeMinutes)}
                      </span>
                    ) : null}
                    {item.soldOn ? <span>Sold {formatShortDate(item.soldOn, today)}</span> : null}
                    {heldFor(item, today) ? <span>{heldFor(item, today)}</span> : null}
                  </span>
                </button>
              </li>
            ) : null,
          )}
        </ul>
      </Panel>
    </div>
  );
}
