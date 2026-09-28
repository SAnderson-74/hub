import { Repeat, Sparkles, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "../../../shared/books";
import { type Confidence, repeatsText } from "../../../shared/categorize";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { formatShortDate } from "../../tasks/dates";
import {
  type Book,
  type Category,
  type TransactionGroup,
  useApplyCategory,
  useCategorize,
  useFillPeople,
} from "../queries";

const CONFIDENCE: Record<Confidence, string> = {
  high: "Strong match",
  medium: "Good match",
  low: "A guess",
};

/** Groups shown before "Show more". */
const PAGE = 20;

const count = (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"}`;

/**
 * Uncategorized transactions grouped with similar ones, each with a suggested
 * category and why. A group can be categorized at once, renamed, and turned into a
 * rule for later imports.
 */
export function SortSheet({
  book,
  categories,
  today,
  open,
  onClose,
}: {
  book: Book;
  categories: Category[];
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sort transactions"
      description="Uncategorized transactions, grouped with similar ones. Suggestions come from your rules, how you sorted similar transactions before, and your category names."
    >
      {open ? <Groups book={book} categories={categories} today={today} /> : null}
    </Sheet>
  );
}

function Groups({
  book,
  categories,
  today,
}: {
  book: Book;
  categories: Category[];
  today: string;
}) {
  const overview = useCategorize(book.id);
  const apply = useApplyCategory();
  const fill = useFillPeople();
  const [shown, setShown] = useState(PAGE);
  const [announcement, setAnnouncement] = useState("");

  if (overview.isPending) return <LoadingRows rows={4} />;
  if (overview.isError) {
    return <ErrorNote error={overview.error} onRetry={() => void overview.refetch()} />;
  }
  const { groups, uncategorized, peopleToFill } = overview.data;
  const sure = groups.filter((group) => group.suggestion?.confidence === "high");

  const acceptSure = async () => {
    let total = 0;
    try {
      for (const group of sure) {
        if (!group.suggestion) continue;
        const result = await apply.mutateAsync({
          bookId: book.id,
          transactionIds: group.transactionIds,
          categoryId: group.suggestion.categoryId,
        });
        total += result.categorized;
      }
    } catch {
      // The error shows below; the groups already sorted stay sorted.
    }
    if (total > 0) setAnnouncement(`${count(total)} sorted`);
  };

  return (
    <div className="space-y-5">
      {peopleToFill > 0 ? (
        <div className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
          <p className="flex items-start gap-2 text-fg">
            <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
            {peopleToFill === 1
              ? "1 Venmo, Zelle, or Cash App payment doesn't have its person saved yet."
              : `${peopleToFill} Venmo, Zelle, or Cash App payments don't have their person saved yet.`}{" "}
            Hub can save the names and add them to the memos, like “Venmo to John Smith”.
          </p>
          <button
            type="button"
            className={secondaryButton}
            disabled={fill.isPending}
            onClick={() =>
              fill.mutate(book.id, {
                onSuccess: ({ filled }) =>
                  setAnnouncement(`${filled === 1 ? "1 name" : `${filled} names`} saved`),
              })
            }
          >
            {fill.isPending ? "Saving…" : "Save names"}
          </button>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-muted">Everything has a category. New imports show up here.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {count(uncategorized)} in {groups.length} {groups.length === 1 ? "group" : "groups"}.
            </p>
            {sure.length > 0 ? (
              <button
                type="button"
                className={secondaryButton}
                disabled={apply.isPending}
                onClick={() => void acceptSure()}
              >
                <Sparkles aria-hidden="true" className="size-4" />
                Use {sure.length === 1 ? "the strong match" : `${sure.length} strong matches`}
              </button>
            ) : null}
          </div>
          <ul className="space-y-3">
            {groups.slice(0, shown).map((group) => (
              <GroupCard
                key={group.key}
                book={book}
                group={group}
                categories={categories}
                today={today}
                onDone={setAnnouncement}
              />
            ))}
          </ul>
          {groups.length > shown ? (
            <button type="button" className={ghostButton} onClick={() => setShown(shown + PAGE)}>
              Show more groups
            </button>
          ) : null}
        </>
      )}
      {(apply.error ?? fill.error) ? (
        <p role="alert" className="text-sm text-danger">
          {(apply.error ?? fill.error)?.message}
        </p>
      ) : null}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
    </div>
  );
}

function GroupCard({
  book,
  group,
  categories,
  today,
  onDone,
}: {
  book: Book;
  group: TransactionGroup;
  categories: Category[];
  today: string;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const apply = useApplyCategory();
  const suggestion = group.suggestion;
  const [categoryId, setCategoryId] = useState(suggestion ? String(suggestion.categoryId) : "");
  // A merchant's cleaned-up name, like "Corner Grocery", unless the bank already wrote it
  // that way. Clearing it keeps each payee as it is.
  const [renameTo, setRenameTo] = useState(() =>
    group.key.startsWith("merchant:") && group.examples.some((row) => row.payee !== group.name)
      ? group.name
      : "",
  );
  const [makeRule, setMakeRule] = useState(true);
  const [ruleText, setRuleText] = useState(group.ruleText);
  const options = categories.filter((category) => !category.archived);
  const chosen = options.find((category) => String(category.id) === categoryId);
  const suggested = suggestion
    ? categories.find((category) => category.id === suggestion.categoryId)
    : null;
  const n = group.transactionIds.length;
  const amount =
    group.outCents > 0 && group.inCents > 0
      ? `${formatCents(group.inCents)} in, ${formatCents(group.outCents)} out`
      : group.inCents > 0
        ? `${formatCents(group.inCents)} in`
        : `${formatCents(group.outCents)} out`;
  const dates =
    group.firstDate === group.lastDate
      ? formatShortDate(group.lastDate, today)
      : `${formatShortDate(group.firstDate, today)} to ${formatShortDate(group.lastDate, today)}`;

  const onApply = () => {
    if (!chosen) return;
    apply.mutate(
      {
        bookId: book.id,
        transactionIds: group.transactionIds,
        categoryId: chosen.id,
        renameTo: renameTo.trim(),
        ...(makeRule && ruleText.trim()
          ? { rule: { contains: ruleText.trim(), direction: group.direction } }
          : {}),
      },
      { onSuccess: ({ categorized }) => onDone(`${count(categorized)} put in ${chosen.name}`) },
    );
  };

  return (
    <li
      aria-labelledby={`${ids}-name`}
      className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p id={`${ids}-name`} className="min-w-0 font-semibold break-words text-fg">
          {group.name}
        </p>
        <p className="shrink-0 text-sm font-semibold text-fg tabular-nums">{amount}</p>
      </div>
      <p className="text-sm text-muted">
        {count(n)} · {dates}
      </p>
      {group.repeats ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Repeat aria-hidden="true" className="size-4 shrink-0" />
          {repeatsText(group.repeats, formatCents)}
        </p>
      ) : null}

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
          {n === 1
            ? "See the transaction"
            : `See ${n > group.examples.length ? `the latest ${group.examples.length}` : `all ${n}`}`}
        </summary>
        <ul className="divide-y divide-surface-0">
          {group.examples.map((row) => (
            <li key={row.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block break-words text-fg">{row.payee || "No payee"}</span>
                <span className="block text-muted">
                  {[formatShortDate(row.date, today), row.memo].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-fg">
                {row.amountCents > 0
                  ? `+${formatCents(row.amountCents)}`
                  : formatSigned(row.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {suggestion && suggested ? (
        <p className="text-sm text-fg">
          <span className="font-semibold text-accent-text">Suggested: {suggested.name}</span>
          <span className="text-muted">
            {" "}
            · {CONFIDENCE[suggestion.confidence]}. {suggestion.reason}.
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted">No suggestion yet. Pick a category.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${ids}-category`} className={labelClass}>
            Category
          </label>
          <select
            id={`${ids}-category`}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={inputClass}
          >
            <option value="">Pick a category</option>
            {CATEGORY_KINDS.map((kind) => {
              const list = options.filter((category) => category.kind === kind);
              return list.length === 0 ? null : (
                <optgroup key={kind} label={CATEGORY_KIND_LABELS[kind]}>
                  {list.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-rename`} className={labelClass}>
            Rename to (optional)
          </label>
          <input
            id={`${ids}-rename`}
            value={renameTo}
            onChange={(event) => setRenameTo(event.target.value)}
            placeholder="Keep as the bank wrote it"
            maxLength={200}
            autoComplete="off"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
          <input
            type="checkbox"
            checked={makeRule}
            onChange={(event) => setMakeRule(event.target.checked)}
            className="size-5 accent-accent"
          />
          Sort future imports like these the same way
        </label>
        {makeRule ? (
          <div>
            <label htmlFor={`${ids}-rule`} className={labelClass}>
              {group.key.startsWith("person:")
                ? "Rule looks for the name"
                : "Rule looks for payees with"}
            </label>
            <input
              id={`${ids}-rule`}
              value={ruleText}
              onChange={(event) => setRuleText(event.target.value)}
              maxLength={100}
              autoComplete="off"
              aria-invalid={ruleText.trim() === "" ? true : undefined}
              className={inputClass}
            />
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className={primaryButton}
        disabled={!chosen || apply.isPending || (makeRule && ruleText.trim() === "")}
        onClick={onApply}
      >
        {apply.isPending
          ? "Sorting…"
          : chosen
            ? `Put ${n === 1 ? "it" : `all ${n}`} in ${chosen.name}`
            : "Pick a category"}
      </button>
      {apply.isError ? (
        <p role="alert" className="text-sm text-danger">
          {apply.error.message}
        </p>
      ) : null}
    </li>
  );
}
