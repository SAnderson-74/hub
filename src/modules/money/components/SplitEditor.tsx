import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import {
  ghostButton,
  iconButton,
  inputClass,
  labelClass,
  secondaryButton,
} from "../../../client/components/ui";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "../../../shared/books";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import type { Category, Transaction } from "../queries";

/** One part of a split, as typed: the amount is positive, in the transaction's direction. */
export type PartDraft = { key: number; categoryId: string; amount: string; memo: string };

let nextKey = 1;

export const newPart = (categoryId = "", amount = ""): PartDraft => ({
  key: nextKey++,
  categoryId,
  amount,
  memo: "",
});

/** A split transaction's parts for the form, or null when it isn't split. */
export function partsOf(transaction: Transaction | null): PartDraft[] | null {
  if (!transaction || transaction.splits.length === 0) return null;
  return transaction.splits.map((part) => ({
    key: nextKey++,
    categoryId: part.category ? String(part.category.id) : "",
    amount: centsToInput(Math.abs(part.amountCents)),
    memo: part.memo,
  }));
}

/** What's left to split: the whole amount less the parts so far, or null if one isn't a number. */
export function leftToSplit(parts: readonly PartDraft[], totalCents: number | null): number | null {
  if (totalCents === null) return null;
  let left = totalCents;
  for (const part of parts) {
    // An empty part counts as nothing yet; a part that isn't a number can't be counted.
    if (part.amount.trim() === "") continue;
    const cents = parseDollars(part.amount);
    if (cents === null) return null;
    left -= cents;
  }
  return left;
}

/** Why the parts can't be saved yet, or null when they can. */
export function splitProblem(
  parts: readonly PartDraft[],
  totalCents: number | null,
): string | null {
  if (parts.some((part) => part.categoryId === "")) return "Pick a category for each part.";
  if (parts.some((part) => (parseDollars(part.amount) ?? 0) <= 0)) {
    return "Give each part an amount like 12.50.";
  }
  const left = leftToSplit(parts, totalCents);
  if (left === null) return "Enter the whole amount first.";
  if (left !== 0) {
    return left > 0
      ? `${formatCents(left)} is left to split. Make the parts add up to the whole amount.`
      : `The parts are ${formatCents(-left)} more than the whole amount.`;
  }
  return null;
}

/**
 * The parts of one charge in several categories: each with a category, an amount, and
 * an optional note. They add up to the transaction.
 */
export function SplitEditor({
  parts,
  onChange,
  categories,
  kind,
  totalCents,
  tried,
  onUnsplit,
}: {
  parts: PartDraft[];
  onChange: (parts: PartDraft[]) => void;
  categories: Category[];
  /** Money in lists income categories first. */
  kind: "in" | "out";
  totalCents: number | null;
  tried: boolean;
  onUnsplit: () => void;
}) {
  const ids = useId();
  const left = leftToSplit(parts, totalCents);
  const problem = splitProblem(parts, totalCents);
  const set = (key: number, patch: Partial<PartDraft>) =>
    onChange(parts.map((part) => (part.key === key ? { ...part, ...patch } : part)));
  const choices = (current: string) =>
    categories.filter((category) => !category.archived || String(category.id) === current);

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${ids}-title`} className="font-semibold text-fg">
          Split into categories
        </h3>
        <button type="button" className={ghostButton} onClick={onUnsplit}>
          Don't split
        </button>
      </div>
      <ul className="space-y-3">
        {parts.map((part, index) => {
          const prefix = `${ids}-part-${part.key}`;
          return (
            <li
              key={part.key}
              className="space-y-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50"
            >
              <div className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="min-w-0 sm:col-span-2">
                    <label htmlFor={`${prefix}-category`} className={labelClass}>
                      Part {index + 1} category
                    </label>
                    <select
                      id={`${prefix}-category`}
                      value={part.categoryId}
                      onChange={(event) => set(part.key, { categoryId: event.target.value })}
                      aria-invalid={tried && part.categoryId === ""}
                      className={inputClass}
                    >
                      <option value="">Pick a category</option>
                      {(kind === "in" ? [...CATEGORY_KINDS].reverse() : CATEGORY_KINDS).map(
                        (categoryKind) => {
                          const options = choices(part.categoryId).filter(
                            (category) => category.kind === categoryKind,
                          );
                          return options.length === 0 ? null : (
                            <optgroup key={categoryKind} label={CATEGORY_KIND_LABELS[categoryKind]}>
                              {options.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </optgroup>
                          );
                        },
                      )}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`${prefix}-amount`} className={labelClass}>
                      Part {index + 1} amount
                    </label>
                    <input
                      id={`${prefix}-amount`}
                      value={part.amount}
                      onChange={(event) => set(part.key, { amount: event.target.value })}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      aria-invalid={tried && (parseDollars(part.amount) ?? 0) <= 0}
                      className={`${inputClass} tabular-nums`}
                    />
                  </div>
                </div>
                {parts.length > 2 ? (
                  <button
                    type="button"
                    className={`${iconButton} mt-7`}
                    aria-label={`Remove part ${index + 1}`}
                    onClick={() => onChange(parts.filter((item) => item.key !== part.key))}
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </button>
                ) : null}
              </div>
              <div>
                <label htmlFor={`${prefix}-memo`} className="sr-only">
                  Part {index + 1} note
                </label>
                <input
                  id={`${prefix}-memo`}
                  value={part.memo}
                  onChange={(event) => set(part.key, { memo: event.target.value })}
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Note (optional), like what it was"
                  className={inputClass}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className={secondaryButton}
          disabled={parts.length >= 30}
          onClick={() =>
            onChange([...parts, newPart("", left !== null && left > 0 ? centsToInput(left) : "")])
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Add a part
        </button>
        <p
          className={`text-sm tabular-nums ${
            left === 0 ? "text-muted" : tried && problem ? "text-danger" : "text-muted"
          }`}
        >
          {left === null
            ? "Enter the amounts to see what's left."
            : left === 0
              ? "The parts add up."
              : left > 0
                ? `${formatCents(left)} left to split`
                : `${formatCents(-left)} over`}
        </p>
      </div>
      {tried && problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
