import { type ReactNode, useId, useState } from "react";
import { useNavigate } from "react-router";
import { Sheet } from "../../../client/components/Sheet";
import { LoadingRows } from "../../../client/components/States";
import { ghostButton, inputClass, labelClass, textareaClass } from "../../../client/components/ui";
import { useModules } from "../../../client/lib/queries";
import { useNow } from "../../../client/lib/useNow";
import { type PasteRead, PROJECT_KINDS, readPaste } from "../../../shared/claudeProject";
import { StudyPlanForm } from "../../education/components/ImportSheet";
import { ImportForm } from "../../money/components/ImportSheet";
import { ReceiptsForm } from "../../money/components/ReceiptsSheet";
import {
  type Account,
  type Book,
  type Category,
  useAccounts,
  useBooks,
  useCategories,
} from "../../money/queries";
import { storedBookId } from "../../money/storedBook";
import { PasteItemsForm } from "../../resale/components/PasteItemsSheet";
import { PasteListingForm } from "../../resale/components/PasteListingSheet";
import { localDate } from "../../tasks/dates";

type Read = Extract<PasteRead, { ok: true }>;

/**
 * One paste box for everything the Claude Project writes. It reads which format an
 * answer is in and hands it to that import's own form, which checks it and previews
 * what it will do. Nothing is sent until that form's preview.
 */
export function PasteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste from Claude"
      description={`An answer from your Claude Project: ${PROJECT_KINDS}. Hub shows what it will do before anything changes.`}
    >
      {open ? <PasteFlow onDone={onClose} /> : null}
    </Sheet>
  );
}

function PasteFlow({ onDone }: { onDone: () => void }) {
  const ids = useId();
  const navigate = useNavigate();
  const modules = useModules();
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Read | null>(null);
  const read = readPaste(text);

  if (chosen) {
    const { format } = chosen;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50">
          <p className="min-w-0 text-fg">
            <span className="font-semibold">{format.label}</span>, into {format.into}
          </p>
          <button
            type="button"
            className={ghostButton}
            onClick={() => {
              setChosen(null);
              setText("");
            }}
          >
            Start over
          </button>
        </div>
        {!modules[format.module] ? (
          <p role="alert" className="text-sm text-danger">
            {format.into} is turned off. Turn it on under Modules and time zone, then paste again.
          </p>
        ) : format.format === "hub-receipt/v1" ? (
          <BookTarget>
            {(book, accounts, categories, today) => (
              <ReceiptsForm
                key={book.id}
                book={book}
                accounts={accounts}
                categories={categories}
                today={today}
                initialText={chosen.json}
                onDone={onDone}
              />
            )}
          </BookTarget>
        ) : format.format === "hub-statement/v1" ? (
          <BookTarget>
            {(book, accounts) => {
              const open = accounts.filter((account) => !account.archived);
              return (
                <ImportForm
                  key={book.id}
                  book={book}
                  accounts={open}
                  defaultAccountId={open[0]?.id ?? null}
                  initialText={chosen.json}
                  onDone={onDone}
                />
              );
            }}
          </BookTarget>
        ) : format.format === "hub-inventory/v1" ? (
          <PasteItemsForm initialText={chosen.json} onDone={onDone} />
        ) : format.format === "hub-listing/v1" ? (
          <PasteListingForm
            initialText={chosen.json}
            onDone={onDone}
            onOpenItem={(id) => navigate(`/resale?item=${id}`)}
          />
        ) : (
          <StudyPlanForm initialText={chosen.json} onDone={onDone} />
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`${ids}-paste`} className={labelClass}>
        Claude Project answer
      </label>
      <textarea
        id={`${ids}-paste`}
        value={text}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          // A whole answer goes straight to its import.
          const next = readPaste(value);
          if (next?.ok) setChosen(next);
        }}
        rows={8}
        spellCheck={false}
        placeholder='{ "format": "hub-receipt/v1", … }'
        aria-describedby={`${ids}-paste-hint`}
        className={`${textareaClass} font-mono text-sm`}
      />
      <p
        id={`${ids}-paste-hint`}
        className={`mt-1.5 text-sm ${read && !read.ok ? "text-danger" : "text-muted"}`}
      >
        {read && !read.ok
          ? read.error
          : "Copy the Project's whole answer and paste it here. Hub finds where it goes."}
      </p>
    </div>
  );
}

/** Money imports go into a book: the one Money last showed, unless another is picked. */
function BookTarget({
  children,
}: {
  children: (book: Book, accounts: Account[], categories: Category[], today: string) => ReactNode;
}) {
  const ids = useId();
  const today = localDate(useNow());
  const books = useBooks();
  const active = (books.data ?? []).filter((book) => !book.archived);
  const [chosenId, setChosenId] = useState<number | null>(storedBookId);
  const book = active.find((item) => item.id === chosenId) ?? active[0] ?? null;
  const accounts = useAccounts(book?.id ?? null);
  const categories = useCategories(book?.id ?? null);

  if (books.isPending || (book && (accounts.isPending || categories.isPending))) {
    return <LoadingRows rows={2} />;
  }
  const open = (accounts.data ?? []).filter((account) => !account.archived);
  if (!book || open.length === 0) {
    return (
      <p role="alert" className="text-sm text-danger">
        {book
          ? `Add an account to ${book.name} in Money first, then paste again.`
          : "Set up a book and an account in Money first, then paste again."}
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {active.length > 1 ? (
        <div>
          <label htmlFor={`${ids}-book`} className={labelClass}>
            Book
          </label>
          <select
            id={`${ids}-book`}
            value={book.id}
            onChange={(event) => setChosenId(Number(event.target.value))}
            className={`${inputClass} sm:w-64`}
          >
            {active.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {children(book, accounts.data ?? [], categories.data ?? [], today)}
    </div>
  );
}
