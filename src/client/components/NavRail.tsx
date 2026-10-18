import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import type { AppPage } from "../pages";

type Tip = { label: string; shortcut: string; top: number; left: number };

/** Where the name sits: just right of the icon, centered on it. */
function beside(link: HTMLElement): Pick<Tip, "top" | "left"> {
  const rect = link.getBoundingClientRect();
  return { top: rect.top + rect.height / 2, left: rect.right };
}

const pillClass = "flex flex-col gap-1 rounded-full bg-mantle p-1.5 ring-1 ring-surface-0/60";

/**
 * Page navigation on tablets and desktops: icon buttons in floating pills down the
 * left edge, with Settings in its own pill at the bottom. Hovering or focusing an
 * icon shows its name beside it. The name stays while the pointer moves onto it, and
 * Escape hides it. The top pill scrolls when the window is too short for every page.
 */
export function NavRail({ pages }: { pages: AppPage[] }) {
  const main = pages.filter((page) => page.id !== "settings");
  const bottom = pages.filter((page) => page.id === "settings");
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!tip) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTip(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tip]);

  const show = (page: AppPage, link: HTMLElement) => {
    anchor.current = link;
    setTip({ label: page.label, shortcut: `G ${page.key.toUpperCase()}`, ...beside(link) });
  };

  // Scrolling the pill (or focus scrolling an icon into view) moves the name along,
  // and hides it once its icon is out of sight.
  const follow = (list: HTMLElement) => {
    const link = anchor.current;
    if (!link) return;
    const box = list.getBoundingClientRect();
    const position = beside(link);
    const inView = position.top > box.top && position.top < box.bottom;
    setTip((current) => (current && inView ? { ...current, ...position } : null));
  };

  const item = (page: AppPage) => (
    <li key={page.id}>
      <NavLink
        to={page.path}
        end={page.path === "/"}
        aria-label={page.label}
        onPointerEnter={(event) => {
          // A tap goes straight to the page, so touch shows no name.
          if (event.pointerType !== "touch") show(page, event.currentTarget);
        }}
        onPointerLeave={(event) => {
          // Moving onto the name keeps it up.
          if (!tipRef.current?.contains(event.relatedTarget as Node | null)) setTip(null);
        }}
        onFocus={(event) => show(page, event.currentTarget)}
        onBlur={() => setTip(null)}
        className={({ isActive }) =>
          `grid size-11 place-items-center rounded-full transition-colors ${
            isActive ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-0 hover:text-fg"
          }`
        }
      >
        <page.icon aria-hidden="true" className="size-5" />
      </NavLink>
    </li>
  );

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed top-[calc(env(safe-area-inset-top)+5.25rem)] bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-[calc(env(safe-area-inset-left)+1rem)] z-20 hidden w-14 flex-col gap-3 md:flex"
      >
        <ul
          onScroll={(event) => follow(event.currentTarget)}
          className={`${pillClass} min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none]`}
        >
          {main.map(item)}
        </ul>
        {bottom.length > 0 ? <ul className={`${pillClass} mt-auto`}>{bottom.map(item)}</ul> : null}
      </nav>
      {tip ? (
        // The link already carries the name, so screen readers skip this copy.
        <div
          ref={tipRef}
          aria-hidden="true"
          onPointerLeave={() => setTip(null)}
          style={{ top: tip.top, left: tip.left }}
          className="fixed z-30 -translate-y-1/2 pl-3"
        >
          <div className="flex items-center gap-3 rounded-full bg-surface-0 py-2 pr-2 pl-4 text-sm font-semibold whitespace-nowrap text-fg ring-1 ring-surface-1">
            {tip.label}
            <span className="rounded-full bg-base px-2 py-0.5 text-xs text-muted">
              {tip.shortcut}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
