import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { dangerButton, ghostButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { formatShortDate } from "../../tasks/dates";
import { type Transaction, useRemoveReceipt } from "../queries";

type Receipt = NonNullable<Transaction["receipt"]>;

/** What removing a receipt does to its transaction, said before it's done. */
function removeEffect(receipt: Receipt) {
  if (!receipt.createdTransaction) {
    return "The transaction goes back to how it was before the receipt, including changes made since.";
  }
  return receipt.bankMatched
    ? "The transaction stays, since the bank has it too."
    : "The transaction it added goes too.";
}

/** The receipt on a transaction: its store, lines, and note, and a way to take it off. */
export function ReceiptBox({
  receipt,
  today,
  onRemoved,
}: {
  receipt: Receipt;
  today: string;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const remove = useRemoveReceipt();
  return (
    <section
      aria-label="Receipt"
      className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <ReceiptText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block font-semibold break-words text-fg">
              Receipt from {receipt.store}
            </span>
            <span className="block text-sm text-muted">
              {formatShortDate(receipt.date, today)}
              {receipt.type === "return" ? " · Return" : ""}
            </span>
          </span>
        </span>
        <span className="shrink-0 font-semibold text-fg tabular-nums">
          {formatCents(receipt.totalCents)}
        </span>
      </div>

      {receipt.items.length > 0 ? (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-text">
            <span>
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>{" "}
              {receipt.items.length === 1 ? "1 line" : `${receipt.items.length} lines`}
            </span>
          </summary>
          <ul className="space-y-1 text-sm">
            {receipt.items.map((item, index) => (
              <li
                // Lines can repeat, so their place tells them apart.
                // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
                key={index}
                className="flex items-start justify-between gap-3"
              >
                <span className="min-w-0 break-words text-fg">
                  {item.name || "Unnamed line"}
                  {item.category ? <span className="text-muted"> · {item.category}</span> : null}
                </span>
                <span className="shrink-0 text-muted tabular-nums">
                  {formatCents(item.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {receipt.note ? <p className="text-sm break-words text-muted">{receipt.note}</p> : null}

      {confirming ? (
        <div className="space-y-3 border-t border-surface-0/70 pt-3">
          <p className="font-semibold text-fg">Remove this receipt? {removeEffect(receipt)}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(receipt.id, { onSuccess: onRemoved })}
              className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
            >
              Remove receipt
            </button>
            <button type="button" className={ghostButton} onClick={() => setConfirming(false)}>
              Keep receipt
            </button>
          </div>
          {remove.error ? (
            <p role="alert" className="text-sm text-danger">
              {remove.error.message}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className={`${dangerButton} -ml-4`}
          onClick={() => setConfirming(true)}
        >
          Remove receipt
        </button>
      )}
    </section>
  );
}
