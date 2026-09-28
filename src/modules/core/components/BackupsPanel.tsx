import { Download, Upload } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { dangerButton, ghostButton, secondaryButton } from "../../../client/components/ui";
import { formatBytes } from "../../../client/lib/format";
import { useBackups, useRestoreBackup } from "../../../client/lib/queries";

const KIND_LABELS = {
  nightly: "Nightly backup",
  "pre-migrate": "Before an update",
  "pre-restore": "Before a restore",
} as const;
/** Backups listed before "Show all". */
const SHOWN = 5;
/** How long to wait for Hub to come back before saying so. */
const RESTART_TIMEOUT_MS = 2 * 60_000;

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Asks for /api/system until Hub reports a new start, then reloads the page. */
function useReloadWhenRestarted(active: boolean, before: string | null) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    let stopped = false;
    // Without the start time from before, wait until Hub has been away and is back.
    let wentAway = false;
    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/system", { cache: "no-store" });
        const info = res.ok ? ((await res.json()) as { startedAt?: string }) : null;
        if (!info?.startedAt) wentAway = true;
        else if (before === null ? wentAway : info.startedAt !== before) {
          window.location.reload();
          return;
        }
      } catch {
        // Hub is still restarting.
        wentAway = true;
      }
      if (Date.now() - started > RESTART_TIMEOUT_MS) setSlow(true);
      setTimeout(() => void check(), 2_000);
    };
    const first = setTimeout(() => void check(), 1_500);
    return () => {
      stopped = true;
      clearTimeout(first);
    };
  }, [active, before]);
  return slow;
}

type Confirming = { kind: "backup"; name: string; label: string } | { kind: "file"; file: File };

/** Hub's backups: download one, restore one, or restore from a file. */
export function BackupsPanel({ startedAt }: { startedAt: string | null }) {
  const ids = useId();
  const backups = useBackups();
  const restore = useRestoreBackup();
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [showAll, setShowAll] = useState(false);
  const restarting = restore.isSuccess;
  const slow = useReloadWhenRestarted(restarting, startedAt);

  if (restarting) {
    return (
      <div role="status" className="space-y-2">
        <p className="font-semibold text-fg">{restore.data.message}</p>
        <p className="text-sm text-muted">
          {slow
            ? "Hub hasn't come back yet. Reload the page in a minute. If it still doesn't open, check the container logs."
            : "This page reloads when Hub is back."}
        </p>
      </div>
    );
  }

  const onRestore = () => {
    if (!confirming) return;
    restore.mutate(confirming.kind === "file" ? { file: confirming.file } : confirming);
  };

  const confirmBox = (what: string) => (
    <div className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-danger/50">
      <p className="text-sm text-fg">
        Replace everything in Hub with {what}? Anything changed since that backup was made is lost.
        Hub saves your current data as a backup first, then restarts.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={restore.isPending}
          onClick={onRestore}
          className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
        >
          {restore.isPending ? "Restoring…" : "Restore backup"}
        </button>
        <button
          type="button"
          className={ghostButton}
          disabled={restore.isPending}
          onClick={() => {
            setConfirming(null);
            restore.reset();
          }}
        >
          Keep current data
        </button>
      </div>
    </div>
  );

  const list = backups.data ?? [];
  const shown = showAll ? list : list.slice(0, SHOWN);

  return (
    <div className="space-y-6">
      {backups.isPending ? (
        <LoadingRows rows={3} />
      ) : backups.isError ? (
        <ErrorNote error={backups.error} onRetry={() => void backups.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">
          No backups yet. The first nightly backup appears after tonight's.
        </p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {shown.map((backup) => {
              const label = KIND_LABELS[backup.kind ?? "nightly"];
              const when = formatWhen(backup.createdAt);
              const open = confirming?.kind === "backup" && confirming.name === backup.name;
              return (
                <li
                  key={backup.name}
                  className="space-y-2 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{label}</p>
                      <p className="text-sm text-muted">
                        {when} · {formatBytes(backup.sizeBytes)}
                      </p>
                    </div>
                    <div className="-ml-4 flex flex-wrap gap-1 sm:ml-0 sm:-mr-2">
                      <a
                        href={`/api/backups/${encodeURIComponent(backup.name)}`}
                        download={backup.name}
                        className={ghostButton}
                        aria-label={`Download ${label.toLowerCase()} from ${when}`}
                      >
                        <Download aria-hidden="true" className="size-4" />
                        Download
                      </a>
                      <button
                        type="button"
                        className={dangerButton}
                        disabled={restore.isPending}
                        aria-label={`Restore ${label.toLowerCase()} from ${when}`}
                        onClick={() => {
                          restore.reset();
                          setConfirming({ kind: "backup", name: backup.name, label: when });
                        }}
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                  {open ? confirmBox(`the backup from ${when}`) : null}
                </li>
              );
            })}
          </ul>
          {list.length > SHOWN ? (
            <button
              type="button"
              className={`${ghostButton} -ml-4`}
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show fewer" : `Show all ${list.length} backups`}
            </button>
          ) : null}
        </div>
      )}

      <div className="space-y-3 border-t border-surface-0/70 pt-4">
        <div>
          <p className="font-semibold text-fg">Restore from a file</p>
          <p className="text-sm text-muted">
            A .sqlite3 backup from Hub, like one you downloaded or an offsite copy.
          </p>
        </div>
        <label
          className={`${secondaryButton} cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-accent-text`}
        >
          <Upload aria-hidden="true" className="size-4" />
          Choose backup file
          <input
            id={`${ids}-file`}
            type="file"
            accept=".sqlite3,.sqlite,.db,application/vnd.sqlite3,application/x-sqlite3"
            className="sr-only"
            disabled={restore.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              restore.reset();
              setConfirming(file ? { kind: "file", file } : null);
            }}
          />
        </label>
        {confirming?.kind === "file" ? (
          <>
            <p className="text-sm break-words text-muted">
              {confirming.file.name} · {formatBytes(confirming.file.size)}
            </p>
            {confirmBox(`the backup in ${confirming.file.name}`)}
          </>
        ) : null}
      </div>

      {restore.isError ? (
        <p role="alert" className="text-sm text-danger">
          {restore.error.message}
        </p>
      ) : null}
    </div>
  );
}
