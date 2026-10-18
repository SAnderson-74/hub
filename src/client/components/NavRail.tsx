import { NavLink } from "react-router";
import type { AppPage } from "../pages";

const pillClass = "flex flex-col gap-1 rounded-full bg-mantle p-1 ring-1 ring-surface-0/60";

/**
 * Page navigation on tablets and desktops: icon buttons in floating pills down the
 * left edge, with Settings in its own pill at the bottom. Each icon's name and
 * shortcut show beside it on hover or focus (see Tooltips). The top pill scrolls
 * when the window is too short for every page.
 */
export function NavRail({ pages }: { pages: AppPage[] }) {
  const main = pages.filter((page) => page.id !== "settings");
  const bottom = pages.filter((page) => page.id === "settings");

  const item = (page: AppPage) => (
    <li key={page.id}>
      <NavLink
        to={page.path}
        end={page.path === "/"}
        aria-label={page.label}
        data-tip={`G ${page.key.toUpperCase()}`}
        data-tip-side="right"
        className={({ isActive }) =>
          `grid size-10 place-items-center rounded-full transition-colors ${
            isActive ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-0 hover:text-fg"
          }`
        }
      >
        <page.icon aria-hidden="true" className="size-[1.125rem]" />
      </NavLink>
    </li>
  );

  return (
    <nav
      aria-label="Main"
      className="fixed top-[calc(env(safe-area-inset-top)+4.5rem)] bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-[calc(env(safe-area-inset-left)+1rem)] z-20 hidden w-12 flex-col gap-2 md:flex"
    >
      <ul
        className={`${pillClass} min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none]`}
      >
        {main.map(item)}
      </ul>
      {bottom.length > 0 ? <ul className={`${pillClass} mt-auto`}>{bottom.map(item)}</ul> : null}
    </nav>
  );
}
