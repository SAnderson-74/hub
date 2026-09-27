import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { iconButton, inputClass, labelClass } from "../../../client/components/ui";
import {
  type Platform,
  useCreatePlatform,
  useDeletePlatform,
  usePlatforms,
  useUpdatePlatform,
} from "../queries";

/** Where things are bought and sold. Kept in the database, entered here. */
export function PlatformsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Platforms"
      description="Where you buy and sell. Archive a platform you've stopped using; items keep it."
    >
      {open ? <PlatformList /> : null}
    </Sheet>
  );
}

function PlatformList() {
  const platforms = usePlatforms();
  const create = useCreatePlatform();
  const update = useUpdatePlatform();
  const remove = useDeletePlatform();
  const [name, setName] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();
  const error = create.error ?? update.error ?? remove.error;

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // Clear now so the next one can be typed while this one saves.
    setName("");
    create.mutate(
      { name: trimmed },
      {
        onSuccess: () => setAnnouncement(`Platform added: ${trimmed}`),
        onError: () => setName((current) => current || trimmed),
      },
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onAdd}>
        <label htmlFor={`${ids}-new`} className={labelClass}>
          New platform
        </label>
        <div className="flex gap-2">
          <input
            id={`${ids}-new`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Local classifieds"
            className={inputClass}
          />
          <button
            type="submit"
            aria-label="Add platform"
            disabled={!name.trim() || create.isPending}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>
      </form>

      {platforms.isPending ? (
        <LoadingRows rows={2} />
      ) : platforms.isError ? (
        <ErrorNote error={platforms.error} onRetry={() => void platforms.refetch()} />
      ) : platforms.data.length === 0 ? (
        <p className="text-muted">No platforms yet. Add the places you buy and sell.</p>
      ) : (
        <ul className="space-y-2">
          {platforms.data.map((platform) => (
            <PlatformRow
              key={platform.id}
              platform={platform}
              busy={update.isPending || remove.isPending}
              onRename={(newName) =>
                update.mutateAsync({ id: platform.id, patch: { name: newName } }).then(() => {
                  setAnnouncement(`Platform renamed to ${newName}`);
                })
              }
              onArchive={(archived) =>
                update.mutate(
                  { id: platform.id, patch: { archived } },
                  {
                    onSuccess: () =>
                      setAnnouncement(`${platform.name} ${archived ? "archived" : "restored"}`),
                  },
                )
              }
              onDelete={() =>
                remove.mutate(platform.id, {
                  onSuccess: () => setAnnouncement(`${platform.name} deleted`),
                })
              }
            />
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function PlatformRow({
  platform,
  busy,
  onRename,
  onArchive,
  onDelete,
}: {
  platform: Platform;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(platform.name);
  const used = platform.itemCount > 0;

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === platform.name) {
      setEditing(false);
      return;
    }
    void onRename(trimmed)
      .then(() => setEditing(false))
      .catch(() => undefined);
  };

  if (editing) {
    return (
      <li className="rounded-tile bg-base/80 p-2 ring-1 ring-surface-0/50">
        <form onSubmit={onSave} className="flex items-center gap-1">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            aria-label={`New name for ${platform.name}`}
            className={`${inputClass} h-11`}
          />
          <button type="submit" aria-label="Save name" disabled={busy} className={iconButton}>
            <Check aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Cancel renaming"
            className={iconButton}
            onClick={() => {
              setName(platform.name);
              setEditing(false);
            }}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50">
      <div className="min-w-0 flex-1 py-2">
        <p className={`font-semibold break-words ${platform.archived ? "text-muted" : "text-fg"}`}>
          {platform.name}
        </p>
        <p className="text-sm text-muted">
          {platform.itemCount === 0
            ? "No items yet"
            : `${platform.itemCount} ${platform.itemCount === 1 ? "item" : "items"}`}
          {platform.archived ? " · Archived" : ""}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Rename ${platform.name}`}
        className={iconButton}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={platform.archived ? `Restore ${platform.name}` : `Archive ${platform.name}`}
        disabled={busy}
        className={iconButton}
        onClick={() => onArchive(!platform.archived)}
      >
        {platform.archived ? (
          <ArchiveRestore aria-hidden="true" className="size-4" />
        ) : (
          <Archive aria-hidden="true" className="size-4" />
        )}
      </button>
      {used ? null : (
        <button
          type="button"
          aria-label={`Delete ${platform.name}`}
          disabled={busy}
          className={`${iconButton} hover:text-danger`}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      )}
    </li>
  );
}
