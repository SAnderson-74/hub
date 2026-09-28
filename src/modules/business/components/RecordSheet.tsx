import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { centsToInput, parseDollars } from "../../../shared/money";

type Base = {
  name: string;
  label: string;
  hint?: string;
  /** Sits beside the next half-width field on wider screens. */
  half?: boolean;
};

export type FieldSpec = Base &
  (
    | { kind: "text"; maxLength: number; required?: string; placeholder?: string }
    | { kind: "textarea"; rows?: number; placeholder?: string }
    | { kind: "money"; placeholder?: string }
    | { kind: "date" }
    | { kind: "select"; options: ReadonlyArray<readonly [string, string]> }
    | { kind: "checkbox" }
  );

/** What the form holds while editing: text for inputs, true or false for checkboxes. */
export type FormValues = Record<string, string | boolean>;
/** What it saves: trimmed text, cents or null, a date or null, or a boolean. */
export type SavedValues = Record<string, string | number | boolean | null>;

/** Form values from a stored record: cents become dollars, nulls become empty. */
export function toFormValues(
  fields: FieldSpec[],
  record: Record<string, unknown> | null,
): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const value = record?.[field.name];
    if (field.kind === "checkbox") values[field.name] = value === true;
    else if (field.kind === "money")
      values[field.name] = typeof value === "number" ? centsToInput(value) : "";
    else if (field.kind === "select")
      values[field.name] = typeof value === "string" ? value : (field.options[0]?.[0] ?? "");
    else values[field.name] = typeof value === "string" ? value : "";
  }
  return values;
}

function problem(field: FieldSpec, value: string | boolean): string | null {
  if (typeof value !== "string") return null;
  if (field.kind === "text" && field.required && value.trim() === "") return field.required;
  if (field.kind === "money" && value.trim() !== "" && parseDollars(value) === null) {
    return "Use an amount like 125 or 125.50.";
  }
  return null;
}

function saved(fields: FieldSpec[], values: FormValues): SavedValues {
  const result: SavedValues = {};
  for (const field of fields) {
    const value = values[field.name] ?? "";
    if (typeof value === "boolean") result[field.name] = value;
    else if (field.kind === "money")
      result[field.name] = value.trim() === "" ? null : parseDollars(value);
    else if (field.kind === "date") result[field.name] = value === "" ? null : value;
    else if (field.kind === "text") result[field.name] = value.trim();
    else result[field.name] = value;
  }
  return result;
}

/**
 * A sheet that adds or edits one record from a list of fields. Adding closes it;
 * saving an edit says so and stays open. Deleting asks first.
 */
export function RecordSheet({
  open,
  onClose,
  title,
  noun,
  fields,
  initial,
  isNew,
  onSave,
  onDelete,
  deleteWarning,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Lowercase, for buttons and messages: "Save step", "Step saved". */
  noun: string;
  fields: FieldSpec[];
  initial: FormValues;
  isNew: boolean;
  onSave: (values: SavedValues) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  /** Said before deleting, after "This can't be undone." */
  deleteWarning?: string;
  /** Anything extra below the form, like step reordering. */
  children?: ReactNode;
}) {
  const ids = useId();
  const [values, setValues] = useState(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const capital = noun.charAt(0).toUpperCase() + noun.slice(1);
  const problems = new Map(
    fields.flatMap((field) => {
      const found = problem(field, values[field.name] ?? "");
      return found ? [[field.name, found] as const] : [];
    }),
  );

  const run = async (action: () => Promise<unknown>, after: () => void) => {
    setBusy(true);
    setError("");
    try {
      await action();
      after();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    setMessage("");
    if (problems.size > 0) return;
    void run(
      () => onSave(saved(fields, values)),
      () => (isNew ? onClose() : setMessage(`${capital} saved`)),
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `${ids}-${field.name}`;
          const value = values[field.name] ?? "";
          const shown = tried ? problems.get(field.name) : undefined;
          const note = shown ?? field.hint;
          const describedBy = note ? `${id}-note` : undefined;
          const set = (next: string | boolean) =>
            setValues((current) => ({ ...current, [field.name]: next }));
          return (
            <div key={field.name} className={`min-w-0 ${field.half ? "" : "sm:col-span-2"}`}>
              {field.kind === "checkbox" ? (
                <label className="flex min-h-11 items-center gap-3 font-semibold text-fg">
                  <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => set(event.target.checked)}
                    aria-describedby={describedBy}
                    className="size-5 accent-accent"
                  />
                  {field.label}
                </label>
              ) : (
                <>
                  <label htmlFor={id} className={labelClass}>
                    {field.label}
                  </label>
                  {field.kind === "textarea" ? (
                    <textarea
                      id={id}
                      value={String(value)}
                      onChange={(event) => set(event.target.value)}
                      rows={field.rows ?? 3}
                      maxLength={20_000}
                      placeholder={field.placeholder}
                      aria-describedby={describedBy}
                      className={textareaClass}
                    />
                  ) : field.kind === "select" ? (
                    <select
                      id={id}
                      value={String(value)}
                      onChange={(event) => set(event.target.value)}
                      aria-describedby={describedBy}
                      className={inputClass}
                    >
                      {field.options.map(([option, label]) => (
                        <option key={option} value={option}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={field.kind === "date" ? "date" : "text"}
                      value={String(value)}
                      onChange={(event) => set(event.target.value)}
                      inputMode={field.kind === "money" ? "decimal" : undefined}
                      maxLength={field.kind === "text" ? field.maxLength : undefined}
                      placeholder={
                        field.kind === "text" || field.kind === "money"
                          ? field.placeholder
                          : undefined
                      }
                      autoComplete="off"
                      aria-invalid={shown ? true : undefined}
                      aria-describedby={describedBy}
                      className={`${inputClass} ${field.kind === "money" ? "tabular-nums" : ""} ${
                        field.kind === "date" ? "[color-scheme:dark]" : ""
                      }`}
                    />
                  )}
                </>
              )}
              {note ? (
                <p
                  id={`${id}-note`}
                  className={`mt-1.5 text-sm ${shown ? "text-danger" : "text-muted"}`}
                >
                  {note}
                </p>
              ) : null}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className={primaryButton} disabled={busy}>
            {isNew ? `Add ${noun}` : `Save ${noun}`}
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}
      </form>

      {children}

      {onDelete ? (
        <div className="mt-6 border-t border-surface-0/70 pt-4">
          {confirming ? (
            <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
              <p className="font-semibold text-fg">
                Delete this {noun}? This can't be undone.{deleteWarning ? ` ${deleteWarning}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(onDelete, onClose)}
                  className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
                >
                  Delete {noun}
                </button>
                <button type="button" className={ghostButton} onClick={() => setConfirming(false)}>
                  Keep {noun}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirming(true)}
            >
              Delete {noun}
            </button>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
