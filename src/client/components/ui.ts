// Class names for common controls, so forms look the same on every page.
// Heights are at least 44px (h-11) for touch.

export const inputClass =
  "h-12 w-full rounded-control bg-base px-4 text-fg ring-1 ring-surface-1 placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent-text focus-visible:outline-none aria-invalid:ring-danger disabled:opacity-50";

export const textareaClass =
  "min-h-28 w-full rounded-control bg-base px-4 py-3 text-fg ring-1 ring-surface-1 placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent-text focus-visible:outline-none";

export const labelClass = "mb-1.5 block text-sm font-semibold text-muted";

export const primaryButton =
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 font-bold text-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-40";

export const secondaryButton =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-surface-0 px-4 font-semibold text-fg hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40";

export const ghostButton =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 font-semibold text-muted hover:bg-surface-0 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40";

export const dangerButton =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";

export const iconButton =
  "grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40";
