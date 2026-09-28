import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  iconButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "../../../shared/books";
import {
  RULE_DIRECTION_LABELS,
  RULE_DIRECTIONS,
  type RuleDirection,
} from "../../../shared/moneyRules";
import {
  type Book,
  type Category,
  type Rule,
  useApplyRules,
  useCreateRule,
  useDeleteRule,
  useMoveRule,
  useRules,
} from "../queries";

/**
 * "Payee contains X → category Y" rules for a book. Imports use them, and they can
 * sort the uncategorized transactions already here.
 */
export function RulesSheet({
  book,
  categories,
  open,
  onClose,
}: {
  book: Book;
  categories: Category[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rules"
      description="Sort transactions by their payee. Imports use these rules, first match first, and a file's own categories win."
    >
      {open ? <RuleList book={book} categories={categories} /> : null}
    </Sheet>
  );
}

function RuleList({ book, categories }: { book: Book; categories: Category[] }) {
  const rules = useRules(book.id);
  const create = useCreateRule();
  const move = useMoveRule();
  const remove = useDeleteRule();
  const apply = useApplyRules();
  const [contains, setContains] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [direction, setDirection] = useState<RuleDirection>("any");
  const [renameTo, setRenameTo] = useState("");
  const [tried, setTried] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();
  const error = create.error ?? move.error ?? remove.error ?? apply.error;
  const busy = move.isPending || remove.isPending;
  const choices = categories.filter((category) => !category.archived);

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!contains.trim() || !categoryId) return;
    create.mutate(
      {
        bookId: book.id,
        contains: contains.trim(),
        categoryId: Number(categoryId),
        direction,
        renameTo: renameTo.trim(),
      },
      {
        onSuccess: () => {
          setAnnouncement(`Rule added for "${contains.trim()}"`);
          setContains("");
          setRenameTo("");
          setTried(false);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={onAdd}
        noValidate
        className="space-y-4 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${ids}-contains`} className={labelClass}>
              Payee or person contains
            </label>
            <input
              id={`${ids}-contains`}
              value={contains}
              onChange={(event) => setContains(event.target.value)}
              maxLength={100}
              placeholder="grocery"
              autoComplete="off"
              aria-invalid={tried && !contains.trim()}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-category`} className={labelClass}>
              Category
            </label>
            <select
              id={`${ids}-category`}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-invalid={tried && !categoryId}
              className={inputClass}
            >
              <option value="">Pick a category</option>
              {CATEGORY_KINDS.map((kind) => {
                const options = choices.filter((category) => category.kind === kind);
                return options.length === 0 ? null : (
                  <optgroup key={kind} label={CATEGORY_KIND_LABELS[kind]}>
                    {options.map((category) => (
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
            <label htmlFor={`${ids}-direction`} className={labelClass}>
              For
            </label>
            <select
              id={`${ids}-direction`}
              value={direction}
              onChange={(event) => setDirection(event.target.value as RuleDirection)}
              className={inputClass}
            >
              {RULE_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {RULE_DIRECTION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-rename`} className={labelClass}>
              Rename payee to
            </label>
            <input
              id={`${ids}-rename`}
              value={renameTo}
              onChange={(event) => setRenameTo(event.target.value)}
              maxLength={200}
              placeholder="Optional"
              autoComplete="off"
              className={inputClass}
            />
          </div>
        </div>
        {tried && (!contains.trim() || !categoryId) ? (
          <p className="text-sm text-danger">
            Enter text to look for in the payee and pick a category.
          </p>
        ) : null}
        <button type="submit" className={primaryButton} disabled={create.isPending}>
          Add rule
        </button>
      </form>

      {rules.isPending ? (
        <LoadingRows rows={2} />
      ) : rules.isError ? (
        <ErrorNote error={rules.error} onRetry={() => void rules.refetch()} />
      ) : rules.data.length === 0 ? (
        <p className="text-muted">
          No rules yet. Add one for a payee you see often, like a grocery store.
        </p>
      ) : (
        <>
          <ol className="space-y-2">
            {rules.data.map((rule, index) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                first={index === 0}
                last={index === rules.data.length - 1}
                busy={busy}
                onMove={(to) => move.mutate({ id: rule.id, to })}
                onDelete={() =>
                  remove.mutate(rule.id, {
                    onSuccess: () => setAnnouncement(`Rule for "${rule.contains}" deleted`),
                  })
                }
              />
            ))}
          </ol>
          <div className="space-y-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={apply.isPending}
              onClick={() =>
                apply.mutate(book.id, {
                  onSuccess: ({ categorized }) =>
                    setAnnouncement(
                      categorized === 0
                        ? "No uncategorized transactions fit these rules"
                        : `Categorized ${categorized} ${categorized === 1 ? "transaction" : "transactions"}`,
                    ),
                })
              }
            >
              Apply rules to uncategorized transactions
            </button>
            <p className="text-sm text-muted">
              Categorized transactions and transfers are left as they are.
            </p>
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
    </div>
  );
}

function RuleRow({
  rule,
  first,
  last,
  busy,
  onMove,
  onDelete,
}: {
  rule: Rule;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (to: "earlier" | "later") => void;
  onDelete: () => void;
}) {
  const details = [
    rule.direction === "any" ? "" : RULE_DIRECTION_LABELS[rule.direction],
    rule.renameTo ? `Renamed to ${rule.renameTo}` : "",
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-1 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50">
      <div className="min-w-0 flex-1 py-2">
        <p className="break-words text-fg">
          <span className="text-muted">Payee or person contains</span>{" "}
          <span className="font-semibold">“{rule.contains}”</span>{" "}
          <span className="text-muted">→</span>{" "}
          <span className="font-semibold">{rule.category.name}</span>
        </p>
        {details.length > 0 ? (
          <p className="text-sm break-words text-muted">{details.join(" · ")}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Try "${rule.contains}" earlier`}
        disabled={busy || first}
        className={iconButton}
        onClick={() => onMove("earlier")}
      >
        <ArrowUp aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Try "${rule.contains}" later`}
        disabled={busy || last}
        className={iconButton}
        onClick={() => onMove("later")}
      >
        <ArrowDown aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Delete the rule for "${rule.contains}"`}
        disabled={busy}
        className={`${iconButton} hover:text-danger`}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}
