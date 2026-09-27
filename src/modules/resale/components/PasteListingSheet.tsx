import { useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import type { ListingImport, ListingImportResult } from "../../../shared/resaleListing";
import { useImportListing } from "../queries";

function describe(result: ListingImportResult): string[] {
  return [
    result.outcome === "created"
      ? `A new item: ${result.title}${result.needsReview ? ", flagged to review" : ""}`
      : result.outcome === "listed"
        ? `A new listing on ${result.title}, which is already in Hub`
        : `Nothing to add: ${result.title} is already in Hub and the listing has no price`,
    result.platformCreated ? `New platform: ${result.platformCreated}` : "",
  ].filter(Boolean);
}

/**
 * Adds a hub-listing/v1 listing that a writing assistant produced: paste it, check
 * what it will do, then add it. An iOS Shortcut can send the same thing (see SETUP.md).
 */
export function PasteListingSheet({
  open,
  onClose,
  onOpenItem,
}: {
  open: boolean;
  onClose: () => void;
  onOpenItem: (id: number) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste a listing"
      description="A hub-listing/v1 listing. If an unsold item has the same title, the listing is added to it."
    >
      {open ? <PasteForm onDone={onClose} onOpenItem={onOpenItem} /> : null}
    </Sheet>
  );
}

function PasteForm({
  onDone,
  onOpenItem,
}: {
  onDone: () => void;
  onOpenItem: (id: number) => void;
}) {
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState<{
    data: ListingImport;
    result: ListingImportResult;
  } | null>(null);
  const [done, setDone] = useState<ListingImportResult | null>(null);
  const run = useImportListing();
  const ids = useId();

  const reset = (value: string) => {
    setText(value);
    setPreview(null);
    setParseError("");
    run.reset();
  };

  const check = () => {
    let data: ListingImport;
    try {
      data = JSON.parse(text) as ListingImport;
    } catch {
      setParseError(
        "That isn't valid JSON. Copy the whole listing, from { to }, and paste it again.",
      );
      return;
    }
    run.mutate({ data, dryRun: true }, { onSuccess: (result) => setPreview({ data, result }) });
  };

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          {done.outcome === "unchanged" ? "Nothing added" : "Listing added"}
        </p>
        <p className="text-fg">{done.message}</p>
        {done.problems.length > 0 ? (
          <p className="text-sm text-muted">To check: {done.problems.join(" ")}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {done.itemId !== null ? (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                const id = done.itemId;
                onDone();
                if (id !== null) onOpenItem(id);
              }}
            >
              Open item
            </button>
          ) : null}
          <button type="button" className={secondaryButton} onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${ids}-text`} className={labelClass}>
          Listing
        </label>
        <textarea
          id={`${ids}-text`}
          value={text}
          onChange={(event) => reset(event.target.value)}
          rows={10}
          spellCheck={false}
          placeholder='{ "format": "hub-listing/v1", "item": { ... }, "listing": { ... } }'
          className={`${textareaClass} font-mono text-sm`}
        />
      </div>

      {preview ? (
        <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-surface-1">
          <p className="font-semibold text-fg">Adding this will make:</p>
          <ul className="list-disc space-y-1 pl-5 text-fg">
            {describe(preview.result).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {preview.result.problems.length > 0 ? (
            <p className="text-sm text-muted">To check: {preview.result.problems.join(" ")}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={run.isPending || preview.result.outcome === "unchanged"}
              onClick={() =>
                run.mutate({ data: preview.data, dryRun: false }, { onSuccess: setDone })
              }
            >
              Add listing
            </button>
            <button type="button" className={ghostButton} onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={secondaryButton}
          disabled={!text.trim() || run.isPending}
          onClick={check}
        >
          Check listing
        </button>
      )}

      {parseError || run.error ? (
        <p role="alert" className="text-sm text-danger">
          {parseError || run.error?.message}
        </p>
      ) : null}
    </div>
  );
}
