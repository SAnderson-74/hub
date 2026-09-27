import { type ChangeEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import {
  BANK_FIELD_LABELS,
  BANK_FIELDS,
  type BankColumns,
  type BankField,
  type BankImport,
  type BankImportResult,
  type BankOptions,
  columnsReady,
  guessBankColumns,
  headerKey,
  isOfx,
  type ReadResult,
  readBankCsv,
  readOfx,
} from "../../../shared/bankImport";
import { parseCsv } from "../../../shared/csv";
import { formatSigned } from "../../../shared/profit";
import { formatShortDate, localDate } from "../../tasks/dates";
import {
  type Account,
  type Book,
  type ImportRecord,
  useImportFile,
  useImportLayouts,
  useImports,
  useUndoImport,
} from "../queries";

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The file as read: an OFX statement, or a CSV table waiting for its columns. */
type Loaded =
  | { kind: "ofx"; name: string; text: string }
  | { kind: "csv"; name: string; table: string[][] };

/**
 * Imports a bank or card export into an account: an OFX or QFX statement, or a CSV
 * whose columns are matched once and remembered. Shows what will happen first, and
 * lists recent imports so one can be undone.
 */
export function ImportSheet({
  book,
  accounts,
  defaultAccountId,
  today,
  open,
  onClose,
}: {
  book: Book;
  accounts: Account[];
  defaultAccountId: number | null;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import transactions"
      description="A CSV, OFX, or QFX file from your bank or card. Transactions already in the account are skipped."
    >
      {open ? (
        <div className="space-y-10">
          <ImportForm
            accounts={accounts.filter((account) => !account.archived)}
            defaultAccountId={defaultAccountId}
            onDone={onClose}
          />
          <RecentImports book={book} today={today} />
        </div>
      ) : null}
    </Sheet>
  );
}

function ImportForm({
  accounts,
  defaultAccountId,
  onDone,
}: {
  accounts: Account[];
  defaultAccountId: number | null;
  onDone: () => void;
}) {
  const layouts = useImportLayouts();
  const run = useImportFile();
  const ids = useId();
  const [accountId, setAccountId] = useState(String(defaultAccountId ?? accounts[0]?.id ?? ""));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [columns, setColumns] = useState<BankColumns>({});
  const [options, setOptions] = useState<BankOptions>({ flipSigns: false, dayFirst: false });
  const [fileError, setFileError] = useState("");
  const [read, setRead] = useState<ReadResult | null>(null);
  const [preview, setPreview] = useState<BankImportResult | null>(null);
  const [done, setDone] = useState<BankImportResult | null>(null);

  const clearCheck = () => {
    setRead(null);
    setPreview(null);
    run.reset();
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    clearCheck();
    setLoaded(null);
    setFileError("");
    if (!file) return;
    const text = await file.text();
    if (isOfx(text)) {
      setLoaded({ kind: "ofx", name: file.name, text });
      return;
    }
    const table = parseCsv(text);
    const headers = table[0] ?? [];
    if (table.length < 2 || headers.length < 2) {
      setFileError(
        "Hub couldn't find transactions in that file. Use a CSV with a header row, or an OFX or QFX file.",
      );
      return;
    }
    // A layout saved from an earlier file with the same headers maps itself.
    const saved = layouts.data?.find((layout) => layout.headerKey === headerKey(headers));
    setColumns(saved?.columns ?? guessBankColumns(headers));
    setOptions(saved?.options ?? { flipSigns: false, dayFirst: false });
    if (saved?.accountId && accounts.some((account) => account.id === saved.accountId)) {
      setAccountId(String(saved.accountId));
    }
    setLoaded({ kind: "csv", name: file.name, table });
  };

  const request = (result: ReadResult): BankImport | null => {
    if (!loaded || !accountId) return null;
    return {
      accountId: Number(accountId),
      source: loaded.kind,
      fileName: loaded.name.slice(0, 200),
      transactions: result.transactions,
      ...(loaded.kind === "csv"
        ? { layout: { headerKey: headerKey(loaded.table[0] ?? []), columns, options } }
        : {}),
    };
  };

  const check = () => {
    if (!loaded) return;
    const result =
      loaded.kind === "ofx" ? readOfx(loaded.text) : readBankCsv(loaded.table, columns, options);
    setRead(result);
    const json = request(result);
    if (json && result.transactions.length > 0) {
      run.mutate({ json, dryRun: true }, { onSuccess: setPreview });
    }
  };

  const confirm = () => {
    const json = read ? request(read) : null;
    if (json) run.mutate({ json, dryRun: false }, { onSuccess: setDone });
  };

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          Imported {count(done.created, "transaction", "transactions")}
        </p>
        {done.duplicates > 0 ? (
          <p className="text-fg">
            {count(done.duplicates, "was", "were")} already in the account and skipped.
          </p>
        ) : null}
        <p className="text-sm text-muted">Changed your mind? Undo it from Recent imports below.</p>
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  const headers = loaded?.kind === "csv" ? (loaded.table[0] ?? []) : [];
  const sample = loaded?.kind === "csv" ? (loaded.table[1] ?? []) : [];
  const ready = loaded?.kind === "ofx" || columnsReady(columns);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${ids}-account`} className={labelClass}>
            Into account
          </label>
          <select
            id={`${ids}-account`}
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              clearCheck();
            }}
            className={inputClass}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-file`} className={labelClass}>
            File
          </label>
          <input
            id={`${ids}-file`}
            type="file"
            accept=".csv,.ofx,.qfx,text/csv,application/x-ofx,application/vnd.intu.qfx"
            onChange={(event) => void onFile(event)}
            className="block min-h-12 w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-full file:border-0 file:bg-surface-0 file:px-4 file:font-semibold file:text-fg"
          />
        </div>
      </div>
      {fileError ? (
        <p role="alert" className="text-sm text-danger">
          {fileError}
        </p>
      ) : null}

      {loaded?.kind === "ofx" ? (
        <p className="text-sm text-muted">
          A bank statement ({loaded.name}). Its transactions carry the bank's own ids, so importing
          it again later skips what's already here.
        </p>
      ) : null}

      {loaded?.kind === "csv" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {count(loaded.table.length - 1, "row", "rows")} in {loaded.name}. Match the columns
            once; Hub remembers them for the next file with the same headings. Use Amount for one
            column with signs, or Money out and Money in for two.
          </p>
          <fieldset className="min-w-0 space-y-3">
            <legend className="sr-only">Columns</legend>
            {BANK_FIELDS.map((field: BankField) => {
              const index = columns[field];
              const example = index === undefined ? "" : (sample[index] ?? "").trim();
              return (
                <div
                  key={field}
                  className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-3"
                >
                  <label htmlFor={`${ids}-${field}`} className="text-sm font-semibold text-muted">
                    {BANK_FIELD_LABELS[field]}
                  </label>
                  <div className="min-w-0">
                    <select
                      id={`${ids}-${field}`}
                      value={index === undefined ? "" : String(index)}
                      onChange={(event) => {
                        clearCheck();
                        const value = event.target.value;
                        setColumns((current) => {
                          const next = { ...current };
                          if (value === "") delete next[field];
                          else next[field] = Number(value);
                          return next;
                        });
                      }}
                      aria-describedby={example ? `${ids}-${field}-example` : undefined}
                      className={`${inputClass} h-11`}
                    >
                      <option value="">Not in the file</option>
                      {headers.map((header, column) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a column is its position; headers can repeat.
                        <option key={column} value={String(column)}>
                          {header || `Column ${column + 1}`}
                        </option>
                      ))}
                    </select>
                    {example ? (
                      <p
                        id={`${ids}-${field}-example`}
                        className="mt-1 truncate text-xs text-faint"
                      >
                        e.g. {example}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </fieldset>
          <div className="space-y-1">
            {(
              [
                ["flipSigns", "Purchases are positive in this file (flip the signs)"],
                ["dayFirst", "Dates are day first, like 31/01/2030"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 text-fg">
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(event) => {
                    clearCheck();
                    setOptions((current) => ({ ...current, [key]: event.target.checked }));
                  }}
                  className="size-5 shrink-0 accent-accent"
                />
                {label}
              </label>
            ))}
          </div>
          {ready ? null : (
            <p className="text-sm text-warn">
              Choose the date column and at least one amount column.
            </p>
          )}
        </div>
      ) : null}

      {loaded && !preview ? (
        <button
          type="button"
          className={secondaryButton}
          disabled={!ready || !accountId || run.isPending}
          onClick={check}
        >
          Check import
        </button>
      ) : null}

      {read && read.transactions.length === 0 ? (
        <p role="alert" className="text-sm text-danger">
          None of the rows could be read. Check the date and amount columns and the options above.
        </p>
      ) : null}

      {preview && read ? (
        <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-surface-1">
          <p className="font-semibold text-fg">Importing will do this:</p>
          <ul className="list-disc space-y-1 pl-5 text-fg">
            <li>
              {preview.created === 0
                ? "Nothing new to add"
                : `${count(preview.created, "transaction", "transactions")} to add`}
            </li>
            {preview.duplicates > 0 ? (
              <li>
                {count(preview.duplicates, "is", "are")} already in the account and will be skipped
              </li>
            ) : null}
            {read.problems.length > 0 ? (
              <li>
                {count(read.problems.length, "row", "rows")} couldn't be read and will be left out
              </li>
            ) : null}
            {preview.unknownCategories.length > 0 ? (
              <li>
                Categories not in this book stay uncategorized:{" "}
                {preview.unknownCategories.join(", ")}
              </li>
            ) : null}
          </ul>
          <PreviewRows preview={preview} />
          {read.problems.length > 0 ? (
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
                Rows left out
              </summary>
              <ul className="space-y-1">
                {read.problems.slice(0, 50).map((problem) => (
                  <li key={problem.row} className="text-muted">
                    <span className="font-semibold text-fg">Row {problem.row}:</span>{" "}
                    {problem.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={run.isPending || preview.created === 0}
              onClick={confirm}
            >
              {preview.created === 0
                ? "Nothing to import"
                : `Import ${count(preview.created, "transaction", "transactions")}`}
            </button>
            {loaded?.kind === "csv" ? (
              <button type="button" className={ghostButton} onClick={clearCheck}>
                Change columns
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {run.error ? (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      ) : null}
    </div>
  );
}

/** The first few new transactions, so a wrong column or sign is easy to spot. */
function PreviewRows({ preview }: { preview: BankImportResult }) {
  const fresh = preview.rows.filter((row) => row.outcome === "create").slice(0, 5);
  if (fresh.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-muted">
        {preview.created > fresh.length ? `First ${fresh.length} to add` : "To add"}
      </p>
      <ul className="divide-y divide-surface-0 text-sm">
        {fresh.map((row) => (
          <li key={row.row} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0 break-words text-fg">
              {row.payee || "No payee"} <span className="text-muted">· {row.date}</span>
            </span>
            <span
              className={`shrink-0 font-semibold tabular-nums ${row.amountCents > 0 ? "text-ok" : "text-fg"}`}
            >
              {row.amountCents > 0
                ? `+${formatSigned(row.amountCents)}`
                : formatSigned(row.amountCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentImports({ book, today }: { book: Book; today: string }) {
  const imports = useImports(book.id);
  const undo = useUndoImport();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-3">
      <h3 id={`${ids}-title`} className="font-semibold text-fg">
        Recent imports
      </h3>
      {imports.isPending ? (
        <LoadingRows rows={2} />
      ) : imports.isError ? (
        <ErrorNote error={imports.error} onRetry={() => void imports.refetch()} />
      ) : imports.data.length === 0 ? (
        <p className="text-sm text-muted">No imports into {book.name} yet.</p>
      ) : (
        <ul className="space-y-2">
          {imports.data.map((record: ImportRecord) => (
            <li
              key={record.id}
              className="space-y-2 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
            >
              <p className="font-semibold break-words text-fg">
                {record.fileName || (record.source === "ofx" ? "Bank statement" : "CSV file")}
              </p>
              <p className="text-sm text-muted">
                {[
                  formatShortDate(localDate(new Date(record.createdAt)), today),
                  record.account.name,
                  `${record.created.toLocaleString("en-US")} added`,
                  record.duplicates > 0 ? `${record.duplicates} skipped` : "",
                  record.undoneAt ? "Undone" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {record.undoneAt || record.remaining === 0 ? null : confirming === record.id ? (
                <div className="space-y-2">
                  <p className="text-sm text-fg">
                    Remove the {count(record.remaining, "transaction", "transactions")} this import
                    added? Any you've edited since go too.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={undo.isPending}
                      onClick={() =>
                        undo.mutate(record.id, {
                          onSuccess: () => {
                            setConfirming(null);
                            setAnnouncement("Import undone");
                          },
                        })
                      }
                      className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
                    >
                      Undo import
                    </button>
                    <button
                      type="button"
                      className={ghostButton}
                      onClick={() => setConfirming(null)}
                    >
                      Keep them
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${ghostButton} -ml-4`}
                  onClick={() => setConfirming(record.id)}
                >
                  Undo import
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {undo.error ? (
        <p role="alert" className="text-sm text-danger">
          {undo.error.message}
        </p>
      ) : null}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
    </section>
  );
}
