/** Logo: a hub node with three links. Colors follow the theme. */
export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="10" className="fill-surface-0" />
      <path
        d="M16 16 9.5 9.5M16 16l6.5-6.5M16 16v8.5"
        className="stroke-accent"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="9.5" cy="9.5" r="2.4" className="fill-fg" />
      <circle cx="22.5" cy="9.5" r="2.4" className="fill-fg" />
      <circle cx="16" cy="24.5" r="2.4" className="fill-fg" />
      <circle cx="16" cy="16" r="3.8" className="fill-accent" />
    </svg>
  );
}
