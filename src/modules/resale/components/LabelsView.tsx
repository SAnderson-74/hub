import { Printer } from "lucide-react";
import { useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ghostButton, inputClass, labelClass, primaryButton } from "../../../client/components/ui";
import { IN_STOCK_STATUSES, ITEM_STATUS_LABELS } from "../../../shared/resale";
import type { Item } from "../queries";
import { Barcode } from "./Barcode";

/**
 * Labels for items in stock: the title, its SKU as text and a barcode, and where it's
 * kept. Pick the items, then print; only the labels print.
 */
export function LabelsView({ items }: { items: Item[] }) {
  const ids = useId();
  const stock = items.filter((item) => IN_STOCK_STATUSES.includes(item.status));
  const [spot, setSpot] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const spots = [...new Set(stock.map((item) => item.spot).filter(Boolean))].sort();
  const shown = stock.filter((item) => spot === "" || item.spot === spot);
  const chosen = stock.filter((item) => picked.has(item.id));
  const missingSku = chosen.filter((item) => !item.sku).length;

  const toggle = (id: number, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <Panel
        title="Pick items"
        description="In stock: bought, in repair, or listed."
        className="lg:col-span-5"
      >
        {stock.length === 0 ? (
          <p className="text-muted">Nothing in stock to label.</p>
        ) : (
          <div className="space-y-4">
            {spots.length > 0 ? (
              <div>
                <label htmlFor={`${ids}-spot`} className={labelClass}>
                  Kept at
                </label>
                <select
                  id={`${ids}-spot`}
                  value={spot}
                  onChange={(event) => setSpot(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Anywhere</option>
                  {spots.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ghostButton}
                onClick={() => setPicked(new Set([...picked, ...shown.map((item) => item.id)]))}
              >
                Pick all {shown.length}
              </button>
              {picked.size > 0 ? (
                <button type="button" className={ghostButton} onClick={() => setPicked(new Set())}>
                  Clear
                </button>
              ) : null}
            </div>
            <ul className="space-y-1">
              {shown.map((item) => (
                <li key={item.id}>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={picked.has(item.id)}
                      onChange={(event) => toggle(item.id, event.target.checked)}
                      className="size-5 shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="block break-words text-fg">{item.title}</span>
                      <span className="block text-sm text-muted">
                        {[item.sku ?? "No SKU", item.spot, ITEM_STATUS_LABELS[item.status]]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel
        title="Labels"
        description={
          chosen.length === 0
            ? "Pick items to see their labels."
            : `${chosen.length} ${chosen.length === 1 ? "label" : "labels"}${
                missingSku > 0
                  ? `. ${missingSku} without a SKU show the item's number; give each one under its details.`
                  : "."
              }`
        }
        action={
          <button
            type="button"
            className={primaryButton}
            disabled={chosen.length === 0}
            onClick={() => window.print()}
          >
            <Printer aria-hidden="true" className="size-5" />
            Print labels
          </button>
        }
        className="lg:col-span-7"
      >
        <div className="print-labels grid grid-cols-1 gap-3 sm:grid-cols-2">
          {chosen.map((item) => {
            const code = item.sku ?? `#${item.id}`;
            return (
              <div
                key={item.id}
                className="label-card min-w-0 rounded-tile bg-base/80 p-3 text-fg ring-1 ring-surface-1"
              >
                <p className="line-clamp-2 text-sm font-semibold break-words">{item.title}</p>
                {item.sku ? <Barcode value={item.sku} className="mt-2 h-10 w-full" /> : null}
                <p className="mt-1 font-mono text-lg font-bold tracking-wider">{code}</p>
                {item.spot ? <p className="text-sm">{item.spot}</p> : null}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
