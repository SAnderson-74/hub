import { type ChangeEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import type { EducationImport, ImportSummary } from "../../../shared/education";
import { useImportEducation } from "../queries";

function describe(summary: ImportSummary): string[] {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const lines = [
    summary.termsCreated ? count(summary.termsCreated, "new term", "new terms") : null,
    summary.termsUpdated ? count(summary.termsUpdated, "term updated", "terms updated") : null,
    summary.coursesCreated ? count(summary.coursesCreated, "new course", "new courses") : null,
    summary.coursesUpdated
      ? count(summary.coursesUpdated, "course updated", "courses updated")
      : null,
    summary.assessmentsAdded
      ? count(summary.assessmentsAdded, "new assessment", "new assessments")
      : null,
  ].filter((line): line is string => line !== null);
  return lines.length > 0 ? lines : ["Nothing to change. Everything in the file is already here."];
}

/**
 * Loads a hub-education/v1 plan: paste it or pick a file, check what would change,
 * then import. Importing an updated plan again changes what's there.
 */
export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import a study plan"
      description="A hub-education/v1 file. Terms are matched by name and courses by code, so importing again updates them."
    >
      {open ? <ImportForm onDone={onClose} /> : null}
    </Sheet>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState<{ data: EducationImport; summary: ImportSummary } | null>(
    null,
  );
  const [result, setResult] = useState<ImportSummary | null>(null);
  const run = useImportEducation();
  const ids = useId();

  const reset = (value: string) => {
    setText(value);
    setPreview(null);
    setResult(null);
    setParseError("");
    run.reset();
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) reset(await file.text());
  };

  const check = () => {
    let data: EducationImport;
    try {
      data = JSON.parse(text) as EducationImport;
    } catch {
      setParseError("That isn't valid JSON. Check the file, or paste it again.");
      return;
    }
    run.mutate({ data, dryRun: true }, { onSuccess: (summary) => setPreview({ data, summary }) });
  };

  if (result) {
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          Plan imported
        </p>
        <ul className="list-disc space-y-1 pl-5 text-fg">
          {describe(result).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${ids}-file`} className={labelClass}>
          Choose a file
        </label>
        <input
          id={`${ids}-file`}
          type="file"
          accept="application/json,.json"
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
          rows={8}
          spellCheck={false}
          placeholder='{ "format": "hub-education/v1", "terms": [ ... ] }'
          className={`${textareaClass} font-mono text-sm`}
        />
      </div>

      {preview ? (
        <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-surface-1">
          <p className="font-semibold text-fg">Importing will make these changes:</p>
          <ul className="list-disc space-y-1 pl-5 text-fg">
            {describe(preview.summary).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={run.isPending}
              onClick={() =>
                run.mutate(
                  { data: preview.data, dryRun: false },
                  { onSuccess: (summary) => setResult(summary) },
                )
              }
            >
              Import plan
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
          Check file
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
