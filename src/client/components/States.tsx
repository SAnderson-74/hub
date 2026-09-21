import { CircleAlert, RotateCcw } from "lucide-react";

const PLACEHOLDER_KEYS = ["one", "two", "three", "four", "five"];

export function LoadingRows({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only">Loading</span>
      {PLACEHOLDER_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="h-16 animate-pulse rounded-tile bg-base/80" />
      ))}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-tile bg-base/80 p-4 ring-1 ring-danger/40"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fg">Couldn't load this</p>
        <p className="mt-0.5 text-sm text-muted">{error.message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent-text hover:bg-surface-0"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Try again
        </button>
      ) : null}
    </div>
  );
}
