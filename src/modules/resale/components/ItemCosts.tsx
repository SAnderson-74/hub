import { Plus, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { iconButton, inputClass } from "../../../client/components/ui";
import { formatCents, parseDollars } from "../../../shared/money";
import { COST_KIND_LABELS, COST_KINDS, type CostKind } from "../../../shared/resale";
import { formatShortDate, localDate } from "../../tasks/dates";
import { type Item, useAddCost, useDeleteCost } from "../queries";
import { costSummary } from "../stock";

/** Parts, fees, shipping, and supplies spent on one item. For the item sheet. */
export function ItemCosts({ item }: { item: Item }) {
  const headingId = useId();
  const ids = useId();
  const add = useAddCost();
  const remove = useDeleteCost();
  const today = localDate();
  const [kind, setKind] = useState<CostKind>("parts");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState("");
  const cents = amount.trim() === "" ? null : parseDollars(amount);
  const amountInvalid = amount.trim() !== "" && cents === null;
  const error = add.error ?? remove.error;

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    if (cents === null) return;
    const json = { kind, label: label.trim(), amountCents: cents, spentOn: spentOn || null };
    // Clear now so the next cost can be typed while this one saves.
    setLabel("");
    setAmount("");
    add.mutate(
      { itemId: item.id, json },
      {
        onError: () => {
          setLabel((current) => current || json.label);
          setAmount((current) => current || amount);
        },
      },
    );
  };

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <h3 id={headingId} className="font-semibold text-fg">
        Costs
      </h3>
      <p className="text-sm text-muted">{costSummary(item)}</p>

      {item.costs.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {item.costs.map((cost) => {
            const name = cost.label
              ? `${COST_KIND_LABELS[cost.kind]}: ${cost.label}`
              : COST_KIND_LABELS[cost.kind];
            return (
              <li
                key={cost.id}
                className="flex items-center gap-2 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50"
              >
                <span className="min-w-0 flex-1 py-2">
                  <span className="block font-semibold break-words text-fg">{name}</span>
                  {cost.spentOn ? (
                    <span className="block text-sm text-muted">
                      {formatShortDate(cost.spentOn, today)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold text-fg tabular-nums">
                  {formatCents(cost.amountCents)}
                </span>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Delete cost ${name}, ${formatCents(cost.amountCents)}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(cost.id)}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form onSubmit={onAdd} className="mt-3 space-y-2" noValidate>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as CostKind)}
            aria-label="Cost type"
            className={inputClass}
          >
            {COST_KINDS.map((option) => (
              <option key={option} value={option}>
                {COST_KIND_LABELS[option]}
              </option>
            ))}
          </select>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Cost amount"
            aria-invalid={amountInvalid}
            aria-describedby={amountInvalid ? `${ids}-amount-error` : undefined}
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
            placeholder="What for (optional)"
            aria-label="What the cost was for"
            className={`${inputClass} min-w-0`}
          />
          <button
            type="submit"
            aria-label="Add cost"
            disabled={cents === null || add.isPending}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-0 text-fg hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>
        <label className="flex items-center gap-3 text-sm text-muted">
          <span className="shrink-0">Date (optional)</span>
          <input
            type="date"
            value={spentOn}
            onChange={(event) => setSpentOn(event.target.value)}
            aria-label="Cost date"
            className={`${inputClass} h-11 min-w-0 [color-scheme:dark]`}
          />
        </label>
        {amountInvalid ? (
          <p id={`${ids}-amount-error`} className="text-sm text-danger">
            Use an amount like 12.50.
          </p>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}
