import { History } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import { inputClass, labelClass, secondaryButton } from "../../../client/components/ui";
import {
  historyInputs,
  maxOffer,
  type OfferInput,
  parsePercent,
  profitAt,
  type SalesHistory,
  salesHistory,
} from "../../../shared/buyCalculator";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { formatMargin, formatSigned, itemProfit } from "../../../shared/profit";
import { type Item, useItems } from "../queries";

type Draft = {
  sale: string;
  marginPercent: string;
  feePercent: string;
  fixedFee: string;
  repair: string;
  asking: string;
};

/** Fees and margin change rarely, so this device remembers them. */
const STORE_KEY = "hub.resale.calculator";
type Stored = Pick<Draft, "marginPercent" | "feePercent" | "fixedFee">;

function initialDraft(): Draft {
  const draft: Draft = {
    sale: "",
    marginPercent: "30",
    feePercent: "",
    fixedFee: "",
    repair: "",
    asking: "",
  };
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Stored>;
    for (const key of ["marginPercent", "feePercent", "fixedFee"] as const) {
      if (typeof stored[key] === "string") draft[key] = stored[key];
    }
  } catch {
    // Nothing stored, or storage is off: start from the defaults.
  }
  return draft;
}

/** Blank counts as zero. undefined means unreadable. */
function money(text: string): number | undefined {
  return text.trim() === "" ? 0 : (parseDollars(text) ?? undefined);
}

function percent(text: string): number | undefined {
  return text.trim() === "" ? 0 : (parsePercent(text) ?? undefined);
}

/**
 * The buy calculator: the most to pay for an item so that, after fees and repair,
 * selling it at the expected price still makes the target margin. Suggestions come
 * from similar items you've sold.
 */
