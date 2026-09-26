import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import type { AppPage } from "../../../client/pages";

/** Pages that don't fit in the phone tab bar. The desktop sidebar lists them all. */
export function MorePage({ pages }: { pages: AppPage[] }) {
  return (
    <>
      <PageHeader title="More" />
      <nav aria-label="More pages">
        <ul className="space-y-2">
          {pages.map((page) => (
            <li key={page.id}>
              <Link
                to={page.path}
                className="flex min-h-14 items-center gap-4 rounded-tile bg-mantle px-4 font-semibold text-fg ring-1 ring-surface-0/60 hover:ring-surface-1"
              >
                <page.icon aria-hidden="true" className="size-5 text-accent-text" />
                <span className="flex-1">{page.label}</span>
                <ChevronRight aria-hidden="true" className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
