import { canEncode, code39Bars } from "../../../shared/code39";

/** A Code 39 barcode for a SKU, drawn in the text color. Nothing if it can't be encoded. */
export function Barcode({ value, className = "" }: { value: string; className?: string }) {
  if (!canEncode(value)) return null;
  const { bars, width } = code39Bars(value);
  // A quiet zone of ten narrow bars on each side, so scanners find the edges.
  const quiet = 10;
  return (
    <svg
      viewBox={`0 0 ${width + quiet * 2} 40`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode for ${value}`}
      className={className}
    >
      {bars.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x + quiet}
          y={0}
          width={bar.width}
          height={40}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
