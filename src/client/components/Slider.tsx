import { useId } from "react";
import { labelClass } from "./ui";

const thumb =
  "[&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-mantle [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent focus-visible:[&::-webkit-slider-thumb]:ring-accent-text";

/** One value on a slider, with what it's set to written beside the label. */
export function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** How the value reads, like "$250 a month" or "5%". */
  format: (value: number) => string;
  hint?: string;
}) {
  const ids = useId();
  const percent =
    max === min ? 0 : ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${ids}-input`} className={labelClass}>
          {label}
        </label>
        <output htmlFor={`${ids}-input`} className="text-sm font-semibold text-fg tabular-nums">
          {format(value)}
        </output>
      </div>
      <div className="relative h-11">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-1" />
        <div
          className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ width: `${percent}%` }}
        />
        <input
          id={`${ids}-input`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          aria-valuetext={format(value)}
          aria-describedby={hint ? `${ids}-hint` : undefined}
          onChange={(event) => onChange(Number(event.target.value))}
          className={`absolute inset-0 h-11 w-full cursor-pointer appearance-none bg-transparent ${thumb}`}
        />
      </div>
      {hint ? (
        <p id={`${ids}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
