import { Plus, Store } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import { primaryButton, secondaryButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { formatCents } from "../../../shared/money";
import { ITEM_STATUS_LABELS, ITEM_STATUSES, type ItemStatus } from "../../../shared/resale";
import { formatShortDate, localDate } from "../../tasks/dates";
import { ItemSheet } from "../components/ItemSheet";
import { PlatformsSheet } from "../components/PlatformsSheet";
import { type Item, useItems } from "../queries";
import { heldFor, STATUS_TONES, stockSummary } from "../stock";

type Filter = "all" | ItemStatus;

export function ResalePage() {
  const items = useItems();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const today = localDate(useNow());
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const openItemId = Number(params.get("item")) || null;

  const all = items.data ?? [];
  const shown = filter === "all" ? all : all.filter((item) => item.status === filter);
  const categories = [...new Set(all.map((item) => item.category).filter(Boolean))].sort();
  const openItem = all.find((item) => item.id === openItemId) ?? null;

  // Opening an item adds a history entry so the phone's back gesture closes the sheet.
  const openItemSheet = (id: number) => {
    const next = new URLSearchParams(params);
    next.set("item", String(id));
    navigate({ search: next.toString() }, { state: { sheet: true } });
  };
  const closeItemSheet = () => {
    if (adding) {
      setAdding(false);
      return;
    }
    if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete("item");
      setParams(next, { replace: true });
    }
  };

  return (
    <>
      <PageHeader title="Resale" subtitle={items.data ? stockSummary(all) : undefined} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="size-5" />
          Add item
        </button>
        <button type="button" className={secondaryButton} onClick={() => setManaging(true)}>
          <Store aria-hidden="true" className="size-4" />
          Platforms
        </button>
      </div>

      {items.isPending ? (
        <LoadingRows rows={3} />
      ) : items.isError ? (
        <ErrorNote error={items.error} onRetry={() => void items.refetch()} />
      ) : all.length === 0 ? (
        <Panel
          title="Start tracking"
          description="Add the places you buy and sell, then the first item you picked up."
        >
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-5" />
              Add item
            </button>
            <button type="button" className={secondaryButton} onClick={() => setManaging(true)}>
              <Store aria-hidden="true" className="size-4" />
              Add platforms
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <StatusFilter items={all} value={filter} onChange={setFilter} />
          {shown.length === 0 ? (
            <p className="rounded-tile bg-mantle p-5 text-muted ring-1 ring-surface-0/60">
              No items are {ITEM_STATUS_LABELS[filter as ItemStatus].toLowerCase()} right now.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {shown.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} today={today} onOpen={() => openItemSheet(item.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ItemSheet
        target={adding ? "new" : openItem}
        categories={categories}
        onClose={closeItemSheet}
        onManagePlatforms={() => setManaging(true)}
      />
      <PlatformsSheet open={managing} onClose={() => setManaging(false)} />
    </>
  );
}

/** One chip per status with its count. Scrolls sideways on phones. */
function StatusFilter({
  items,
  value,
  onChange,
}: {
  items: Item[];
  value: Filter;
  onChange: (filter: Filter) => void;
}) {
  const counts = new Map<Filter, number>([["all", items.length]]);
  for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  const options: Array<[Filter, string]> = [
    ["all", "All"],
    ...ITEM_STATUSES.map((status): [Filter, string] => [status, ITEM_STATUS_LABELS[status]]),
  ];
  return (
    // relative: the radios are positioned inside the scroller, not the page. min-w-0:
    // a fieldset otherwise grows to fit its content and widens the page on phones.
    <fieldset className="relative -mx-4 mb-4 min-w-0 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <legend className="sr-only">Show</legend>
      <div className="flex w-max gap-2">
        {options.map(([filter, label]) => (
          <label key={filter} className="relative shrink-0">
            <input
              type="radio"
              name="item-status"
              value={filter}
              checked={value === filter}
              onChange={() => onChange(filter)}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
            />
            <span className="pointer-events-none flex h-11 items-center gap-2 rounded-full bg-mantle px-4 text-sm font-semibold text-muted ring-1 ring-surface-0/60 peer-checked:bg-surface-0 peer-checked:text-fg peer-checked:ring-surface-1 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
              {label}
              <span className="tabular-nums text-faint">{counts.get(filter) ?? 0}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ItemCard({ item, today, onOpen }: { item: Item; today: string; onOpen: () => void }) {
  const held = heldFor(item, today);
  const bought = [
    item.purchasedOn ? `Bought ${formatShortDate(item.purchasedOn, today)}` : null,
    item.purchasePlatform?.name,
    item.purchaseFrom || null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-tile bg-mantle p-4 text-left ring-1 ring-surface-0/60 hover:ring-surface-1"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-semibold break-words text-fg">{item.title}</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            item.purchaseCents === null ? "text-faint" : "text-fg"
          }`}
        >
          {item.purchaseCents === null ? "No price" : formatCents(item.purchaseCents)}
        </span>
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <StatusDot tone={STATUS_TONES[item.status]} />
          {ITEM_STATUS_LABELS[item.status]}
        </span>
        {item.category ? <span className="text-muted">{item.category}</span> : null}
        {item.condition ? <span className="text-muted">{item.condition}</span> : null}
        {held ? <span className="text-muted">{held}</span> : null}
      </span>
      {bought.length > 0 ? (
        <span className="mt-1 block text-sm break-words text-muted">{bought.join(" · ")}</span>
      ) : null}
    </button>
  );
}
