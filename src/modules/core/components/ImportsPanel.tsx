import { ChevronRight, ClipboardPaste, FileUp, GraduationCap, Landmark } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useNavigate } from "react-router";
import { inputClass } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { ImportSheet as CoursesImportSheet } from "../../education/components/ImportSheet";
import { ImportSheet as BankImportSheet } from "../../money/components/ImportSheet";
import { useAccounts, useBooks } from "../../money/queries";
import { storedBookId } from "../../money/storedBook";
import { ImportCsvSheet } from "../../resale/components/ImportCsvSheet";
import { PasteListingSheet } from "../../resale/components/PasteListingSheet";
import { localDate } from "../../tasks/dates";

type Open = "bank" | "resale" | "listing" | "courses" | null;

/** One import: what it takes and where it goes. Opens the same sheet as on its page. */
function ImportRow({
  icon,
  title,
  detail,
  onOpen,
  disabled,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onOpen: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-tile bg-base/80 ring-1 ring-surface-0/50">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex min-h-16 w-full items-center gap-3 rounded-tile px-4 py-3 text-left hover:bg-surface-0/60 focus-visible:ring-2 focus-visible:ring-accent-text focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-0 text-accent-text"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fg">{title}</span>
          <span className="block text-sm text-muted">{detail}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />
      </button>
      {children ? <div className="px-4 pb-4">{children}</div> : null}
    </li>
  );
}

/** Every file and paste import in Hub, in one place. */
export function ImportsPanel() {
  const ids = useId();
  const navigate = useNavigate();
  const today = localDate(useNow());
  const [open, setOpen] = useState<Open>(null);
  const books = useBooks();
  const active = (books.data ?? []).filter((book) => !book.archived);
  const [chosenId, setChosenId] = useState<number | null>(storedBookId);
  const book = active.find((item) => item.id === chosenId) ?? active[0] ?? null;
  const accounts = useAccounts(book?.id ?? null);
  const allAccounts = accounts.data ?? [];
  const openAccounts = allAccounts.filter((account) => !account.archived);
  const close = () => setOpen(null);

  const bankDetail = books.isPending
    ? "CSV, OFX, or QFX from your bank or card."
    : book === null
      ? "Set up a book and an account in Money first."
      : accounts.isSuccess && openAccounts.length === 0
        ? `Add an account to ${book.name} in Money first.`
        : `CSV, OFX, or QFX from your bank or card, into ${book.name}.`;

  return (
    <>
      <ul className="space-y-2">
        <ImportRow
          icon={<Landmark className="size-5" />}
          title="Bank or card transactions"
          detail={bankDetail}
          disabled={book === null || openAccounts.length === 0}
          onOpen={() => setOpen("bank")}
        >
          {active.length > 1 ? (
            <div>
              <label
                htmlFor={`${ids}-book`}
                className="mb-1.5 block text-sm font-semibold text-muted"
              >
                Book
              </label>
              <select
                id={`${ids}-book`}
                value={book?.id ?? ""}
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
        </ImportRow>
        <ImportRow
          icon={<FileUp className="size-5" />}
          title="Resale items"
          detail="A CSV spreadsheet of items, into Resale."
          onOpen={() => setOpen("resale")}
        />
        <ImportRow
          icon={<ClipboardPaste className="size-5" />}
          title="Resale listing"
          detail="Paste a hub-listing/v1 listing, into Resale."
          onOpen={() => setOpen("listing")}
        />
        <ImportRow
          icon={<GraduationCap className="size-5" />}
          title="Study plan"
          detail="A hub-education/v1 file of terms and courses, into Courses."
          onOpen={() => setOpen("courses")}
        />
      </ul>

      {book ? (
        <BankImportSheet
          book={book}
          accounts={allAccounts}
          defaultAccountId={openAccounts[0]?.id ?? null}
          today={today}
          open={open === "bank"}
          onClose={close}
        />
      ) : null}
      <ImportCsvSheet open={open === "resale"} onClose={close} />
      <PasteListingSheet
        open={open === "listing"}
        onClose={close}
        onOpenItem={(id) => navigate(`/resale?item=${id}`)}
      />
      <CoursesImportSheet open={open === "courses"} onClose={close} />
    </>
  );
}
