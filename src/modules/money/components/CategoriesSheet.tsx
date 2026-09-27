import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { iconButton, inputClass, labelClass } from "../../../client/components/ui";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS, type CategoryKind } from "../../../shared/books";
import {
  type Book,
  type Category,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "../queries";

/** A book's categories. Archive one you've stopped using; its transactions keep it. */
export function CategoriesSheet({
  book,
  open,
  onClose,
}: {
  book: Book;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Categories"
      description={`What money in ${book.name} is for. Archive a category you've stopped using; its transactions keep it.`}
    >
      {open ? <CategoryList bookId={book.id} /> : null}
    </Sheet>
  );
}

function CategoryList({ bookId }: { bookId: number }) {
  const categories = useCategories(bookId);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");
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
      { bookId, name: trimmed, kind },
      {
        onSuccess: () => setAnnouncement(`Category added: ${trimmed}`),
        onError: () => setName((current) => current || trimmed),
      },
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onAdd} className="space-y-3">
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            New category
          </label>
          <div className="flex gap-2">
            <input
              id={`${ids}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              placeholder="Pet care"
              className={inputClass}
            />
            <button
              type="submit"
              aria-label="Add category"
              disabled={!name.trim() || create.isPending}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
        <fieldset className="flex min-w-0 gap-2">
          <legend className="sr-only">Kind</legend>
          {CATEGORY_KINDS.map((value) => (
            <label key={value} className="relative">
              <input
                type="radio"
                name={`${ids}-kind`}
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
              />
              <span className="pointer-events-none flex h-11 items-center rounded-full bg-base px-4 text-sm font-semibold text-muted ring-1 ring-surface-0/60 peer-checked:bg-surface-0 peer-checked:text-fg peer-checked:ring-surface-1 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                {CATEGORY_KIND_LABELS[value]}
              </span>
            </label>
          ))}
        </fieldset>
      </form>

      {categories.isPending ? (
        <LoadingRows rows={3} />
      ) : categories.isError ? (
        <ErrorNote error={categories.error} onRetry={() => void categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <p className="text-muted">
          No categories yet. Add the kinds of spending and income you track.
        </p>
      ) : (
        CATEGORY_KINDS.map((group) => {
          const rows = categories.data.filter((category) => category.kind === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`${ids}-${group}`}>
              <h3 id={`${ids}-${group}`} className="mb-2 text-sm font-semibold text-muted">
                {CATEGORY_KIND_LABELS[group]}
              </h3>
              <ul className="space-y-2">
                {rows.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    busy={update.isPending || remove.isPending}
                    onRename={(newName) =>
                      update
                        .mutateAsync({ id: category.id, patch: { name: newName } })
                        .then(() => setAnnouncement(`Category renamed to ${newName}`))
                    }
                    onArchive={(archived) =>
                      update.mutate(
                        { id: category.id, patch: { archived } },
                        {
                          onSuccess: () =>
                            setAnnouncement(
                              `${category.name} ${archived ? "archived" : "restored"}`,
                            ),
                        },
                      )
                    }
                    onDelete={() =>
                      remove.mutate(category.id, {
                        onSuccess: () => setAnnouncement(`${category.name} deleted`),
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          );
        })
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

function CategoryRow({
  category,
  busy,
  onRename,
  onArchive,
  onDelete,
}: {
  category: Category;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
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
            maxLength={60}
            aria-label={`New name for ${category.name}`}
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
              setName(category.name);
              setEditing(false);
            }}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </form>
      </li>
    );
  }

  const used = category.transactionCount;
  return (
    <li className="flex items-center gap-1 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50">
      <div className="min-w-0 flex-1 py-2">
        <p className={`font-semibold break-words ${category.archived ? "text-muted" : "text-fg"}`}>
          {category.name}
        </p>
        <p className="text-sm text-muted">
          {used === 0 ? "Not used yet" : `${used} ${used === 1 ? "transaction" : "transactions"}`}
          {category.archived ? " · Archived" : ""}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Rename ${category.name}`}
        className={iconButton}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={category.archived ? `Restore ${category.name}` : `Archive ${category.name}`}
        disabled={busy}
        className={iconButton}
        onClick={() => onArchive(!category.archived)}
      >
        {category.archived ? (
          <ArchiveRestore aria-hidden="true" className="size-4" />
        ) : (
          <Archive aria-hidden="true" className="size-4" />
        )}
      </button>
      {used > 0 ? null : (
        <button
          type="button"
          aria-label={`Delete ${category.name}`}
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
