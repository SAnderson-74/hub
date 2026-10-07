import { useEffect, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { readPaste } from "../../../shared/claudeProject";
import { formatCents } from "../../../shared/money";
import { FUND_LABELS, type TithingDocument, tithingDocumentSchema } from "../../../shared/tithing";
import { useAllAccounts } from "../../money/queries";
import { formatShortDate, localDate } from "../../tasks/dates";
import type { TithingImportResult } from "../import.service";
import { useImportTithing } from "../queries";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reads a Claude Project answer as tithing, or says what's wrong. Null when empty. */
export function readPastedTithing(
  text: string,
): { document: TithingDocument } | { error: string } | null {
  const pasted = readPaste(text);
  if (!pasted) return null;
  if (!pasted.ok) return { error: pasted.error };
  if (pasted.format.format !== "hub-tithing/v1") {
    return {
      error: `That's ${pasted.format.noun} for ${pasted.format.into}, not tithing. Paste it there, or in Settings > Imports > Paste from Claude.`,
    };
  }
  const parsed = tithingDocumentSchema.safeParse(pasted.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `It doesn't fit the format${issue ? `: ${issue.message}` : "."} Ask the Project again.`,
    };
  }
  return { document: pasted.data as TithingDocument };
}

/** What adding will do (or did), in a few words. */
function summary(result: TithingImportResult): string {
  return [
    result.created > 0 ? `${count(result.created, "payment", "payments")} to Money` : "",
    result.marked > 0
      ? `${count(result.marked, "bank transaction", "bank transactions")} marked as donations`
      : "",
    result.set > 0 ? `tithing set on ${count(result.set, "paycheck", "paychecks")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** Donations and paychecks read by a Claude Project. */
export function PasteTithingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste tithing"
      description="Donations and paychecks from your Claude Project. Hub shows what it will do before anything changes."
    >
      {open ? <PasteTithingForm onDone={onClose} /> : null}
    </Sheet>
  );
}

const PAYMENT_WORDS = {
  create: "Adds it to Money",
  mark: "Marks a bank transaction as this donation",
  duplicate: "Already in Hub, so it's skipped",
  skipped: "Left out",
  problem: "Can't be read, so it's left out",
} as const;

const INCOME_WORDS = {
  set: "Sets what tithing is figured on",
  unchanged: "Already set, so nothing changes",
  unmatched: "No deposit of that amount yet. Import the statement, then paste again",
  skipped: "Left out",
  problem: "Can't be read, so it's left out",
} as const;

/** The paste, preview, and add; also used by the one paste box for every import. */
export function PasteTithingForm({
  initialText = "",
  onDone,
}: {
  initialText?: string;
  onDone: () => void;
}) {
  const ids = useId();
  const today = localDate(useNow());
  const accounts = useAllAccounts();
  const [text, setText] = useState(initialText);
  const [accountId, setAccountId] = useState("");
  const [skipPayments, setSkipPayments] = useState<number[]>([]);
  const [skipIncome, setSkipIncome] = useState<number[]>([]);
  const [preview, setPreview] = useState<TithingImportResult | null>(null);
  const [done, setDone] = useState<TithingImportResult | null>(null);
  const run = useImportTithing();
  const read = readPastedTithing(text);
  const document = read && "document" in read ? read.document : null;

  const open = (accounts.data ?? []).filter((account) => !account.archived);
  const chosen = accountId || (open.length === 1 ? String(open[0]?.id) : "");

  // The preview follows the paste and the choices, so it shows what adding will do.
  const key = JSON.stringify([document, chosen, skipPayments, skipIncome]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key covers its inputs
  useEffect(() => {
    if (!document || chosen === "") {
      setPreview(null);
      return;
    }
    run.mutate(
      {
        input: { document, accountId: Number(chosen), skipPayments, skipIncome },
        dryRun: true,
      },
      { onSuccess: setPreview, onError: () => setPreview(null) },
    );
  }, [key]);

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          Added {summary(done) || "nothing new"}
        </p>
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  const adding = preview ? summary(preview) : "";
  const toggle = (list: number[], set: (next: number[]) => void, index: number) =>
    set(list.includes(index) ? list.filter((item) => item !== index) : [...list, index]);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${ids}-paste`} className={labelClass}>
          Claude Project answer
        </label>
        <textarea
          id={`${ids}-paste`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSkipPayments([]);
            setSkipIncome([]);
          }}
          rows={6}
          spellCheck={false}
          placeholder='{ "format": "hub-tithing/v1", "payments": [ … ] }'
          aria-describedby={`${ids}-paste-hint`}
          className={`${textareaClass} font-mono text-sm`}
        />
        <p
          id={`${ids}-paste-hint`}
          className={`mt-1.5 text-sm ${read && "error" in read ? "text-danger" : "text-muted"}`}
        >
          {read && "error" in read
            ? read.error
            : "Import your bank statement first, so donations find their bank transactions."}
        </p>
      </div>

      <div>
        <label htmlFor={`${ids}-account`} className={labelClass}>
          Add donations with no bank transaction to
        </label>
        <select
          id={`${ids}-account`}
          value={chosen}
          onChange={(event) => setAccountId(event.target.value)}
          className={inputClass}
        >
          {chosen === "" ? <option value="">Pick an account</option> : null}
          {open.map((account) => (
            <option key={account.id} value={account.id}>
              {account.bookName}: {account.name}
            </option>
          ))}
        </select>
      </div>

      {run.error && !preview ? (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      ) : null}

      {preview ? (
        <div className={`space-y-4 ${run.isPending ? "opacity-60" : ""}`}>
          <p className="font-semibold text-fg">
            {adding ? `Adds ${adding}` : "Nothing new to add"}
          </p>
          {preview.payments.length > 0 ? (
            <section aria-labelledby={`${ids}-payments`} className="space-y-2">
              <h3 id={`${ids}-payments`} className="font-semibold text-fg">
                Donations
              </h3>
              <ul className="space-y-2">
                {preview.payments.map((row, index) => (
                  <li
                    key={`payment-${row.row}`}
                    className="rounded-tile bg-base/80 px-3 ring-1 ring-surface-0/50"
                  >
                    <label className="flex min-h-14 cursor-pointer items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={!skipPayments.includes(index)}
                        disabled={row.outcome === "problem" || row.outcome === "duplicate"}
                        onChange={() => toggle(skipPayments, setSkipPayments, index)}
                        className="mt-0.5 size-5 shrink-0 accent-accent"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-fg tabular-nums">
                          {row.amountCents === null
                            ? "Unreadable amount"
                            : formatCents(row.amountCents)}{" "}
                          · {FUND_LABELS[row.fund]}
                        </span>
                        <span className="block text-sm text-muted">
                          {row.date ? formatShortDate(row.date, today) : "No date"}
                          {row.note ? ` · ${row.note}` : ""}
                        </span>
                        <span
                          className={`block text-sm font-semibold ${
                            row.outcome === "problem"
                              ? "text-danger"
                              : row.outcome === "create" || row.outcome === "mark"
                                ? "text-ok"
                                : "text-muted"
                          }`}
                        >
                          {PAYMENT_WORDS[row.outcome]}
                        </span>
                        {row.match ? (
                          <span className="block text-sm text-muted">
                            {row.match.account}, {formatShortDate(row.match.date, today)}
                          </span>
                        ) : null}
                        {row.problems.map((problem) => (
                          <span key={problem} className="block text-sm text-danger">
                            {problem}
                          </span>
                        ))}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {preview.income.length > 0 ? (
            <section aria-labelledby={`${ids}-income`} className="space-y-2">
              <h3 id={`${ids}-income`} className="font-semibold text-fg">
                Paychecks
              </h3>
              <ul className="space-y-2">
                {preview.income.map((row, index) => (
                  <li
                    key={`income-${row.row}`}
                    className="rounded-tile bg-base/80 px-3 ring-1 ring-surface-0/50"
                  >
                    <label className="flex min-h-14 cursor-pointer items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={!skipIncome.includes(index)}
                        disabled={row.outcome === "problem" || row.outcome === "unmatched"}
                        onChange={() => toggle(skipIncome, setSkipIncome, index)}
                        className="mt-0.5 size-5 shrink-0 accent-accent"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold break-words text-fg tabular-nums">
                          {row.depositCents === null
                            ? "Unreadable deposit"
                            : formatCents(row.depositCents)}
                          {row.source ? ` from ${row.source}` : ""}
                        </span>
                        <span className="block text-sm text-muted tabular-nums">
                          {row.date ? formatShortDate(row.date, today) : "No date"}
                          {row.baseCents === null
                            ? ""
                            : ` · tithing on ${formatCents(row.baseCents)}`}
                        </span>
                        <span
                          className={`block text-sm font-semibold ${
                            row.outcome === "problem"
                              ? "text-danger"
                              : row.outcome === "set"
                                ? "text-ok"
                                : row.outcome === "unmatched"
                                  ? "text-warn"
                                  : "text-muted"
                          }`}
                        >
                          {INCOME_WORDS[row.outcome]}
                        </span>
                        {row.match ? (
                          <span className="block text-sm text-muted">
                            {row.match.account}, {formatShortDate(row.match.date, today)}
                          </span>
                        ) : null}
                        {row.problems.map((problem) => (
                          <span key={problem} className="block text-sm text-danger">
                            {problem}
                          </span>
                        ))}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={run.isPending || !adding || !document || chosen === ""}
              onClick={() => {
                if (document) {
                  run.mutate(
                    {
                      input: { document, accountId: Number(chosen), skipPayments, skipIncome },
                      dryRun: false,
                    },
                    { onSuccess: setDone },
                  );
                }
              }}
            >
              {adding ? "Add them" : "Nothing to add"}
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
      ) : document && chosen !== "" && run.isPending ? (
        <p className="text-sm text-muted">Checking…</p>
      ) : null}
    </div>
  );
}
