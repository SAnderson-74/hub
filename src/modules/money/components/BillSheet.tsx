import { type FormEvent, useEffect, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { dangerButton, inputClass, labelClass, primaryButton } from "../../../client/components/ui";
import {
  BILL_FREQUENCIES,
  BILL_FREQUENCY_LABELS,
  BILL_KIND_LABELS,
  BILL_KINDS,
  type BillFrequency,
  type BillKind,
} from "../../../shared/bills";
import { centsToInput, parseDollars } from "../../../shared/money";
import {
  type Account,
  type Bill,
  type BillSuggestion,
  type Category,
  useCreateBill,
  useDeleteBill,
  useUpdateBill,
} from "../queries";

/** A new bill, one to edit, or a suggestion to confirm. */
export type BillTarget =
  | { mode: "new" }
  | { mode: "edit"; bill: Bill }
  | { mode: "confirm"; suggestion: BillSuggestion }
  | null;

type Draft = {
  name: string;
  kind: BillKind;
  amount: string;
  frequency: BillFrequency;
  nextDate: string;
  accountId: string;
  categoryId: string;
};

function draftFor(target: Exclude<BillTarget, null>, today: string): Draft {
  if (target.mode === "new") {
    return {
      name: "",
      kind: "bill",
      amount: "",
      frequency: "monthly",
      nextDate: today,
      accountId: "",
      categoryId: "",
    };
  }
  const item = target.mode === "edit" ? target.bill : target.suggestion;
  return {
    name: item.name,
    kind: item.kind,
    amount: centsToInput(item.amountCents),
    frequency: item.frequency,
    nextDate: item.nextDate,
    accountId: item.accountId === null ? "" : String(item.accountId),
    categoryId: item.categoryId === null ? "" : String(item.categoryId),
  };
}

export function BillSheet({
  bookId,
  target,
  accounts,
  categories,
  today,
  onClose,
  onSaved,
}: {
  bookId: number;
  target: BillTarget;
  accounts: Account[];
  categories: Category[];
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const ids = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const create = useCreateBill();
  const update = useUpdateBill();
  const remove = useDeleteBill();
  // A fresh form each time the sheet opens for something.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets when the target changes, not on each render
  useEffect(() => {
    setDraft(target ? draftFor(target, today) : null);
    create.reset();
    update.reset();
    remove.reset();
  }, [target, today]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const cents = draft ? parseDollars(draft.amount) : null;
  const valid =
    draft !== null &&
    draft.name.trim() !== "" &&
    cents !== null &&
    cents > 0 &&
    draft.nextDate !== "";
  const error = create.error ?? update.error ?? remove.error;
  const busy = create.isPending || update.isPending || remove.isPending;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!target || !draft || !valid || cents === null) return;
    const fields = {
      name: draft.name.trim(),
      kind: draft.kind,
      amountCents: cents,
      frequency: draft.frequency,
      nextDate: draft.nextDate,
      accountId: draft.accountId === "" ? null : Number(draft.accountId),
      categoryId: draft.categoryId === "" ? null : Number(draft.categoryId),
    };
    if (target.mode === "edit") {
      update.mutate(
        { id: target.bill.id, patch: fields },
        { onSuccess: () => onSaved(`Saved ${fields.name}.`) },
      );
    } else {
      create.mutate(
        {
          bookId,
          ...fields,
          matchKey: target.mode === "confirm" ? target.suggestion.matchKey : null,
        },
        { onSuccess: () => onSaved(`Added ${fields.name}.`) },
      );
    }
  };

  const title =
    target?.mode === "edit"
      ? "Edit bill"
      : target?.mode === "confirm"
        ? "Confirm bill"
        : "Add a bill";
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={title}
      description={
        target?.mode === "confirm"
          ? `Found from ${target.suggestion.count} payments. Check the details, then add it.`
          : "Bills, subscriptions, and income that come on a schedule."
      }
    >
      {draft ? (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor={`${ids}-name`} className={labelClass}>
              Name
            </label>
            <input
              id={`${ids}-name`}
              value={draft.name}
              maxLength={100}
              onChange={(event) => set("name", event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${ids}-kind`} className={labelClass}>
                Kind
              </label>
              <select
                id={`${ids}-kind`}
                value={draft.kind}
                onChange={(event) => set("kind", event.target.value as BillKind)}
                className={inputClass}
              >
                {BILL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {BILL_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-amount`} className={labelClass}>
                Usual amount
              </label>
              <input
                id={`${ids}-amount`}
                inputMode="decimal"
                value={draft.amount}
                placeholder="0.00"
                onChange={(event) => set("amount", event.target.value)}
                aria-invalid={draft.amount !== "" && (cents === null || cents <= 0)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-frequency`} className={labelClass}>
                How often
              </label>
              <select
                id={`${ids}-frequency`}
                value={draft.frequency}
                onChange={(event) => set("frequency", event.target.value as BillFrequency)}
                className={inputClass}
              >
                {BILL_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {BILL_FREQUENCY_LABELS[frequency]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-next`} className={labelClass}>
                Next date
              </label>
              <input
                id={`${ids}-next`}
                type="date"
                value={draft.nextDate}
                onChange={(event) => set("nextDate", event.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${ids}-account`} className={labelClass}>
              Account
            </label>
            <select
              id={`${ids}-account`}
              value={draft.accountId}
              onChange={(event) => set("accountId", event.target.value)}
              aria-describedby={`${ids}-account-hint`}
              className={inputClass}
            >
              <option value="">No account</option>
              {accounts
                .filter((account) => !account.archived || String(account.id) === draft.accountId)
                .map((account) => (
                  <option key={account.id} value={String(account.id)}>
                    {account.name}
                  </option>
                ))}
            </select>
            <p id={`${ids}-account-hint`} className="mt-1.5 text-sm text-muted">
              The forecast counts it against this account.
            </p>
          </div>
          <div>
            <label htmlFor={`${ids}-category`} className={labelClass}>
              Category
            </label>
            <select
              id={`${ids}-category`}
              value={draft.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {categories
                .filter(
                  (category) => !category.archived || String(category.id) === draft.categoryId,
                )
                .map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton} disabled={!valid || busy}>
              {target?.mode === "edit" ? "Save bill" : "Add bill"}
            </button>
            {target?.mode === "edit" ? (
              <button
                type="button"
                className={dangerButton}
                disabled={busy}
                onClick={() =>
                  remove.mutate(target.bill.id, {
                    onSuccess: () => onSaved(`Deleted ${target.bill.name}.`),
                  })
                }
              >
                Delete bill
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </Sheet>
  );
}
