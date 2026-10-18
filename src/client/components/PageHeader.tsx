import type { ReactNode } from "react";

/** The page title, with the page's own buttons (`actions`) beside it. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-[1.15] tracking-[-0.025em] text-fg md:text-3xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-muted md:text-[1rem]">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
