import type { ReactNode } from "react";

/** A tappable list row: a title, a line of details, and a value at the end. */
export function Row({
  title,
  meta,
  value,
  onOpen,
  label,
}: {
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  onOpen: () => void;
  /** The button's accessible name when the title alone isn't enough. */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="flex min-h-14 w-full items-center gap-3 rounded-tile bg-base/80 px-4 py-3 text-left ring-1 ring-surface-0/50 hover:bg-surface-0/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words text-fg">{title}</span>
        {meta ? <span className="block text-sm text-muted">{meta}</span> : null}
      </span>
      {value === undefined || value === null ? null : (
        <span className="shrink-0 font-semibold text-fg tabular-nums">{value}</span>
      )}
    </button>
  );
}

/** A labeled group of rows, like "Need" in the gear list. */
export function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold text-muted">
        <span>{title}</span>
        {note ? <span className="font-normal">{note}</span> : null}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
