/** A labeled number in a tile, for overviews. */
export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold tracking-[-0.02em] text-fg">{value}</p>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
