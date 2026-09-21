import { type ReactNode, useId } from "react";

type PanelProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Top-level content block. Tiles inside a panel use rounded-tile and bg-base. */
export function Panel({ title, description, action, children, className = "" }: PanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-panel bg-mantle p-5 ring-1 ring-surface-0/60 md:p-6 ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold tracking-[-0.01em] text-fg">
            {title}
          </h2>
          {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
