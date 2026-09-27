import { Archive, ArchiveRestore, Check, Pencil, Trash2, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { iconButton, inputClass, labelClass, primaryButton } from "../../../client/components/ui";
import { BOOK_KIND_LABELS, BOOK_KINDS, type BookKind } from "../../../shared/books";
import { type Book, useBooks, useCreateBook, useDeleteBook, useUpdateBook } from "../queries";

/** Personal and business books, each with its own accounts and categories. */
export function BooksSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with a new book, so the page can switch to it. */
  onCreated: (book: Book) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Books"
      description="Each book keeps its own accounts and categories, like personal money and a business. Archive a book you've stopped using; its history stays."
    >
      {open ? <BookList onCreated={onCreated} /> : null}
    </Sheet>
  );
}

function BookList({ onCreated }: { onCreated: (book: Book) => void }) {
  const books = useBooks();
  const create = useCreateBook();
  const update = useUpdateBook();
  const remove = useDeleteBook();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BookKind>("personal");
  const [starter, setStarter] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();
  const error = create.error ?? update.error ?? remove.error;

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, kind, starterCategories: starter },
      {
        onSuccess: (book) => {
          setName("");
          setAnnouncement(`Book added: ${book.name}`);
          onCreated(book);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={onAdd}
        className="space-y-4 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${ids}-name`} className={labelClass}>
              New book
            </label>
            <input
              id={`${ids}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              placeholder={kind === "business" ? "Business" : "Personal"}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-kind`} className={labelClass}>
              Kind
            </label>
            <select
              id={`${ids}-kind`}
              value={kind}
              onChange={(event) => setKind(event.target.value as BookKind)}
              className={inputClass}
            >
              {BOOK_KINDS.map((value) => (
                <option key={value} value={value}>
                  {BOOK_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-fg">
          <input
            type="checkbox"
            checked={starter}
            onChange={(event) => setStarter(event.target.checked)}
            className="size-5 accent-accent"
          />
          Start with common categories
        </label>
        <button type="submit" disabled={!name.trim() || create.isPending} className={primaryButton}>
          Add book
        </button>
      </form>

      {books.isPending ? (
        <LoadingRows rows={2} />
      ) : books.isError ? (
        <ErrorNote error={books.error} onRetry={() => void books.refetch()} />
      ) : books.data.length === 0 ? (
        <p className="text-muted">No books yet. Most people start with one called Personal.</p>
      ) : (
        <ul className="space-y-2">
          {books.data.map((book) => (
            <BookRow
              key={book.id}
              book={book}
              busy={update.isPending || remove.isPending}
              onRename={(newName) =>
                update.mutateAsync({ id: book.id, patch: { name: newName } }).then(() => {
                  setAnnouncement(`Book renamed to ${newName}`);
                })
              }
              onArchive={(archived) =>
                update.mutate(
                  { id: book.id, patch: { archived } },
                  {
                    onSuccess: () =>
                      setAnnouncement(`${book.name} ${archived ? "archived" : "restored"}`),
                  },
                )
              }
              onDelete={() =>
                remove.mutate(book.id, {
                  onSuccess: () => setAnnouncement(`${book.name} deleted`),
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

function BookRow({
  book,
  busy,
  onRename,
  onArchive,
  onDelete,
}: {
  book: Book;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(book.name);

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === book.name) {
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
            aria-label={`New name for ${book.name}`}
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
              setName(book.name);
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
        <p className={`font-semibold break-words ${book.archived ? "text-muted" : "text-fg"}`}>
          {book.name}
        </p>
        <p className="text-sm text-muted">
          {BOOK_KIND_LABELS[book.kind]} ·{" "}
          {book.accountCount === 0
            ? "No accounts yet"
            : `${book.accountCount} ${book.accountCount === 1 ? "account" : "accounts"}`}
          {book.archived ? " · Archived" : ""}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Rename ${book.name}`}
        className={iconButton}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={book.archived ? `Restore ${book.name}` : `Archive ${book.name}`}
        disabled={busy}
        className={iconButton}
        onClick={() => onArchive(!book.archived)}
      >
        {book.archived ? (
          <ArchiveRestore aria-hidden="true" className="size-4" />
        ) : (
          <Archive aria-hidden="true" className="size-4" />
        )}
      </button>
      {book.accountCount > 0 ? null : (
        <button
          type="button"
          aria-label={`Delete ${book.name}`}
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
