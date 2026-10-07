import { useId } from "react";
import { DATE_PRESETS, presetOf, presetRange } from "../../shared/listFilter";
import { inputClass, labelClass } from "./ui";

/** Quick ranges like "1 month" and "1 year", and boxes for exact first and last days. */
export function DateRangeFields({
  from,
  to,
  today,
  onChange,
}: {
  /** YYYY-MM-DD, or "" for no limit. */
  from: string;
  to: string;
  today: string;
  onChange: (from: string, to: string) => void;
}) {
  const ids = useId();
  const active = presetOf(from, to, today);
  const chip = (picked: boolean) =>
    `inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold ${
      picked ? "bg-surface-1 text-fg" : "bg-surface-0 text-muted hover:text-fg"
    }`;
  return (
    <fieldset className="min-w-0">
      <legend className={labelClass}>Dates</legend>
      <div className="flex flex-wrap gap-2">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active === preset.id}
            onClick={() => {
              const range = presetRange(preset.id, today);
              onChange(range.from, range.to);
            }}
            className={chip(active === preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={from === "" && to === ""}
          onClick={() => onChange("", "")}
          className={chip(from === "" && to === "")}
        >
          All time
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={`${ids}-from`} className="mb-1 block text-sm text-muted">
            From
          </label>
          <input
            id={`${ids}-from`}
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => onChange(event.target.value, to)}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-to`} className="mb-1 block text-sm text-muted">
            To
          </label>
          <input
            id={`${ids}-to`}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => onChange(from, event.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>
      </div>
    </fieldset>
  );
}
