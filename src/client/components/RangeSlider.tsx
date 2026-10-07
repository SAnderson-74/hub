import { useId } from "react";
import { inputClass, labelClass } from "./ui";

const thumb =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-mantle [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent focus-visible:[&::-webkit-slider-thumb]:ring-accent-text";

/**
 * A two-handle slider for a range of dollar amounts, with boxes to type exact ones.
 * `null` means no limit on that side; the handle then rests at the end. Whole dollars.
 */
export function RangeSlider({
  label,
  max,
  low,
  high,
  onChange,
}: {
  label: string;
  /** The slider's top, in dollars. */
  max: number;
  /** The limits in dollars, or null for none. */
  low: number | null;
  high: number | null;
  onChange: (low: number | null, high: number | null) => void;
}) {
  const ids = useId();
  const step = Math.max(1, Math.round(max / 100));
  const lowValue = Math.min(low ?? 0, max);
  const highValue = Math.min(high ?? max, max);
  const percent = (value: number) => (max === 0 ? 0 : (value / max) * 100);
  // Handles can't pass each other, and resting at an end means no limit.
  const set = (nextLow: number, nextHigh: number) =>
    onChange(nextLow <= 0 ? null : nextLow, nextHigh >= max ? null : nextHigh);
  const typed = (text: string): number | null => {
    const value = Number(text.replace(/[$,\s]/g, ""));
    return text.trim() === "" || !Number.isFinite(value) || value < 0 ? null : Math.round(value);
  };

  return (
    <fieldset className="min-w-0">
      <legend className={labelClass}>{label}</legend>
      <div className="relative h-11">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-1" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{
            left: `${percent(lowValue)}%`,
            width: `${Math.max(0, percent(highValue) - percent(lowValue))}%`,
          }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={lowValue}
          aria-label={`${label}, at least`}
          onChange={(event) => set(Math.min(Number(event.target.value), highValue), highValue)}
          className={`pointer-events-none absolute inset-0 h-11 w-full appearance-none bg-transparent ${thumb}`}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={highValue}
          aria-label={`${label}, at most`}
          onChange={(event) => set(lowValue, Math.max(Number(event.target.value), lowValue))}
          className={`pointer-events-none absolute inset-0 h-11 w-full appearance-none bg-transparent ${thumb}`}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={`${ids}-low`} className="mb-1 block text-sm text-muted">
            At least
          </label>
          <input
            id={`${ids}-low`}
            value={low === null ? "" : String(low)}
            onChange={(event) => onChange(typed(event.target.value), high)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="$0"
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-high`} className="mb-1 block text-sm text-muted">
            At most
          </label>
          <input
            id={`${ids}-high`}
            value={high === null ? "" : String(high)}
            onChange={(event) => onChange(low, typed(event.target.value))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="No limit"
            className={`${inputClass} tabular-nums`}
          />
        </div>
      </div>
    </fieldset>
  );
}
