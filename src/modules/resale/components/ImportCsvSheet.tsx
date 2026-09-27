import { type ChangeEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { parseCsv } from "../../../shared/csv";
import {
  type ColumnMapping,
  guessMapping,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportResult,
  rowsFromCsv,
} from "../../../shared/resaleImport";
import { useImportResale } from "../queries";

const MAPPING_KEY = "hub.resale.import.mapping";

/** The mapping last used for a file with exactly these headers, on this device. */
function storedMapping(headers: string[]): ColumnMapping | null {
  try {
    const saved = JSON.parse(localStorage.getItem(MAPPING_KEY) ?? "null") as {
      headers: string[];
      mapping: ColumnMapping;
    } | null;
    return saved && saved.headers.join("\u0000") === headers.join("\u0000") ? saved.mapping : null;
  } catch {
    return null;
  }
}

function storeMapping(headers: string[], mapping: ColumnMapping) {
  try {
    localStorage.setItem(MAPPING_KEY, JSON.stringify({ headers, mapping }));
  } catch {
    // Private browsing; the mapping just isn't remembered.
  }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function describe(result: ImportResult, done: boolean): string[] {
  const lines = [
    result.created
      ? `${count(result.created, "item", "items")} ${done ? "added" : "to add"}${
          result.needsReview ? `, ${result.needsReview} flagged to review` : ""
        }`
      : null,
    result.duplicates
      ? `${count(result.duplicates, "row is", "rows are")} already in Hub and ${done ? "were" : "will be"} skipped`
      : null,
    result.skipped
      ? `${count(result.skipped, "row has", "rows have")} no title and ${done ? "were" : "will be"} skipped`
      : null,
    result.platformsCreated.length
      ? `New ${result.platformsCreated.length === 1 ? "platform" : "platforms"}: ${result.platformsCreated.join(", ")}`
      : null,
  ].filter((line): line is string => line !== null);
  return lines.length > 0 ? lines : ["Nothing to import."];
}

/**
 * Imports items from a spreadsheet export: pick or paste a CSV, match its columns to
 * Hub's fields, check what would happen, then import.
 */
export function ImportCsvSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import from a spreadsheet"
      description="A CSV file with a header row. Rows with missing or unreadable values are imported and flagged to review."
    >
      {open ? <ImportForm onDone={onClose} /> : null}
    </Sheet>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = useImportResale();
  const ids = useId();
  const headers = table?.[0] ?? [];
  const sample = table?.[1] ?? [];

  const reset = (value: string) => {
    setText(value);
    setTable(null);
    setPreview(null);
    setResult(null);
    setParseError("");
    run.reset();
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) reset(await file.text());
  };

  const read = () => {
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setParseError("That file needs a header row and at least one row of items.");
      return;
    }
    const first = parsed[0] ?? [];
    setTable(parsed);
    setMapping(storedMapping(first) ?? guessMapping(first));
  };

  const setField = (field: (typeof IMPORT_FIELDS)[number], value: string) => {
    setPreview(null);
    run.reset();
    setMapping((current) => {
      const next = { ...current };
      if (value === "") delete next[field];
      else next[field] = Number(value);
      return next;
    });
  };

  const rows = table ? rowsFromCsv(table, mapping) : [];
  const check = () => {
    storeMapping(headers, mapping);
    run.mutate({ rows, dryRun: true }, { onSuccess: setPreview });
  };

  if (result) {
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          Import finished
        </p>
        <ul className="list-disc space-y-1 pl-5 text-fg">
          {describe(result, true).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {result.needsReview > 0 ? (
          <p className="text-sm text-muted">
            Flagged items show "Needs review" on the Resale page, with what to check.
          </p>
        ) : null}
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="space-y-5">
        <div>
          <label htmlFor={`${ids}-file`} className={labelClass}>
            Choose a file
          </label>
          <input
            id={`${ids}-file`}
            type="file"
            accept="text/csv,.csv,text/plain"
            onChange={(event) => void onFile(event)}
            className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-full file:border-0 file:bg-surface-0 file:px-4 file:font-semibold file:text-fg"
          />
        </div>
        <div>
          <label htmlFor={`${ids}-text`} className={labelClass}>
            Or paste it
          </label>
          <textarea
            id={`${ids}-text`}
            value={text}
            onChange={(event) => reset(event.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"Title,Price paid,Bought on\nDesk lamp,5.00,2030-01-31"}
            className={`${textareaClass} font-mono text-sm`}
          />
        </div>
        <button type="button" className={secondaryButton} disabled={!text.trim()} onClick={read}>
          Read columns
        </button>
        {parseError ? (
          <p role="alert" className="text-sm text-danger">
            {parseError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {count(table.length - 1, "row", "rows")} and {count(headers.length, "column", "columns")}.
        Match each column to a field; leave fields you don't have as "Not in the file".
      </p>
      <fieldset className="min-w-0 space-y-3">
        <legend className="sr-only">Columns</legend>
        {IMPORT_FIELDS.map((field) => {
          const index = mapping[field];
          const example = index === undefined ? "" : (sample[index] ?? "").trim();
          return (
            <div
              key={field}
              className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-3"
            >
              <label htmlFor={`${ids}-${field}`} className="text-sm font-semibold text-muted">
                {IMPORT_FIELD_LABELS[field]}
              </label>
              <div className="min-w-0">
                <select
                  id={`${ids}-${field}`}
                  value={index === undefined ? "" : String(index)}
                  onChange={(event) => setField(field, event.target.value)}
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
                  <p id={`${ids}-${field}-example`} className="mt-1 truncate text-xs text-faint">
                    e.g. {example}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </fieldset>
      {mapping.title === undefined ? (
        <p className="text-sm text-warn">Choose the column with each item's title.</p>
      ) : null}

      {preview ? (
        <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-surface-1">
          <p className="font-semibold text-fg">Importing will do this:</p>
          <ul className="list-disc space-y-1 pl-5 text-fg">
            {describe(preview, false).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {preview.rows.some((row) => row.problems.length > 0) ? (
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
                Rows to look at
              </summary>
              <ul className="space-y-2">
                {preview.rows
                  .filter((row) => row.problems.length > 0)
                  .slice(0, 50)
                  .map((row) => (
                    <li key={row.row} className="text-muted">
                      <span className="font-semibold text-fg">
                        Row {row.row}
                        {row.title ? `, ${row.title}` : ""}:
                      </span>{" "}
                      {row.problems.join(" ")}
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
              onClick={() =>
                run.mutate({ rows, dryRun: false }, { onSuccess: (done) => setResult(done) })
              }
            >
              {preview.created === 0
                ? "Nothing to import"
                : `Import ${count(preview.created, "item", "items")}`}
            </button>
            <button type="button" className={ghostButton} onClick={() => setPreview(null)}>
              Change columns
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButton}
            disabled={mapping.title === undefined || run.isPending}
            onClick={check}
          >
            Check import
          </button>
          <button type="button" className={ghostButton} onClick={() => reset(text)}>
            Choose another file
          </button>
        </div>
      )}
      {run.error ? (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      ) : null}
    </div>
  );
}
