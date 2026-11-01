import { Ellipsis, Keyboard, type LucideIcon, Search } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { appCommands, menuKeyLabel } from "../lib/commands";
import { initialsFor } from "../lib/format";
import { phoneNav } from "../lib/nav";
import { useModules, useSystem } from "../lib/queries";
import { useShortcuts } from "../lib/useShortcuts";
import type { AppPage } from "../pages";
import { BrandMark } from "./BrandMark";
import { CommandMenu } from "./CommandMenu";
import { NavRail } from "./NavRail";
import { HeaderTabsSlot } from "./PageTabs";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { Tooltips } from "./Tooltips";
import { UndoBar } from "./UndoBar";
import { iconButton } from "./ui";

/** A floating pill in the wide-screen header. */
const pillClass = "flex h-12 items-center gap-2.5 rounded-full bg-mantle ring-1 ring-surface-0/60";

/**
 * Layout for every page. Phones get a top bar and a bottom tab bar. Wider screens
 * get a header of floating pills (name, the page's tabs, search, shortcuts, who is
 * signed in) and a rail of page icons down the left edge. Safe-area insets keep content clear of the
 * iPhone notch and home indicator.
 */
export function AppShell({ pages }: { pages: AppPage[] }) {
  const system = useSystem();
  const { pathname } = useLocation();
  const { tabs, more } = phoneNav(pages);
  const appName = system.data?.appName ?? "Hub";
  const user = system.data?.user;
  const modules = useModules();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tabsSlot, setTabsSlot] = useState<HTMLElement | null>(null);
  useShortcuts({
    pages,
    onToggleMenu: () => setMenuOpen((value) => !value),
    onOpenMenu: () => setMenuOpen(true),
    onShowShortcuts: () => setShortcutsOpen(true),
  });
  const menuKey = menuKeyLabel(typeof navigator === "undefined" ? "" : navigator.userAgent);

  return (
    <div className="min-h-dvh bg-base text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-on-accent"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-10 hidden grid-cols-[1fr_minmax(0,max-content)_1fr] items-center gap-3 bg-base/85 pt-[calc(env(safe-area-inset-top)+0.75rem)] pr-[calc(env(safe-area-inset-right)+1rem)] pb-3 pl-[calc(env(safe-area-inset-left)+1rem)] backdrop-blur-md md:grid">
        <Link to="/" className={`${pillClass} justify-self-start p-1 pr-4 hover:ring-surface-1`}>
          <BrandMark className="size-10 shrink-0" />
          <span className="truncate text-[1.0625rem] font-bold tracking-[-0.02em]">{appName}</span>
        </Link>
        {/* The page's tabs, when it has them (PageTabs). */}
        <div ref={setTabsSlot} className="flex min-w-0 justify-center" />
        <div className="flex items-center gap-2 justify-self-end">
          <div className={`${pillClass} gap-0.5 p-1`}>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Search"
              aria-keyshortcuts="Control+K Meta+K /"
              data-tip={menuKey}
              className={`${iconButton} size-10`}
            >
              <Search aria-hidden="true" className="size-[1.125rem]" />
            </button>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
              aria-keyshortcuts="?"
              data-tip="?"
              className={`${iconButton} size-10`}
            >
              <Keyboard aria-hidden="true" className="size-[1.125rem]" />
            </button>
          </div>
          {user ? <UserPill name={user.name} login={user.login} /> : null}
        </div>
      </header>
      <NavRail pages={pages} />

      <header className="sticky top-0 z-10 flex items-center gap-2.5 bg-base/85 px-3.5 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 backdrop-blur-md md:hidden">
        <BrandMark className="size-8" />
        <span className="min-w-0 flex-1 truncate text-lg font-bold tracking-[-0.02em]">
          {appName}
        </span>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Search"
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg"
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
      </header>
      <div className="md:pl-[calc(env(safe-area-inset-left)+4rem)]">
        <main
          id="main"
          className="mx-auto w-full max-w-[120rem] px-3.5 pt-2 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:px-6 md:pt-3 md:pb-10"
        >
          <HeaderTabsSlot value={tabsSlot}>
            <Outlet />
          </HeaderTabsSlot>
        </main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 bg-mantle/90 pb-[env(safe-area-inset-bottom)] ring-1 ring-surface-0/60 backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col px-3 pt-2 pb-1.5">
          {tabs.map((page) => (
            <li key={page.id}>
              <TabLink to={page.path} label={page.label} icon={page.icon} end={page.path === "/"} />
            </li>
          ))}
          {more.length > 0 ? (
            <li>
              <TabLink
                to="/more"
                label="More"
                icon={Ellipsis}
                active={more.some((page) => pathname.startsWith(page.path))}
              />
            </li>
          ) : null}
        </ul>
      </nav>

      <CommandMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        commands={appCommands(pages, modules)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} pages={pages} />
      <UndoBar />
      <Tooltips />
    </div>
  );
}

/** Who is signed in. The name and login show on large displays; the initials always. */
function UserPill({ name, login }: { name: string; login: string }) {
  return (
    <div className={`${pillClass} min-w-0 p-1 2xl:pr-4`}>
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-0 text-sm font-bold text-accent-text"
      >
        {initialsFor(name || login)}
      </span>
      <span className="sr-only min-w-0 2xl:not-sr-only">
        <span className="sr-only">Signed in as </span>
        <span className="block max-w-48 truncate text-sm font-semibold text-fg">{name}</span>
        {login !== name ? (
          <span className="block max-w-48 truncate text-xs text-muted">{login}</span>
        ) : null}
      </span>
    </div>
  );
}

/** A phone tab. `active` marks it current for pages it stands for, like More. */
function TabLink({
  to,
  label,
  icon: Icon,
  end = false,
  active = false,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  active?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 rounded-control py-1 text-xs font-semibold transition-colors ${
          isActive || active ? "text-fg" : "text-muted"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${
              isActive || active ? "bg-accent/20 text-accent-text" : ""
            }`}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
