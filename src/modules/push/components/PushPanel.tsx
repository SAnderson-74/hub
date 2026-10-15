import { BellOff, BellRing } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import {
  currentSubscription,
  deviceName,
  endpointHash,
  PushError,
  pushSupport,
  subscribeHere,
  unsubscribeHere,
} from "../device";
import {
  type PushDevice,
  preparePushKeys,
  useAddPushDevice,
  usePushStatus,
  useRemovePushDevice,
  useTestPush,
  useUpdatePushDevice,
} from "../queries";

function when(iso: string | null): string {
  if (!iso) return "Nothing sent yet";
  return `Last sent ${new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/**
 * Notifications on this device, and the other devices that have them. Off until turned
 * on here; each device chooses for itself.
 */
export function PushPanel() {
  const status = usePushStatus();
  const support = pushSupport();
  // Which listed device this browser is, once its subscription has been checked.
  const [hereHash, setHereHash] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    void currentSubscription()
      .then((subscription) => (subscription ? endpointHash(subscription.endpoint) : null))
      .then((hash) => {
        if (live) setHereHash(hash);
      })
      .catch(() => {
        if (live) setHereHash(null);
      });
    return () => {
      live = false;
    };
  }, []);

  if (status.isPending || hereHash === undefined) return <LoadingRows rows={2} />;
  if (status.isError)
    return <ErrorNote error={status.error} onRetry={() => void status.refetch()} />;

  const here = status.data.devices.find((device) => device.endpointHash === hereHash) ?? null;
  const others = status.data.devices.filter((device) => device !== here);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Reminders come as notifications on each device that turns them on. They're encrypted so only
        that device can read them, and go out through the push service its browser uses (Apple's on
        an iPhone). Nothing connects to Hub from outside.
      </p>
      {here ? (
        <ThisDevice device={here} onOff={() => setHereHash(null)} onMessage={setMessage} />
      ) : (
        <TurnOn
          support={support}
          onOn={(hash) => {
            setHereHash(hash);
            setMessage("Notifications on for this device");
          }}
        />
      )}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {message}
      </p>
      {others.length > 0 ? (
        <section aria-label="Other devices" className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">Other devices</h3>
          <ul className="space-y-2">
            {others.map((device) => (
              <OtherDevice key={device.id} device={device} onMessage={setMessage} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TurnOn({
  support,
  onOn,
}: {
  support: ReturnType<typeof pushSupport>;
  onOn: (hash: string) => void;
}) {
  const ids = useId();
  const add = useAddPushDevice();
  const [name, setName] = useState(deviceName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!support.ok) {
    return (
      <p className="rounded-tile bg-base/80 p-4 text-sm text-fg ring-1 ring-surface-0/50">
        {support.reason === "home-screen"
          ? "On an iPhone or iPad, notifications work from the Home Screen app. In Safari, tap Share, then Add to Home Screen, and open Hub from there."
          : support.reason === "blocked"
            ? "Notifications are blocked for Hub in this browser. Allow them in its site settings, then come back here."
            : "This browser can't show notifications from Hub. Try Safari, Chrome, Edge, or Firefox."}
      </p>
    );
  }

  const turnOn = async () => {
    setBusy(true);
    setError("");
    try {
      const publicKey = await preparePushKeys();
      const subscription = await subscribeHere(publicKey);
      await add.mutateAsync({ ...subscription, name: name.trim() });
      onOn(await endpointHash(subscription.endpoint));
    } catch (caught) {
      setError(
        caught instanceof PushError || caught instanceof Error
          ? caught.message
          : "Couldn't turn notifications on. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <p className="flex items-center gap-2 font-semibold text-fg">
        <BellOff aria-hidden="true" className="size-5 text-muted" />
        Off on this device
      </p>
      <div>
        <label htmlFor={`${ids}-name`} className={labelClass}>
          Device name
        </label>
        <input
          id={`${ids}-name`}
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          className={`${inputClass} max-w-64`}
        />
      </div>
      <button type="button" className={primaryButton} disabled={busy} onClick={() => void turnOn()}>
        Turn on notifications
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ThisDevice({
  device,
  onOff,
  onMessage,
}: {
  device: PushDevice;
  onOff: () => void;
  onMessage: (message: string) => void;
}) {
  const ids = useId();
  const update = useUpdatePushDevice();
  const remove = useRemovePushDevice();
  const test = useTestPush();
  const [error, setError] = useState("");

  const turnOff = async () => {
    setError("");
    try {
      await unsubscribeHere();
      await remove.mutateAsync(device.id);
      onOff();
      onMessage("Notifications off for this device");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't turn notifications off.");
    }
  };

  return (
    <div className="space-y-4 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <div>
        <p className="flex items-center gap-2 font-semibold text-fg">
          <BellRing aria-hidden="true" className="size-5 text-accent-text" />
          On for this device{device.name ? `: ${device.name}` : ""}
        </p>
        <p className="mt-1 text-sm text-muted">
          {when(device.lastSentAt)}
          {device.lastError ? ". The last one didn't go through." : ""}
        </p>
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={device.details}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate(
              { id: device.id, patch: { details: event.target.checked } },
              {
                onSuccess: (saved) =>
                  onMessage(saved.details ? "Showing what's due" : "Showing counts only"),
              },
            )
          }
          aria-describedby={`${ids}-details-hint`}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <span>
          <span className="block font-semibold text-fg">Show what's due by name</span>
          <span id={`${ids}-details-hint`} className="block text-sm text-muted">
            Off, notifications show only counts, like "2 things coming due", so nothing private is
            on the lock screen.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={test.isPending}
          onClick={() =>
            test.mutate(device.id, { onSuccess: () => onMessage("Test notification sent") })
          }
        >
          Send a test notification
        </button>
        <button
          type="button"
          className={ghostButton}
          disabled={remove.isPending}
          onClick={() => void turnOff()}
        >
          Turn off on this device
        </button>
      </div>
      {test.error || update.error || error ? (
        <p role="alert" className="text-sm text-danger">
          {test.error?.message ?? update.error?.message ?? error}
        </p>
      ) : null}
    </div>
  );
}

function OtherDevice({
  device,
  onMessage,
}: {
  device: PushDevice;
  onMessage: (message: string) => void;
}) {
  const remove = useRemovePushDevice();
  const name = device.name || "A device";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
      <span className="min-w-0">
        <span className="block font-semibold break-words text-fg">{name}</span>
        <span className="block text-sm text-muted">
          {[device.details ? "Shows what's due" : "Counts only", when(device.lastSentAt)].join(
            " · ",
          )}
        </span>
      </span>
      <button
        type="button"
        className={ghostButton}
        disabled={remove.isPending}
        aria-label={`Turn off notifications for ${name}`}
        onClick={() =>
          remove.mutate(device.id, { onSuccess: () => onMessage(`Notifications off for ${name}`) })
        }
      >
        Turn off
      </button>
    </li>
  );
}
