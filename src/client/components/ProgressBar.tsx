/** A thin bar with its value as text next to it; color never carries meaning alone. */
export function ProgressBar({
  percent,
  label,
  complete = false,
}: {
  percent: number;
  label: string;
  complete?: boolean;
}) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="block h-2 w-full overflow-hidden rounded-full bg-surface-0"
    >
      <span
        className={`block h-full rounded-full ${complete ? "bg-ok" : "bg-accent"}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}
