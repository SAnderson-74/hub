import { PackagePlus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  labelClass,
  primaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { readPaste } from "../../../shared/claudeProject";
import { inventoryDocumentSchema, inventoryRows } from "../../../shared/inventory";
import type { ImportResult, ImportRow } from "../../../shared/resaleImport";
import { useImportResale } from "../queries";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reads a Claude Project answer as items to sell, or says what's wrong. Null when empty. */
export function readPastedItems(
  text: string,
): { rows: ImportRow[]; cleaned: number } | { error: string } | null {
  const pasted = readPaste(text);
  if (!pasted) return null;
  if (!pasted.ok) return { error: pasted.error };
  if (pasted.format.format !== "hub-inventory/v1") {
    return {
      error: `That's ${pasted.format.noun} for ${pasted.format.into}, not items to sell. Paste it there, or in Settings > Imports > Paste from Claude.`,
    };
  }
  const parsed = inventoryDocumentSchema.safeParse(pasted.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `The items don't fit the format${issue ? `: ${issue.message}` : "."} Ask the Project again.`,
    };
  }
  return inventoryRows(parsed.data);
}

/** Several things to sell, read by a Claude Project, added to Resale at once. */
export function PasteItemsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste items"
      description="Things to sell, from your Claude Project. Items already in Hub are skipped, and ones missing details are flagged to review."
    >
      {open ? <PasteItemsForm onDone={onClose} /> : null}
    </Sheet>
  );
}

/** The paste, preview, and add; also used by the one paste box for every import. */
export function PasteItemsForm({
  initialText = "",
  onDone,
}: {
  initialText?: string;
  onDone: () => void;
}) {
  const ids = useId();
  const [text, setText] = useState(initialText);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const run = useImportResale();
  const read = readPastedItems(text);
  const rows = read && "rows" in read ? read.rows : null;

  // The preview follows the paste, so what it shows is what adding will do.
  const key = JSON.stringify(rows);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key covers the rows
  useEffect(() => {
    if (!rows) {
      setPreview(null);
      return;
    }
    run.mutate({ rows, dryRun: true }, { onSuccess: setPreview, onError: () => setPreview(null) });
  }, [key]);

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          Added {count(done.created, "item", "items")}
        </p>
        {done.needsReview > 0 ? (
          <p className="text-fg">
            {count(done.needsReview, "is", "are")} flagged to review: fill in what you paid and when
            from the item.
          </p>
        ) : null}
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${ids}-paste`} className={labelClass}>
          Claude Project answer
        </label>
        <textarea
          id={`${ids}-paste`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          spellCheck={false}
          placeholder='{ "format": "hub-inventory/v1", "items": [ … ] }'
          aria-describedby={`${ids}-paste-hint`}
          className={`${textareaClass} font-mono text-sm`}
        />
        <p
          id={`${ids}-paste-hint`}
          className={`mt-1.5 text-sm ${read && "error" in read ? "text-danger" : "text-muted"}`}
        >
          {read && "error" in read
            ? read.error
            : read && read.cleaned > 0
              ? `Serial, IMEI, and other long numbers were taken out of ${count(read.cleaned, "item", "items")}.`
              : "Nothing changes until you add the items. Serial and IMEI numbers are taken out."}
        </p>
      </div>

      {run.error && !preview ? (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      ) : null}

      {preview ? (
        <div className={`space-y-4 ${run.isPending ? "opacity-60" : ""}`}>
          <p className="font-semibold text-fg">
            {preview.created === 0
              ? "Nothing new to add"
              : `${count(preview.created, "item", "items")} to add${preview.needsReview > 0 ? `, ${preview.needsReview} flagged to review` : ""}`}
            {preview.duplicates > 0
              ? `. ${count(preview.duplicates, "is", "are")} already in Hub and will be skipped.`
              : ""}
          </p>
          <ul className="space-y-2">
            {preview.rows.map((row) => (
              <li
                key={row.row}
                className="space-y-1 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
              >
                <span className="flex items-start gap-3">
                  <PackagePlus aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block font-semibold break-words text-fg">
                      {row.title || "No title"}
                    </span>
                    <span
                      className={`block text-sm font-semibold ${row.outcome === "create" ? (row.problems.length > 0 ? "text-warn" : "text-ok") : "text-muted"}`}
                    >
                      {row.outcome === "create"
                        ? row.problems.length > 0
                          ? "Adds it, flagged to review"
                          : "Adds it"
                        : row.outcome === "duplicate"
                          ? "Already in Hub, so it's skipped"
                          : "Left out"}
                    </span>
                    {row.problems.length > 0 && row.outcome !== "duplicate" ? (
                      <span className="block text-sm text-muted">{row.problems.join(" ")}</span>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={run.isPending || preview.created === 0 || !rows}
              onClick={() => {
                if (rows) run.mutate({ rows, dryRun: false }, { onSuccess: setDone });
              }}
            >
              {preview.created === 0
                ? "Nothing to add"
                : `Add ${count(preview.created, "item", "items")}`}
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
      ) : rows && run.isPending ? (
        <p className="text-sm text-muted">Checking…</p>
      ) : null}
    </div>
  );
}
