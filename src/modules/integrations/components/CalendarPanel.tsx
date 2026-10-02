import { CalendarPlus, Copy } from "lucide-react";
import { useId, useState } from "react";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  inputClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { useCalendarFeed, useSetCalendarFeed } from "../queries";

type Confirming = "renew" | "off" | null;

/** A private calendar address for a phone or computer to subscribe to. */
export function CalendarPanel() {
  const ids = useId();
  const feed = useCalendarFeed();
  const change = useSetCalendarFeed();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [message, setMessage] = useState("");

  if (feed.isPending) return <LoadingRows rows={2} />;
  if (feed.isError) return <ErrorNote error={feed.error} onRetry={() => void feed.refetch()} />;

  const path = feed.data.path;
  const url = path ? `${window.location.origin}${path}` : "";
  const subscribe = path ? `webcal://${window.location.host}${path}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied");
    } catch {
      setMessage("");
      document.getElementById(`${ids}-url`)?.focus();
    }
  };

  const run = (on: boolean, done: string) =>
    change.mutate(on, {
      onSuccess: () => {
        setConfirming(null);
        setMessage(done);
      },
    });

  if (!path) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Tasks, goals, milestones, business steps, and lead follow-ups with dates, as all-day
          events. The calendar checks for changes about once an hour.
        </p>
        <button
          type="button"
          className={primaryButton}
          disabled={change.isPending}
          onClick={() => run(true, "Calendar feed on")}
        >
          <CalendarPlus aria-hidden="true" className="size-4" />
          Turn on calendar feed
        </button>
        <p role="status" className="text-sm font-semibold text-ok empty:hidden">
          {message}
        </p>
        {change.isError ? (
          <p role="alert" className="text-sm text-danger">
            {change.error.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${ids}-url`} className="mb-1.5 block text-sm font-semibold text-muted">
          Calendar address
        </label>
        <input
          id={`${ids}-url`}
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          aria-describedby={`${ids}-private`}
          className={`${inputClass} font-mono text-sm`}
        />
        <p id={`${ids}-private`} className="mt-1.5 text-sm text-muted">
          Keep it private. It only works over Tailscale, and a new address stops this one.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={subscribe} className={primaryButton}>
          <CalendarPlus aria-hidden="true" className="size-4" />
          Subscribe on this device
        </a>
        <button type="button" className={secondaryButton} onClick={() => void copy()}>
          <Copy aria-hidden="true" className="size-4" />
          Copy link
        </button>
      </div>

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
          How to add it
        </summary>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>
            <span className="font-semibold text-fg">iPhone:</span> Settings &gt; Apps &gt; Calendar
            &gt; Calendar Accounts &gt; Add Account &gt; Other &gt; Add Subscribed Calendar, then
            paste the address. Adding it in Settings keeps it on your iPhone, which can reach Hub
            over Tailscale. If asked where to keep it, choose On My iPhone, not iCloud: iCloud's
            servers can't reach Hub.
          </li>
          <li>
            <span className="font-semibold text-fg">Mac:</span> Calendar &gt; File &gt; New Calendar
            Subscription, paste the address, and set Location to On My Mac.
          </li>
          <li>
            Google Calendar can't use it, because Google's servers can't reach Hub over Tailscale.
          </li>
        </ul>
      </details>

      {confirming ? (
        <div className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
          <p className="text-sm text-fg">
            {confirming === "renew"
              ? "Make a new address? Calendars using this one stop updating until you add the new one."
              : "Turn off the calendar feed? Calendars using it stop updating."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={change.isPending}
              onClick={() =>
                confirming === "renew"
                  ? run(true, "New calendar address made")
                  : run(false, "Calendar feed off")
              }
            >
              {confirming === "renew" ? "Make a new address" : "Turn off calendar feed"}
            </button>
            <button type="button" className={ghostButton} onClick={() => setConfirming(null)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-surface-0/70 pt-4">
          <button type="button" className={ghostButton} onClick={() => setConfirming("renew")}>
            Get a new address
          </button>
          <button type="button" className={ghostButton} onClick={() => setConfirming("off")}>
            Turn off
          </button>
        </div>
      )}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {message}
      </p>
      {change.isError ? (
        <p role="alert" className="text-sm text-danger">
          {change.error.message}
        </p>
      ) : null}
    </div>
  );
}
