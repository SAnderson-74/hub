import { CreditCard } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  secondaryButton,
} from "../../../client/components/ui";
import { CARD_KIND_LABELS, cardKindFor } from "../../../shared/cards";
import {
  type Account,
  type Card,
  useCards,
  useCreateCard,
  useDeleteCard,
  useUpdateCard,
} from "../queries";

const LAST4 = /^(\d{4})?$/;

/** "Card saved", or "Card saved. Matched 12 past transactions to this account's cards." */
function withFilled(message: string, filled: number): string {
  if (filled === 0) return message;
  return `${message}. Matched ${filled} past ${filled === 1 ? "transaction" : "transactions"} to this account's cards.`;
}

/**
 * The cards that spend from an account: a credit card on its credit card account, a
 * debit card on checking. Transactions show which one paid.
 */
export function AccountCards({ account }: { account: Account }) {
  const cards = useCards(account.bookId);
  const [editing, setEditing] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();
  const kind = cardKindFor(account.kind);
  if (kind === null) return null;
  const mine = (cards.data ?? []).filter((card) => card.account.id === account.id);

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-4">
      <div>
        <h3 id={`${ids}-title`} className="font-semibold text-fg">
          Cards
        </h3>
        <p className="mt-1 text-sm text-muted">
          {kind === "credit"
            ? "The cards on this account, so transactions show which one paid. Authorized users' cards go here too."
            : "Debit cards that spend from this account. Purchases with card words or the card's digits in the bank's text are matched to it."}{" "}
          Hub keeps only the last 4 digits.
        </p>
      </div>
      {cards.isPending ? (
        <LoadingRows rows={1} />
      ) : cards.isError ? (
        <ErrorNote error={cards.error} onRetry={() => void cards.refetch()} />
      ) : (
        <>
          {mine.length > 0 ? (
            <ul className="space-y-2">
              {mine.map((card) =>
                editing === card.id ? (
                  <li key={card.id}>
                    <CardForm
                      account={account}
                      card={card}
                      onDone={(message) => {
                        setEditing(null);
                        setAnnouncement(message);
                      }}
                    />
                  </li>
                ) : (
                  <li
                    key={card.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50"
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <CreditCard
                        aria-hidden="true"
                        className="mt-0.5 size-5 shrink-0 text-muted"
                      />
                      <span className="min-w-0">
                        <span
                          className={`block font-semibold break-words ${card.archived ? "text-muted" : "text-fg"}`}
                        >
                          {card.name}
                        </span>
                        <span className="block text-sm text-muted tabular-nums">
                          {[
                            CARD_KIND_LABELS[card.kind],
                            card.last4 ? `Ending in ${card.last4}` : "",
                            `${card.transactionCount} ${card.transactionCount === 1 ? "transaction" : "transactions"}`,
                            card.archived ? "Archived" : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => {
                        setEditing(card.id);
                        setAnnouncement("");
                      }}
                      aria-label={`Edit ${card.name}`}
                    >
                      Edit
                    </button>
                  </li>
                ),
              )}
            </ul>
          ) : null}
          {editing === null ? (
            <CardForm key={mine.length} account={account} card={null} onDone={setAnnouncement} />
          ) : null}
        </>
      )}
      <p role="status" className="text-sm font-semibold text-ok">
        {announcement}
      </p>
    </section>
  );
}

function CardForm({
  account,
  card,
  onDone,
}: {
  account: Account;
  /** null adds a card. */
  card: Card | null;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateCard();
  const update = useUpdateCard();
  const remove = useDeleteCard();
  const ids = useId();
  const nameMissing = name.trim() === "";
  const digits = last4.trim();
  const last4Invalid = !LAST4.test(digits);
  const error = create.error ?? update.error ?? remove.error;
  const pending = create.isPending || update.isPending || remove.isPending;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (nameMissing || last4Invalid) return;
    const fields = { name: name.trim(), last4: digits || null };
    if (!card) {
      create.mutate(
        { accountId: account.id, ...fields },
        {
          onSuccess: (saved) => {
            onDone(withFilled(`${saved.card.name} added`, saved.filled));
            setName("");
            setLast4("");
            setTried(false);
          },
        },
      );
      return;
    }
    update.mutate(
      { id: card.id, patch: fields },
      { onSuccess: (saved) => onDone(withFilled("Card saved", saved.filled)) },
    );
  };

  return (
    <div className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={`${ids}-name`} className={labelClass}>
              {card ? "Card name" : "New card"}
            </label>
            <input
              id={`${ids}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              autoComplete="off"
              placeholder={
                cardKindFor(account.kind) === "credit" ? "Rewards card" : "Everyday debit"
              }
              aria-invalid={tried && nameMissing}
              aria-describedby={tried && nameMissing ? `${ids}-name-error` : undefined}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-last4`} className={labelClass}>
              Last 4 digits
            </label>
            <input
              id={`${ids}-last4`}
              value={last4}
              onChange={(event) => setLast4(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="Optional"
              aria-invalid={last4Invalid}
              aria-describedby={last4Invalid ? `${ids}-last4-error` : undefined}
              className={`${inputClass} tabular-nums`}
            />
          </div>
        </div>
        {tried && nameMissing ? (
          <p id={`${ids}-name-error`} className="text-sm text-danger">
            Give the card a name.
          </p>
        ) : null}
        {last4Invalid ? (
          <p id={`${ids}-last4-error`} className="text-sm text-danger">
            Enter only the last 4 digits, like 1234.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={secondaryButton}
            disabled={pending || (tried && (nameMissing || last4Invalid))}
          >
            {card ? "Save card" : "Add card"}
          </button>
          {card ? (
            <button type="button" className={ghostButton} onClick={() => onDone("")}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {card ? (
        <div className="flex flex-wrap gap-2 border-t border-surface-0/70 pt-3">
          <button
            type="button"
            className={ghostButton}
            disabled={pending}
            onClick={() =>
              update.mutate(
                { id: card.id, patch: { archived: !card.archived } },
                {
                  onSuccess: (saved) =>
                    onDone(
                      withFilled(card.archived ? "Card restored" : "Card archived", saved.filled),
                    ),
                },
              )
            }
          >
            {card.archived ? "Restore card" : "Archive card"}
          </button>
          {confirmDelete ? null : (
            <button type="button" className={dangerButton} onClick={() => setConfirmDelete(true)}>
              Delete card
            </button>
          )}
        </div>
      ) : null}
      {card && confirmDelete ? (
        <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
          <p className="font-semibold text-fg">
            Delete {card.name}?{" "}
            {card.transactionCount > 0
              ? `Its ${card.transactionCount} ${card.transactionCount === 1 ? "transaction stays" : "transactions stay"}, without a card.`
              : "This can't be undone."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => remove.mutate(card.id, { onSuccess: () => onDone("Card deleted") })}
              className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
            >
              Delete card
            </button>
            <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
              Keep card
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