export function BuyCalculator() {
  const [draft, setDraft] = useState(initialDraft);
  const [filled, setFilled] = useState("");
  const ids = useId();

  useEffect(() => {
    const stored: Stored = {
      marginPercent: draft.marginPercent,
      feePercent: draft.feePercent,
      fixedFee: draft.fixedFee,
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch {
      // Private browsing; the numbers still apply to this visit.
    }
  }, [draft.marginPercent, draft.feePercent, draft.fixedFee]);

  const set = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFilled("");
  };

  const sale = draft.sale.trim() === "" ? null : money(draft.sale);
  const marginPercent = percent(draft.marginPercent);
  const feePercent = percent(draft.feePercent);
  const fixedFeeCents = money(draft.fixedFee);
  const repairCents = money(draft.repair);
  const asking = draft.asking.trim() === "" ? null : money(draft.asking);
  const errors: Partial<Record<keyof Draft, string>> = {
    sale: sale === undefined ? "Use an amount like 150 or 149.99." : undefined,
    marginPercent:
      marginPercent === undefined || marginPercent >= 100
        ? "Use a percent from 0 to 99, like 30."
        : undefined,
    feePercent: feePercent === undefined ? "Use a percent from 0 to 100, like 13." : undefined,
    fixedFee: fixedFeeCents === undefined ? "Use an amount like 8.50." : undefined,
    repair: repairCents === undefined ? "Use an amount like 20." : undefined,
    asking: asking === undefined ? "Use an amount like 40." : undefined,
  };
  const input: OfferInput | null =
    sale !== null &&
    sale !== undefined &&
    marginPercent !== undefined &&
    marginPercent < 100 &&
    feePercent !== undefined &&
    fixedFeeCents !== undefined &&
    repairCents !== undefined
      ? { saleCents: sale, marginPercent, feePercent, fixedFeeCents, repairCents }
      : null;

  const fillIn = (history: SalesHistory) => {
    const suggested = historyInputs(history);
    setDraft((current) => ({
      ...current,
      sale: suggested.saleCents === undefined ? current.sale : centsToInput(suggested.saleCents),
      feePercent:
        suggested.feePercent === undefined ? current.feePercent : String(suggested.feePercent),
      fixedFee:
        suggested.fixedFeeCents === undefined
          ? current.fixedFee
          : centsToInput(suggested.fixedFeeCents),
      repair:
        suggested.repairCents === undefined ? current.repair : centsToInput(suggested.repairCents),
      marginPercent:
        suggested.marginPercent === undefined
          ? current.marginPercent
          : String(suggested.marginPercent),
    }));
    setFilled(
      `Filled in from ${history.sales} ${history.sales === 1 ? "sale" : "sales"}. Change any number to fit this item.`,
    );
  };

  const field = (key: keyof Draft, label: string, placeholder: string) => (
    <div className="flex min-w-0 flex-col">
      <label htmlFor={`${ids}-${key}`} className={labelClass}>
        {label}
      </label>
      <input
        id={`${ids}-${key}`}
        value={draft[key]}
        onChange={(event) => set(key, event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={errors[key] !== undefined}
        aria-describedby={errors[key] ? `${ids}-${key}-error` : undefined}
        className={`${inputClass} mt-auto tabular-nums`}
      />
      {errors[key] ? (
        <p id={`${ids}-${key}-error`} className="mt-1.5 text-sm text-danger">
          {errors[key]}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <Panel
        title="Buy calculator"
        description="The most to pay so a sale still makes your target margin."
        className="lg:col-span-7"
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          {field("sale", "Expected price", "150")}
          {field("marginPercent", "Target margin (%)", "30")}
          {field("feePercent", "Fees (% of sale)", "0")}
          {field("fixedFee", "Flat fees and shipping", "0.00")}
          {field("repair", "Repair and parts", "0.00")}
          {field("asking", "Asking price", "Optional")}
        </div>
        <div className="mt-5">
          {input ? (
            <OfferResult input={input} askingCents={asking ?? null} />
          ) : (
            <p className="rounded-tile bg-base/80 p-4 text-muted ring-1 ring-surface-0/50">
              {sale === null
                ? "Enter the price you expect it to sell for to see your max offer."
                : "Fix the numbers marked in red to see your max offer."}
            </p>
          )}
        </div>
      </Panel>
      <HistoryPanel onFill={fillIn} filled={filled} />
    </div>
  );
}

function Row({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 ${strong ? "font-bold text-fg" : "text-muted"}`}
    >
      <dt className="min-w-0">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

function OfferResult({ input, askingCents }: { input: OfferInput; askingCents: number | null }) {
  const offer = maxOffer(input);
  const fits = offer.maxOfferCents > 0;
  const beforeProfit = input.saleCents - offer.feesCents - input.repairCents;
  const feeNote = [
    input.feePercent > 0 ? `${input.feePercent}%` : "",
    input.fixedFeeCents > 0 ? formatCents(input.fixedFeeCents) : "",
  ]
    .filter(Boolean)
    .join(" + ");
  const atAsking = askingCents === null ? null : profitAt(input, askingCents);

  return (
    <div className="rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      {fits ? (
        <>
          <p className="text-sm font-semibold text-muted">Offer up to</p>
          <p className="mt-1 text-4xl font-bold tracking-[-0.02em] text-fg tabular-nums">
            {formatCents(offer.maxOfferCents)}
          </p>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-lg font-bold text-danger">
            <StatusDot tone="danger" />
            No offer makes your margin
          </p>
          <p className="mt-1 text-sm text-muted">
            After fees and repair, {formatSigned(beforeProfit)} is left, less than the{" "}
            {formatCents(offer.profitCents)} a {input.marginPercent}% margin needs. Lower the margin
            or look for a higher price.
          </p>
        </>
      )}

      <dl className="mt-4 divide-y divide-surface-0 text-sm">
        <Row label="Sells for" value={formatCents(input.saleCents)} />
        <Row
          label={feeNote ? `Fees (${feeNote})` : "Fees"}
          value={formatSigned(-offer.feesCents)}
        />
        <Row label="Repair and parts" value={formatSigned(-input.repairCents)} />
        <Row label={`Profit at ${input.marginPercent}%`} value={formatSigned(-offer.profitCents)} />
        <Row label="Max offer" value={formatSigned(offer.maxOfferCents)} strong />
      </dl>

      {askingCents !== null && atAsking ? (
        <p
          className={`mt-4 flex items-start gap-2 text-sm font-semibold ${
            askingCents <= offer.maxOfferCents ? "text-ok" : "text-warn"
          }`}
        >
          <span className="flex h-5 items-center">
            <StatusDot tone={askingCents <= offer.maxOfferCents ? "ok" : "warn"} />
          </span>
          <span>
            {askingCents <= offer.maxOfferCents
              ? `Within your max offer. At ${formatCents(askingCents)}: `
              : `${formatCents(askingCents - Math.max(offer.maxOfferCents, 0))} over your max offer. At ${formatCents(askingCents)}: `}
            {formatSigned(atAsking.profitCents)} profit, a {formatMargin(atAsking.margin)} margin.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Sale platforms of your sold items, for the history filter. */
function soldPlatforms(items: Item[]) {
  const byId = new Map<number, string>();
  for (const item of items) {
    if (item.salePlatform && itemProfit(item))
      byId.set(item.salePlatform.id, item.salePlatform.name);
  }
  return [...byId].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

function HistoryPanel({
  onFill,
  filled,
}: {
  onFill: (history: SalesHistory) => void;
  filled: string;
}) {
  const items = useItems();
  const [query, setQuery] = useState("");
  const [platformId, setPlatformId] = useState<number | null>(null);
  const ids = useId();

  const all = items.data ?? [];
  const platforms = soldPlatforms(all);
  const everySale = salesHistory(all, { query: "", platformId: null });
  const history = salesHistory(all, { query, platformId });
  const count = (n: number) => `${n} ${n === 1 ? "sale" : "sales"}`;
  const none = "None recorded";

  return (
    <Panel
      title="Your history"
      description="Typical numbers (the middle value) from items you've sold."
      className="lg:col-span-5"
    >
      {items.isPending ? (
        <LoadingRows rows={3} />
      ) : items.isError ? (
        <ErrorNote error={items.error} onRetry={() => void items.refetch()} />
      ) : everySale.sales === 0 ? (
        <p className="text-muted">
          Once you've sold something with a sale price, typical prices, fees, and margins show here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="min-w-0">
              <label htmlFor={`${ids}-query`} className={labelClass}>
                Similar items
              </label>
              <input
                id={`${ids}-query`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title or category"
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${ids}-platform`} className={labelClass}>
                Sold on
              </label>
              <select
                id={`${ids}-platform`}
                value={platformId ?? ""}
                onChange={(event) =>
                  setPlatformId(event.target.value === "" ? null : Number(event.target.value))
                }
                className={inputClass}
              >
                <option value="">Any platform</option>
                {platforms.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {history.sales === 0 ? (
            <p className="mt-4 text-muted">No sales match. Try a shorter word or any platform.</p>
          ) : (
            <>
              <p className="mt-4 font-semibold text-fg">
                {history.sales === everySale.sales && query.trim() === "" && platformId === null
                  ? `All ${count(history.sales)}`
                  : `${count(history.sales)} match`}
              </p>
              <dl className="mt-1 divide-y divide-surface-0 text-sm">
                <Row
                  label="Sold for"
                  value={
                    history.medianSaleCents === null ? none : formatCents(history.medianSaleCents)
                  }
                />
                <Row
                  label={
                    history.pricedSales < history.sales
                      ? `Margin (${history.pricedSales} with a price paid)`
                      : "Margin"
                  }
                  value={
                    history.medianMargin === null
                      ? "No price paid"
                      : formatMargin(history.medianMargin)
                  }
                />
                <Row
                  label="Fees"
                  value={history.feePercent === null ? none : `${history.feePercent}% of sale`}
                />
                <Row
                  label="Shipping"
                  value={
                    history.medianShippingCents === null
                      ? none
                      : formatCents(history.medianShippingCents)
                  }
                />
                <Row
                  label="Repair and parts"
                  value={
                    history.medianRepairCents === null
                      ? none
                      : formatCents(history.medianRepairCents)
                  }
                />
                <Row
                  label="Held"
                  value={
                    history.medianDaysHeld === null
                      ? "Unknown"
                      : `${history.medianDaysHeld} ${history.medianDaysHeld === 1 ? "day" : "days"}`
                  }
                />
              </dl>
              <button
                type="button"
                className={`${secondaryButton} mt-4`}
                onClick={() => onFill(history)}
              >
                <History aria-hidden="true" className="size-4" />
                Fill in from history
              </button>
            </>
          )}
        </>
      )}
      <p aria-live="polite" className="mt-3 text-sm text-ok empty:hidden">
        {filled}
      </p>
    </Panel>
  );
}
