import type { LucideIcon } from "lucide-react";
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "../lib/useMediaQuery";

/** Where the wide-screen header holds the page's tabs. AppShell provides it. */
export const HeaderTabsSlot = createContext<HTMLElement | null>(null);

export type PageTab<T extends string> = { value: T; label: string; icon: LucideIcon };

/**
 * A page's views (Money's Transactions, Budget, Bills...), as one choice. On
 * tablets and desktops they sit in the header; on phones, at the top of the page,
 * scrolling sideways when they don't fit. One per page.
 */
export function PageTabs<T extends string>({
  label,
  name,
  tabs,
  value,
  onChange,
}: {
  /** What the choice is, for screen readers, like "View". */
  label: string;
  /** The radio group's name, unique on the page. */
  name: string;
  tabs: readonly PageTab<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const slot = useContext(HeaderTabsSlot);
  const wide = useMediaQuery("(min-width: 48rem)");
  const inHeader = wide && slot !== null;

  const choice = (
    <fieldset
      className={`flex min-w-0 max-w-full overflow-x-auto rounded-full bg-mantle p-1 ring-1 ring-surface-0/60 [scrollbar-width:none] ${
        inHeader ? "h-12 items-center" : "mb-3"
      }`}
    >
      <legend className="sr-only">{label}</legend>
      {tabs.map((tab) => (
        <label key={tab.value} className="relative shrink-0">
          <input
            type="radio"
            name={name}
            value={tab.value}
            checked={value === tab.value}
            onChange={() => onChange(tab.value)}
            className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
          />
          <span className="pointer-events-none flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-muted transition-colors peer-checked:bg-accent peer-checked:text-on-accent peer-hover:text-fg peer-checked:peer-hover:text-on-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-mantle">
            {/* Icons only where there's room for them. */}
            <tab.icon aria-hidden="true" className="hidden size-4 xl:block" />
            {tab.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
  return inHeader ? createPortal(choice, slot) : choice;
}
