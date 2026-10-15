import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { inputClass, labelClass, primaryButton } from "../../../client/components/ui";
import { centsToInput, parseDollars } from "../../../shared/money";
import { type BudgetMonth, useSetBudgetSettings } from "../queries";

type Row = BudgetMonth["categories"][number];

const REPEATS = [
  ["", "Once"],
  ["6", "Every 6 months"],
  ["12", "Every year"],
] as const;

/** Whether a category carries what's left into next month, and what it's saving up for. */
export function BudgetSettingsSheet({
  row,
  month,
  today,
  onClose,
  onSaved,
}: {
  row: Row | null;
  month: string;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title="Carry over and save up"
      description={row ? row.name : undefined}
    >
      {row ? (
        <SettingsForm key={row.id} row={row} month={month} today={today} onSaved={onSaved} />
      ) : null}
    </Sheet>
  );
}

function SettingsForm({
  row,
  month,
  today,
  onSaved,
}: {
  row: Row;
  month: string;
  today: string;
  onSaved: (message: string) => void;
}) {
  const ids = useId();
  const save = useSetBudgetSettings();
  const [rollover, setRollover] = useState(row.rollover);
  const [saving, setSaving] = useState(row.goal !== null);
  const [amount, setAmount] = useState(row.goal ? centsToInput(row.goal.cents) : "");
  const [dueDate, setDueDate] = useState(row.goal?.dueDate ?? "");
  const [repeat, setRepeat] = useState(row.goal?.everyMonths ? String(row.goal.everyMonths) : "");
  const [tried, setTried] = useState(false);
  const cents = parseDollars(amount);
  const amountBad = saving && (cents === null || cents < 100);
  const dateBad = saving && dueDate === "";

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (amountBad || dateBad) return;
    save.mutate(
      {
        categoryId: row.id,
        month,
        rollover: rollover || saving,
        goal:
          saving && cents !== null
            ? { cents, dueDate, everyMonths: repeat === "" ? null : (Number(repeat) as 6 | 12) }
            : null,
      },
      { onSuccess: () => onSaved(`Settings saved for ${row.name}`) },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={rollover || saving}
          disabled={saving}
          onChange={(event) => setRollover(event.target.checked)}
          aria-describedby={`${ids}-rollover-hint`}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <span>
          <span className="block font-semibold text-fg">Carry what's left into next month</span>
          <span id={`${ids}-rollover-hint`} className="block text-sm text-muted">
            {saving
              ? "Saving up needs this, so it stays on."
              : "Unspent money adds to next month's budget. Overspending doesn't carry."}
          </span>
        </span>
      </label>

      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={saving}
          onChange={(event) => setSaving(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <span>
          <span className="block font-semibold text-fg">Save up for a cost</span>
          <span className="block text-sm text-muted">
            For something that comes once or twice a year, like insurance or a registration.
          </span>
        </span>
      </label>

      {saving ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-amount`} className={labelClass}>
              Amount
            </label>
            <input
              id={`${ids}-amount`}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-invalid={tried && amountBad}
              aria-describedby={`${ids}-amount-hint`}
              className={`${inputClass} tabular-nums`}
            />
            <p
              id={`${ids}-amount-hint`}
              className={`mt-1.5 text-sm ${tried && amountBad ? "text-danger" : "text-muted"}`}
            >
              {tried && amountBad ? "Use an amount like 600 or 249.99." : "What it will cost."}
            </p>
          </div>
          <div>
            <label htmlFor={`${ids}-due`} className={labelClass}>
              Due
            </label>
            <input
              id={`${ids}-due`}
              type="date"
              value={dueDate}
              min={today}
              onChange={(event) => setDueDate(event.target.value)}
              aria-invalid={tried && dateBad}
              aria-describedby={`${ids}-due-hint`}
              className={`${inputClass} [color-scheme:dark]`}
            />
            <p
              id={`${ids}-due-hint`}
              className={`mt-1.5 text-sm ${tried && dateBad ? "text-danger" : "text-muted"}`}
            >
              {tried && dateBad ? "Pick the date it's due." : "When you'll pay it."}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-repeat`} className={labelClass}>
              Comes again
            </label>
            <select
              id={`${ids}-repeat`}
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              className={inputClass}
            >
              {REPEATS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {save.error ? (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      ) : null}
      <button type="submit" className={primaryButton} disabled={save.isPending}>
        Save settings
      </button>
    </form>
  );
}
