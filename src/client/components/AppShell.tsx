import { Ellipsis, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router";
import { phoneNav } from "../lib/nav";
import { useSystem } from "../lib/queries";
import type { AppPage } from "../pages";
import { BrandMark } from "./BrandMark";

/**
 * Layout for every page: a sidebar on wide screens, a bottom tab bar on phones.
 * Safe-area insets keep content clear of the iPhone notch and home indicator.
 */
export function AppShell({ pages }: { pages: AppPage[] }) {
  const system = useSystem();
  const { pathname } = useLocation();
  const { tabs, more } = phoneNav(pages);
  const appName = system.data?.appName ?? "Hub";
  const version = system.data?.version;

  return (
    <div className="min-h-dvh bg-base text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-on-accent"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-mantle px-4 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-6 ring-1 ring-surface-0/60 md:flex">
        <div className="flex items-center gap-3 px-2">
          <BrandMark />
          <span className="text-lg font-bold tracking-[-0.02em]">{appName}</span>
        </div>
        <nav aria-label="Main" className="mt-9">
          <ul className="flex flex-col gap-1">
            {pages.map((page) => (
              <li key={page.id}>
                <NavLink
                  to={page.path}
                  end={page.path === "/"}
                  className={({ isActive }) =>
                    `flex h-11 items-center gap-3 rounded-control px-3 font-semibold transition-colors ${
                      isActive
                        ? "bg-surface-0 text-fg"
                        : "text-muted hover:bg-surface-0/50 hover:text-fg"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <page.icon
                        aria-hidden="true"
                        className={`size-5 ${isActive ? "text-accent-text" : ""}`}
                      />
                      {page.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {version ? <p className="mt-auto px-3 text-sm text-faint">Version {version}</p> : null}
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-base/85 px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 backdrop-blur-md md:hidden">
          <BrandMark className="size-8" />
          <span className="text-lg font-bold tracking-[-0.02em]">{appName}</span>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:px-10 md:pt-12 md:pb-16"
        >
          <Outlet />
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
