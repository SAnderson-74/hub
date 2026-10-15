import { Link } from "react-router";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { ghostButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { useItems } from "../queries";
import { STALE_DAYS, staleListings, stockSummary } from "../stock";

const STALE_SHOWN = 3;

/** What's in stock, and listings that have kept their price a while. */
export function ResaleWidget({ today, className }: { today: string; className?: string }) {
  const items = useItems();
  const stale = staleListings(items.data ?? [], today);

  return (
    <Panel
      title="Resale stock"
      action={
        <Link to="/resale" className={ghostButton}>
          Open resale
        </Link>
      }
      className={className}
    >
      {items.isError ? (
        <ErrorNote error={items.error} onRetry={() => void items.refetch()} />
      ) : items.isPending ? (
        <LoadingRows rows={2} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">{stockSummary(items.data)}</p>
          {stale.length === 0 ? (
            items.data.some((item) => item.status === "listed") ? (
              <p className="text-sm text-muted">
                No listing has kept its price for {STALE_DAYS} days.
              </p>
            ) : null
          ) : (
            <div>
              <p className="text-sm font-semibold text-warn">
                {stale.length === 1
                  ? `1 listing hasn't changed price in ${STALE_DAYS} days or more:`
                  : `${stale.length} listings haven't changed price in ${STALE_DAYS} days or more:`}
              </p>
              <ul className="mt-2 space-y-2">
                {stale.slice(0, STALE_SHOWN).map((listing) => (
                  <li key={`${listing.itemId}-${listing.daysUp}`}>
                    <Link
                      to={`/resale?item=${listing.itemId}`}
                      className="block min-h-11 rounded-tile bg-base/80 px-4 py-2.5 ring-1 ring-surface-0/50 hover:ring-surface-1"
                    >
                      <span className="block truncate font-semibold text-fg">{listing.title}</span>
                      <span className="block text-xs font-semibold text-muted tabular-nums">
                        {formatCents(listing.priceCents)}, same price for {listing.daysSamePrice}{" "}
                        days, up {listing.daysUp}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {stale.length > STALE_SHOWN ? (
                <p className="mt-2 text-sm text-muted">
                  {stale.length - STALE_SHOWN} more on the Resale page.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
