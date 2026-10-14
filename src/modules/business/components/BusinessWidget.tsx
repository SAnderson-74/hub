import { Briefcase, CalendarDays, Users } from "lucide-react";
import { Link } from "react-router";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { ghostButton } from "../../../client/components/ui";
import { describeDue } from "../../tasks/dates";
import { useBusiness } from "../queries";
import { followUpsDue } from "../summary";

/** How far ahead Home looks for follow-ups and steps. */
const AHEAD_DAYS = 7;
const SHOWN = 5;

const dueTone = { danger: "text-danger", warn: "text-warn", muted: "text-muted" } as const;

/** Lead follow-ups and plan steps due within a week, overdue ones first. */
export function BusinessWidget({ today, className }: { today: string; className?: string }) {
  const business = useBusiness();
  const items = business.data ? followUpsDue(business.data, today, AHEAD_DAYS) : [];

  return (
    <Panel
      title="Business follow-ups"
      action={
        <Link to="/business" className={ghostButton}>
          Open business
        </Link>
      }
      className={className}
    >
      {business.isError ? (
        <ErrorNote error={business.error} onRetry={() => void business.refetch()} />
      ) : business.isPending ? (
        <LoadingRows rows={2} />
      ) : items.length === 0 ? (
        <p className="text-muted">Nothing due in the next {AHEAD_DAYS} days.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.slice(0, SHOWN).map((item) => {
              const due = describeDue(item.date, today);
              const Icon = item.kind === "lead" ? Users : Briefcase;
              return (
                <li
                  key={item.key}
                  className="rounded-tile bg-base/80 px-4 py-2.5 ring-1 ring-surface-0/50"
                >
                  <span className="flex items-start gap-2 font-semibold text-fg">
                    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                    <span className="min-w-0 break-words">{item.title}</span>
                  </span>
                  <span
                    className={`mt-1 flex items-center gap-1 text-xs font-semibold ${dueTone[due.tone]}`}
                  >
                    <CalendarDays aria-hidden="true" className="size-3.5" />
                    {item.kind === "lead" ? "Follow-up, " : "Step, "}
                    {due.label.charAt(0).toLowerCase() + due.label.slice(1)}
                  </span>
                </li>
              );
            })}
          </ul>
          {items.length > SHOWN ? (
            <p className="mt-3 text-sm text-muted">
              {items.length - SHOWN} more on the Business page.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
