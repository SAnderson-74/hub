import { Panel } from "../../../client/components/Panel";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { Stat } from "../../../client/components/Stat";
import { StatusDot } from "../../../client/components/StatusDot";
import { formatCents } from "../../../shared/money";
import { inventoryAging, type Suggestion, WINDOW_DAYS } from "../../../shared/resaleAging";
import type { Item } from "../queries";

const KIND_LABELS: Record<Suggestion["kind"], string> = {
  list: "List it",
  repair: "Finish the repair",
  reprice: "Lower the price",
  relist: "Relist it",
};

/** How long stock sits, how fast it sells, and what to do about what's sat. */
export function AgingView({
  items,
  today,
  onOpen,
}: {
  items: Item[];
  today: string;
  onOpen: (id: number) => void;
}) {
  const aging = inventoryAging(items, today);
  const largest = Math.max(1, ...aging.groups.map((group) => group.count));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
        <Stat label="In stock" value={String(aging.inStock)} />
        <Stat label="Tied up" value={formatCents(aging.stockCents)} note="Paid plus costs" />
        <Stat
          label="Sell-through"
          value={aging.sellThroughPercent === null ? "None" : `${aging.sellThroughPercent}%`}
          note={`${aging.soldInWindow} sold in ${WINDOW_DAYS} days`}
        />
        <Stat
          label="Days to sell"
          value={aging.medianDaysToSell === null ? "None" : String(aging.medianDaysToSell)}
          note="The middle of recent sales"
        />
      </div>

      <Panel
        title="What to do"
        description="Items that have sat: list them, lower the price, or list them fresh."
        className="lg:col-span-7"
      >
        {aging.suggestions.length === 0 ? (
          <p className="text-muted">Nothing has sat long. Everything in stock is moving.</p>
        ) : (
          <ul className="space-y-2">
            {aging.suggestions.map((suggestion) => {
              return (
                <li
                  key={`${suggestion.itemId}-${suggestion.kind}`}
                  className="rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(suggestion.itemId)}
                    className="block w-full text-left"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                      <StatusDot tone={suggestion.kind === "list" ? "accent" : "warn"} />
                      {KIND_LABELS[suggestion.kind]}
                      {suggestion.priceCents
                        ? ` to about ${formatCents(suggestion.priceCents)}`
                        : ""}
                    </span>
                    <span className="mt-1 block font-semibold break-words text-fg">
                      {suggestion.title}
                    </span>
                    <span className="block text-sm text-muted">{suggestion.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="space-y-4 lg:col-span-5 lg:space-y-6">
        <Panel title="Age of stock" description="Since each was bought, or added without a date.">
          <ul className="space-y-3">
            {aging.groups.map((group) => (
              <li key={group.label} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-fg">{group.label}</span>
                  <span className="text-muted tabular-nums">
                    {group.count} · {formatCents(group.cents)}
                  </span>
                </div>
                <ProgressBar
                  percent={Math.round((group.count / largest) * 100)}
                  label={`${group.label}: ${group.count} items`}
                />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="Days to sell by category"
          description={`Sales in the last ${WINDOW_DAYS} days.`}
        >
          {aging.categories.length === 0 ? (
            <p className="text-sm text-muted">No recent sales with a category and dates yet.</p>
          ) : (
            <ul className="divide-y divide-surface-0 text-sm">
              {aging.categories.map((category) => (
                <li key={category.name} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 break-words text-fg">{category.name}</span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {category.medianDays} days · {category.sold} sold
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
