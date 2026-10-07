import { useId } from "react";
import { inputClass, labelClass } from "../../../client/components/ui";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { type IncomeSet, tithingOwed } from "../../../shared/tithing";

/** Whether tithing applies to money in, and the amount to figure it on. */
export type ChoiceDraft = {
  applies: boolean;
  /** Tithe on a different amount instead of the whole one. */
  custom: boolean;
  /** That amount as typed, in dollars. */
  base: string;
};

export const defaultChoice = (applies = true): ChoiceDraft => ({
  applies,
  custom: false,
  base: "",
});

/** The draft for money in that Hub already has a choice (or default) for. */
export function choiceOf(facts: {
  applies: boolean;
  customBase: boolean;
  baseCents: number;
}): ChoiceDraft {
  return {
    applies: facts.applies,
    custom: facts.customBase,
    base: facts.customBase ? centsToInput(facts.baseCents) : "",
  };
}

/** The amount typed for a different base, or null when it can't be read. */
export const customCents = (draft: ChoiceDraft): number | null =>
  draft.custom ? parseDollars(draft.base) : null;

/** Whether the draft can be saved: a different amount has to be an amount. */
export const choiceReady = (draft: ChoiceDraft): boolean =>
  !draft.applies || !draft.custom || customCents(draft) !== null;

/** The request for a draft, or null when it isn't ready. */
export function choiceInput(draft: ChoiceDraft): IncomeSet | null {
  if (!choiceReady(draft)) return null;
  return { applies: draft.applies, baseCents: draft.applies ? customCents(draft) : null };
}

/** Whether two drafts mean the same thing. */
export const sameChoice = (a: ChoiceDraft, b: ChoiceDraft): boolean =>
  a.applies === b.applies &&
  (!a.applies || (a.custom === b.custom && (!a.custom || a.base.trim() === b.base.trim())));

/**
 * The tithing switch for a money-in transaction: on or off, and for partial amounts,
 * the amount it's figured on (just the profit from a sale, or gross pay).
 */
export function TithingChoice({
  draft,
  onChange,
  wholeCents,
  tried = false,
  profit = false,
}: {
  draft: ChoiceDraft;
  onChange: (next: ChoiceDraft) => void;
  /** The amount tithing is figured on without a different one. */
  wholeCents: number | null;
  tried?: boolean;
  /** The whole amount is a sale's profit, not the deposit. */
  profit?: boolean;
}) {
  const ids = useId();
  const typed = customCents(draft);
  const baseCents = draft.custom ? typed : wholeCents;
  const invalid = tried && draft.applies && draft.custom && typed === null;
  return (
    <fieldset className="min-w-0 space-y-4 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <legend className="sr-only">Tithing</legend>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="min-w-0">
          <span className="block font-semibold text-fg">Tithing applies</span>
          <span className="block text-sm text-muted">
            {draft.applies
              ? baseCents === null
                ? "Pay a tenth of what you earned."
                : `Tithing is ${formatCents(tithingOwed(baseCents))}.`
              : "Not counted as income you pay tithing on."}
          </span>
        </span>
        <input
          type="checkbox"
          checked={draft.applies}
          onChange={(event) => onChange({ ...draft, applies: event.target.checked })}
          className="size-6 shrink-0 accent-accent"
        />
      </label>
      {draft.applies ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name={`${ids}-base`}
                checked={!draft.custom}
                onChange={() => onChange({ ...draft, custom: false })}
                className="size-5 accent-accent"
              />
              <span className="text-fg">
                {profit ? "The sale's profit" : "All of it"}
                {wholeCents === null ? "" : ` (${formatCents(wholeCents)})`}
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name={`${ids}-base`}
                checked={draft.custom}
                onChange={() => onChange({ ...draft, custom: true })}
                className="size-5 accent-accent"
              />
              <span className="text-fg">Only part of it</span>
            </label>
          </div>
          {draft.custom ? (
            <div>
              <label htmlFor={`${ids}-amount`} className={labelClass}>
                Pay tithing on
              </label>
              <input
                id={`${ids}-amount`}
                value={draft.base}
                onChange={(event) => onChange({ ...draft, base: event.target.value })}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-invalid={invalid}
                aria-describedby={`${ids}-hint`}
                className={`${inputClass} tabular-nums`}
              />
              <p
                id={`${ids}-hint`}
                className={`mt-1.5 text-sm ${invalid ? "text-danger" : "text-muted"}`}
              >
                {invalid
                  ? "Enter an amount like 400 or 400.50."
                  : "Like only the profit from a sale, or gross pay before taxes."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
