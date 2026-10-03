import { ReceiptText } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { cardLabel } from "../../../shared/cards";
import { formatCents } from "../../../shared/money";
import type { ReceiptDocument } from "../../../shared/receipts";
import { formatShortDate } from "../../tasks/dates";
import {
  type Account,
  type Book,
  type Category,
  type ReceiptImport,
  useImportReceipts,
} from "../queries";

/**
 * Reads what was pasted: the JSON a Claude Project gives, with or without the code
 * fence around it. Says what's wrong in words when it can't.
 */
export function readPasted(text: string): { document: ReceiptDocument } | { error: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return {
      error: "That doesn't look like what the Claude Project gives. Copy its whole answer.",
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return {
      error: "Part of it is missing or changed. Copy the Claude Project's whole answer again.",
    };
  }
  const format = (data as { format?: unknown }).format;
  if (format !== "hub-receipt/v1") {
    return {
      error:
        typeof format === "string"
          ? `This is ${format}, not receipts. Paste it where that kind of import goes.`
          : 'This isn\'t a receipts document. It should have "format": "hub-receipt/v1".',
    };
  }
  return { document: data as ReceiptDocument };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Receipts read by a Claude Project, added to the transactions they're for. */
export function ReceiptsSheet({
  book,
  accounts,
  categories,
  today,
  open,
  onClose,
}: {
  book: Book;
  accounts: Account[];
  categories: Category[];
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste receipts"
      description={`Receipts from your Claude Project, into ${book.name}.`}
    >
      {open ? (
        <ReceiptsForm
          book={book}
          accounts={accounts}
          categories={categories}
          today={today}
          onDone={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function ReceiptsForm({
  book,
  accounts,
  categories,
  today,
  onDone,
}: {
  book: Book;
  accounts: Account[];
  categories: Category[];
  today: string;
  onDone: () => void;
}) {
  const ids = useId();
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryMap, setCategoryMap] = useState<Record<string, number>>({});
  const [skip, setSkip] = useState<number[]>([]);
  const [preview, setPreview] = useState<ReceiptImport | null>(null);
  const [done, setDone] = useState<ReceiptImport | null>(null);
  const run = useImportReceipts();
  const pasted = readPasted(text);
  const document = pasted && "document" in pasted ? pasted.document : null;
  const openAccounts = accounts.filter((account) => !account.archived);
  const spending = categories.filter((category) => !category.archived);

  // The preview follows every choice, so what it shows is what adding will do.
  const choices = JSON.stringify([document, accountId, categoryMap, skip]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key covers every choice
  useEffect(() => {
    if (!document) {
      setPreview(null);
      return;
    }
    run.mutate(
      {
        json: { bookId: book.id, document, accountId, categoryMap, skip },
        dryRun: true,
      },
      { onSuccess: setPreview, onError: () => setPreview(null) },
    );
  }, [choices]);

  if (done) {
    const added = done.matched + done.created;
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          Added {count(added, "receipt", "receipts")}
        </p>
        <p className="text-fg">
          {count(done.matched, "went on a transaction", "went on transactions")} already in Hub
          {done.created > 0
            ? `, and ${count(done.created, "is a new transaction", "are new transactions")}`
            : ""}
          . A bank file later fills in the new ones instead of adding them again.
        </p>
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  const adding = preview
    ? preview.receipts.filter(
        (receipt) => receipt.outcome === "match" || receipt.outcome === "create",
      )
    : [];
  const needsAccount = preview?.receipts.some(
    (receipt) =>
      receipt.card === null && receipt.outcome !== "skip" && receipt.outcome !== "duplicate",
  );

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor={`${ids}-paste`} className={labelClass}>
          Claude Project answer
        </label>
        <textarea
          id={`${ids}-paste`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSkip([]);
          }}
          rows={6}
          spellCheck={false}
          placeholder='{ "format": "hub-receipt/v1", "receipts": [ … ] }'
          aria-describedby={`${ids}-paste-hint`}
          className={`${textareaClass} font-mono text-sm`}
        />
        <p
          id={`${ids}-paste-hint`}
          className={`mt-1.5 text-sm ${pasted && "error" in pasted ? "text-danger" : "text-muted"}`}
        >
          {pasted && "error" in pasted
            ? pasted.error
            : "Nothing changes until you add the receipts. Hub keeps the store, date, lines, and total, never the card's number beyond its last 4 digits."}
        </p>
      </div>

      {run.error && !preview ? (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      ) : null}

      {preview ? (
        <div className={`space-y-5 ${run.isPending ? "opacity-60" : ""}`}>
          {needsAccount ? (
            <div>
              <label htmlFor={`${ids}-account`} className={labelClass}>
                Receipts without a known card were paid from
              </label>
              <select
                id={`${ids}-account`}
                value={accountId ?? ""}
                onChange={(event) =>
                  setAccountId(event.target.value === "" ? null : Number(event.target.value))
                }
                className={inputClass}
              >
                <option value="">Pick an account</option>
                {openAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {preview.unknownCategories.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="font-semibold text-fg">Categories {book.name} doesn't have</legend>
              <p className="text-sm text-muted">Pick one of yours for each.</p>
              {preview.unknownCategories.map((name) => (
                <div key={name} className="min-w-0">
                  <label htmlFor={`${ids}-map-${name}`} className={labelClass}>
                    {name}
                  </label>
                  <select
                    id={`${ids}-map-${name}`}
                    value={categoryMap[name.toLowerCase()] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCategoryMap((current) => {
                        const next = { ...current };
                        if (value === "") delete next[name.toLowerCase()];
                        else next[name.toLowerCase()] = Number(value);
                        return next;
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">Pick a category</option>
                    {spending.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </fieldset>
          ) : null}

          <ul className="space-y-3">
            {preview.receipts.map((receipt) => (
              <ReceiptRow
                key={receipt.index}
                receipt={receipt}
                today={today}
                skipped={skip.includes(receipt.index)}
                onSkip={(skipped) =>
                  setSkip((current) =>
                    skipped
                      ? [...current, receipt.index]
                      : current.filter((index) => index !== receipt.index),
                  )
                }
              />
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={run.isPending || adding.length === 0 || !document}
              onClick={() => {
                if (!document) return;
                run.mutate(
                  {
                    json: { bookId: book.id, document, accountId, categoryMap, skip },
                    dryRun: false,
                  },
                  { onSuccess: setDone },
                );
              }}
            >
              {adding.length === 0
                ? "Nothing to add yet"
                : `Add ${count(adding.length, "receipt", "receipts")}`}
            </button>
            <button type="button" className={ghostButton} onClick={onDone}>
              Cancel
            </button>
          </div>
          {run.error ? (
            <p role="alert" className="text-sm text-danger">
              {run.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReceiptRow({
  receipt,
  today,
  skipped,
  onSkip,
}: {
  receipt: ReceiptImport["receipts"][number];
  today: string;
  skipped: boolean;
  onSkip: (skipped: boolean) => void;
}) {
  const ids = useId();
  const total =
    receipt.totalCents === null
      ? "No total"
      : `${receipt.type === "return" ? "+" : ""}${formatCents(receipt.totalCents)}`;
  const outcome =
    receipt.outcome === "match" && receipt.match
      ? `Goes on "${receipt.match.payee || "No payee"}" from ${formatShortDate(receipt.match.date, today)}`
      : receipt.outcome === "create"
        ? `Adds a new transaction to ${receipt.account?.name ?? "the account"}`
        : receipt.outcome === "duplicate"
          ? "Already added, so it's left out"
          : receipt.outcome === "skip"
            ? "Left out"
            : "Needs a fix before it can be added";
  const tone =
    receipt.outcome === "match" || receipt.outcome === "create"
      ? "text-ok"
      : receipt.outcome === "blocked"
        ? "text-warn"
        : "text-muted";
  return (
    <li className="space-y-2 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <ReceiptText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block font-semibold break-words text-fg">
              {receipt.store || "No store name"}
            </span>
            <span className="block text-sm text-muted">
              {[
                receipt.date ? formatShortDate(receipt.date, today) : "No date",
                receipt.card ? cardLabel(receipt.card) : "",
                receipt.itemCount > 0 ? count(receipt.itemCount, "line", "lines") : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </span>
        <span className="shrink-0 font-semibold text-fg tabular-nums">{total}</span>
      </div>
      <p className={`text-sm font-semibold ${tone}`}>{outcome}</p>
      {receipt.parts.length > 0 && receipt.outcome !== "duplicate" ? (
        <p className="text-sm text-muted tabular-nums">
          {receipt.parts
            .map((part) => `${part.category || "No category"} ${formatCents(part.cents)}`)
            .join(" · ")}
        </p>
      ) : null}
      {receipt.problems.length > 0 && receipt.outcome !== "skip" ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-warn">
          {receipt.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {receipt.outcome !== "duplicate" ? (
        <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
          <input
            id={`${ids}-skip`}
            type="checkbox"
            checked={skipped}
            onChange={(event) => onSkip(event.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Leave this one out
        </label>
      ) : null}
    </li>
  );
}
