import { Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { iconButton, inputClass, labelClass, secondaryButton } from "../../../client/components/ui";
import { cardLabel } from "../../../shared/cards";
import { formatCents, parseDollars } from "../../../shared/money";
import { pointValueLabel } from "../../../shared/rewards";
import { formatShortDate } from "../../tasks/dates";
import {
  type CardRewards,
  useAddRedemption,
  useCardPoints,
  useDeletePointBalance,
  useDeleteRedemption,
  useSavePointBalance,
} from "../queries";

/** Whole points from what someone typed: "12,345" is 12345. */
function parsePoints(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  return /^\d{1,10}$/.test(cleaned) ? Number(cleaned) : null;
}

const pointsText = (points: number) =>
  `${points.toLocaleString("en-US")} ${points === 1 ? "point" : "points"}`;

/** A points card's statement balances and redemptions, which set what a point is worth. */
export function PointsSheet({
  target,
  today,
  onClose,
}: {
  target: CardRewards | null;
  today: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title="Points"
      description={target ? cardLabel(target.card) : undefined}
    >
      {target ? <PointsHistory key={target.card.id} entry={target} today={today} /> : null}
    </Sheet>
  );
}

function PointsHistory({ entry, today }: { entry: CardRewards; today: string }) {
  const points = useCardPoints(entry.card.id);
  const setValue = entry.program?.pointValue ?? 100;
  if (points.isPending) return <LoadingRows rows={3} />;
  if (points.isError) {
    return <ErrorNote error={points.error} onRetry={() => void points.refetch()} />;
  }
  const { balances, redemptions, realValue } = points.data;
  return (
    <div className="space-y-8">
      <p className="rounded-tile bg-base/80 p-4 text-sm text-muted ring-1 ring-surface-0/50">
        {realValue === null
          ? `Points count at the ${pointValueLabel(setValue)} you set. Add what you get when you use them, and Hub counts them at that instead.`
          : `Your redemptions averaged ${pointValueLabel(realValue)} a point, so Hub counts points at that (you set ${pointValueLabel(setValue)}).`}
      </p>
      <BalanceForm cardId={entry.card.id} today={today} />
      {balances.length > 0 ? (
        <HistoryList
          title="Statement balances"
          items={balances.map((balance) => ({
            id: balance.id,
            line: pointsText(balance.points),
            date: balance.date,
          }))}
          kind="balance"
          today={today}
        />
      ) : null}
      <RedemptionForm cardId={entry.card.id} today={today} />
      {redemptions.length > 0 ? (
        <HistoryList
          title="Points used"
          items={redemptions.map((redemption) => ({
            id: redemption.id,
            line: `${pointsText(redemption.points)} for ${formatCents(redemption.valueCents)} (${pointValueLabel(
              Math.round((redemption.valueCents * 100) / redemption.points),
            )} each)${redemption.note ? ` · ${redemption.note}` : ""}`,
            date: redemption.date,
          }))}
          kind="redemption"
          today={today}
        />
      ) : null}
    </div>
  );
}

function BalanceForm({ cardId, today }: { cardId: number; today: string }) {
  const save = useSavePointBalance();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState("");
  const ids = useId();
  const parsed = parsePoints(amount);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (parsed === null || !date) return;
    save.mutate(
      { cardId, json: { date, points: parsed } },
      {
        onSuccess: () => {
          setMessage("Balance saved");
          setAmount("");
          setTried(false);
        },
      },
    );
  };

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-3">
      <div>
        <h3 id={`${ids}-title`} className="font-semibold text-fg">
          Add a statement balance
        </h3>
        <p className="mt-1 text-sm text-muted">
          With two balances, Hub checks what the statements say the card earned against its
          estimate.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${ids}-date`} className={labelClass}>
              Statement date
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-points`} className={labelClass}>
              Points balance
            </label>
            <input
              id={`${ids}-points`}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setMessage("");
              }}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={tried && parsed === null}
              className={`${inputClass} tabular-nums`}
            />
          </div>
        </div>
        {tried && parsed === null ? (
          <p className="text-sm text-danger">Enter the balance in whole points, like 12,345.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={secondaryButton} disabled={save.isPending}>
            Save balance
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {save.error ? (
          <p role="alert" className="text-sm text-danger">
            {save.error.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function RedemptionForm({ cardId, today }: { cardId: number; today: string }) {
  const add = useAddRedemption();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState("");
  const ids = useId();
  const parsed = parsePoints(amount);
  const cents = parseDollars(value);
  const invalid = parsed === null || parsed === 0 || cents === null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (invalid || parsed === null || cents === null || !date) return;
    add.mutate(
      { cardId, json: { date, points: parsed, valueCents: cents, note: note.trim() } },
      {
        onSuccess: () => {
          setMessage("Redemption added");
          setAmount("");
          setValue("");
          setNote("");
          setTried(false);
        },
      },
    );
  };

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-3">
      <div>
        <h3 id={`${ids}-title`} className="font-semibold text-fg">
          Add points you used
        </h3>
        <p className="mt-1 text-sm text-muted">
          What you got for them, in dollars: the statement credit, the gift card's value, or what
          the trip would have cost in cash.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <label htmlFor={`${ids}-date`} className={labelClass}>
              Date
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-points`} className={labelClass}>
              Points used
            </label>
            <input
              id={`${ids}-points`}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setMessage("");
              }}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={tried && (parsed === null || parsed === 0)}
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-value`} className={labelClass}>
              Worth
            </label>
            <input
              id={`${ids}-value`}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-invalid={tried && cents === null}
              className={`${inputClass} tabular-nums`}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-note`} className={labelClass}>
            Note (optional)
          </label>
          <input
            id={`${ids}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            autoComplete="off"
            placeholder="Statement credit"
            className={inputClass}
          />
        </div>
        {tried && invalid ? (
          <p className="text-sm text-danger">
            Enter the points used, like 15,000, and what they were worth, like 150.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={secondaryButton} disabled={add.isPending}>
            Add redemption
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {add.error ? (
          <p role="alert" className="text-sm text-danger">
            {add.error.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function HistoryList({
  title,
  items,
  kind,
  today,
}: {
  title: string;
  items: Array<{ id: number; line: string; date: string }>;
  kind: "balance" | "redemption";
  today: string;
}) {
  const removeBalance = useDeletePointBalance();
  const removeRedemption = useDeleteRedemption();
  const remove = kind === "balance" ? removeBalance : removeRedemption;
  const ids = useId();
  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-2">
      <h3 id={`${ids}-title`} className="font-semibold text-fg">
        {title}
      </h3>
      <ul className="divide-y divide-surface-0">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-1">
            <span className="min-w-0">
              <span className="block break-words text-fg tabular-nums">{item.line}</span>
              <span className="block text-sm text-muted">{formatShortDate(item.date, today)}</span>
            </span>
            <button
              type="button"
              className={iconButton}
              aria-label={`Delete ${kind === "balance" ? "the balance" : "the redemption"} from ${formatShortDate(item.date, today)}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(item.id)}
            >
              <Trash2 aria-hidden="true" className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      {remove.error ? (
        <p role="alert" className="text-sm text-danger">
          {remove.error.message}
        </p>
      ) : null}
    </section>
  );
}
