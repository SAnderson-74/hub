import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  iconButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { cardLabel } from "../../../shared/cards";
import { centsToInput, parseDollars } from "../../../shared/money";
import {
  parseRate,
  REWARD_KIND_LABELS,
  REWARD_KINDS,
  type RewardKind,
  type RewardRateInput,
  rateToInput,
} from "../../../shared/rewards";
import { type CardRewards, type Category, useDeleteRewards, useSaveRewards } from "../queries";

type RateDraft = {
  key: number;
  kind: "store" | "category";
  contains: string;
  categoryId: string;
  rate: string;
  startsOn: string;
  endsOn: string;
  cap: string;
};

type Draft = {
  kind: RewardKind;
  baseRate: string;
  pointValue: string;
  rates: RateDraft[];
};

let nextKey = 1;

function toDraft(entry: CardRewards): Draft {
  const program = entry.program;
  return {
    kind: program?.kind ?? "cash_back",
    baseRate: program ? rateToInput(program.baseRate) : "1",
    pointValue: program ? rateToInput(program.pointValue) : "1",
    rates: (program?.rates ?? []).map((rate) => ({
      key: nextKey++,
      kind: rate.contains === null ? "category" : "store",
      contains: rate.contains ?? "",
      categoryId: rate.categoryId === null ? "" : String(rate.categoryId),
      rate: rateToInput(rate.rate),
      startsOn: rate.startsOn ?? "",
      endsOn: rate.endsOn ?? "",
      cap: rate.capCents === null ? "" : centsToInput(rate.capCents),
    })),
  };
}

const blankRate = (kind: RateDraft["kind"]): RateDraft => ({
  key: nextKey++,
  kind,
  contains: "",
  categoryId: "",
  rate: "",
  startsOn: "",
  endsOn: "",
  cap: "",
});

/** What's wrong with a bonus rate, or null when it's ready to save. */
function rateProblem(rate: RateDraft): string | null {
  if (rate.kind === "store" && rate.contains.trim() === "") return "Enter the store's name.";
  if (rate.kind === "category" && rate.categoryId === "") return "Pick a category.";
  if (parseRate(rate.rate) === null) return "Enter a rate like 3 or 1.5.";
  if (rate.startsOn && rate.endsOn && rate.endsOn < rate.startsOn) {
    return "The end date has to be on or after the start.";
  }
  if (rate.cap.trim() !== "") {
    const cents = parseDollars(rate.cap);
    if (cents === null || cents <= 0) return "Enter a cap like 1500, or leave it empty.";
  }
  return null;
}

/** Sets up or changes a card's rewards: what it earns, where, and when. */
export function RewardsSheet({
  target,
  categories,
  onClose,
}: {
  /** The card to set up, or null when closed. */
  target: CardRewards | null;
  categories: Category[];
  onClose: () => void;
}) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title="Card rewards"
      description={target ? cardLabel(target.card) : undefined}
    >
      {target ? (
        <RewardsForm key={target.card.id} entry={target} categories={categories} onDone={onClose} />
      ) : null}
    </Sheet>
  );
}

function RewardsForm({
  entry,
  categories,
  onDone,
}: {
  entry: CardRewards;
  categories: Category[];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(entry));
  const [tried, setTried] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const save = useSaveRewards();
  const remove = useDeleteRewards();
  const ids = useId();
  const points = draft.kind === "points";
  const unit = points ? "x" : "%";
  const spending = categories.filter(
    (category) =>
      category.kind === "expense" &&
      (!category.archived || draft.rates.some((rate) => rate.categoryId === String(category.id))),
  );

  const baseRate = parseRate(draft.baseRate);
  const pointValue = parseRate(draft.pointValue);
  const problems = draft.rates.map(rateProblem);
  const blocked =
    baseRate === null ||
    (points && (pointValue === null || pointValue === 0)) ||
    problems.some(Boolean);
  const error = save.error ?? remove.error;

  const setRate = (key: number, patch: Partial<RateDraft>) =>
    setDraft((current) => ({
      ...current,
      rates: current.rates.map((rate) => (rate.key === key ? { ...rate, ...patch } : rate)),
    }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked || baseRate === null) return;
    const rates: RewardRateInput[] = draft.rates.map((rate) => ({
      categoryId: rate.kind === "category" ? Number(rate.categoryId) : null,
      contains: rate.kind === "store" ? rate.contains.trim() : null,
      rate: parseRate(rate.rate) ?? 0,
      startsOn: rate.startsOn || null,
      endsOn: rate.endsOn || null,
      capCents: rate.cap.trim() === "" ? null : parseDollars(rate.cap),
    }));
    save.mutate(
      {
        cardId: entry.card.id,
        json: {
          kind: draft.kind,
          baseRate,
          pointValue: points ? (pointValue ?? 100) : 100,
          rates,
        },
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <fieldset className="min-w-0">
          <legend className={labelClass}>Earns</legend>
          <div className="flex rounded-full bg-base p-1 ring-1 ring-surface-0/60">
            {REWARD_KINDS.map((kind) => (
              <label key={kind} className="relative flex-1">
                <input
                  type="radio"
                  name={`${ids}-kind`}
                  value={kind}
                  checked={draft.kind === kind}
                  onChange={() => setDraft((current) => ({ ...current, kind }))}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                />
                <span className="pointer-events-none flex h-10 items-center justify-center rounded-full text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                  {REWARD_KIND_LABELS[kind]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${ids}-base`} className={labelClass}>
              {points ? "Points per dollar on everything else" : "Cash back on everything else"}
            </label>
            <div className="relative">
              <input
                id={`${ids}-base`}
                value={draft.baseRate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, baseRate: event.target.value }))
                }
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={tried && baseRate === null}
                className={`${inputClass} pr-10 tabular-nums`}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
              >
                {unit}
              </span>
            </div>
            {tried && baseRate === null ? (
              <p className="mt-1.5 text-sm text-danger">Enter a rate like 1 or 1.5.</p>
            ) : null}
          </div>
          {points ? (
            <div className="min-w-0">
              <label htmlFor={`${ids}-value`} className={labelClass}>
                Each point is worth
              </label>
              <div className="relative">
                <input
                  id={`${ids}-value`}
                  value={draft.pointValue}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, pointValue: event.target.value }))
                  }
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={tried && (pointValue === null || pointValue === 0)}
                  aria-describedby={`${ids}-value-hint`}
                  className={`${inputClass} pr-10 tabular-nums`}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
                >
                  ¢
                </span>
              </div>
              <p id={`${ids}-value-hint`} className="mt-1.5 text-sm text-muted">
                1¢ is typical for cash or a statement credit. Travel can be worth more.
              </p>
            </div>
          ) : null}
        </div>

        <section aria-labelledby={`${ids}-rates`} className="space-y-3">
          <div>
            <h3 id={`${ids}-rates`} className="font-semibold text-fg">
              Bonus rates
            </h3>
            <p className="mt-1 text-sm text-muted">
              Store rates come first, then categories. Give a rate dates for a rotating quarterly
              bonus, and a cap when it only applies to the first so much spent.
            </p>
          </div>
          {draft.rates.length > 0 ? (
            <ul className="space-y-3">
              {draft.rates.map((rate, index) => {
                const problem = tried ? problems[index] : null;
                const prefix = `${ids}-rate-${rate.key}`;
                return (
                  <li
                    key={rate.key}
                    className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="min-w-0 sm:col-span-2">
                          {rate.kind === "store" ? (
                            <>
                              <label htmlFor={`${prefix}-store`} className={labelClass}>
                                At stores named
                              </label>
                              <input
                                id={`${prefix}-store`}
                                value={rate.contains}
                                onChange={(event) =>
                                  setRate(rate.key, { contains: event.target.value })
                                }
                                maxLength={200}
                                autoComplete="off"
                                placeholder="Example Store, exmpl mktp"
                                aria-describedby={`${prefix}-store-hint`}
                                className={inputClass}
                              />
                              <p id={`${prefix}-store-hint`} className="mt-1.5 text-sm text-muted">
                                Separate spellings with commas, like the store's name and how your
                                bank writes it.
                              </p>
                            </>
                          ) : (
                            <>
                              <label htmlFor={`${prefix}-category`} className={labelClass}>
                                On category
                              </label>
                              <select
                                id={`${prefix}-category`}
                                value={rate.categoryId}
                                onChange={(event) =>
                                  setRate(rate.key, { categoryId: event.target.value })
                                }
                                className={inputClass}
                              >
                                <option value="">Pick a category</option>
                                {spending.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>
                        <div className="min-w-0">
                          <label htmlFor={`${prefix}-rate`} className={labelClass}>
                            Rate
                          </label>
                          <div className="relative">
                            <input
                              id={`${prefix}-rate`}
                              value={rate.rate}
                              onChange={(event) => setRate(rate.key, { rate: event.target.value })}
                              inputMode="decimal"
                              autoComplete="off"
                              className={`${inputClass} pr-10 tabular-nums`}
                            />
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
                            >
                              {unit}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`${iconButton} mt-7`}
                        aria-label="Remove this bonus rate"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            rates: current.rates.filter((item) => item.key !== rate.key),
                          }))
                        }
                      >
                        <Trash2 aria-hidden="true" className="size-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="min-w-0">
                        <label htmlFor={`${prefix}-from`} className={labelClass}>
                          From
                        </label>
                        <input
                          id={`${prefix}-from`}
                          type="date"
                          value={rate.startsOn}
                          onChange={(event) => setRate(rate.key, { startsOn: event.target.value })}
                          className={`${inputClass} [color-scheme:dark]`}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`${prefix}-to`} className={labelClass}>
                          To
                        </label>
                        <input
                          id={`${prefix}-to`}
                          type="date"
                          value={rate.endsOn}
                          onChange={(event) => setRate(rate.key, { endsOn: event.target.value })}
                          className={`${inputClass} [color-scheme:dark]`}
                        />
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <label htmlFor={`${prefix}-cap`} className={labelClass}>
                          On the first
                        </label>
                        <input
                          id={`${prefix}-cap`}
                          value={rate.cap}
                          onChange={(event) => setRate(rate.key, { cap: event.target.value })}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="No cap"
                          className={`${inputClass} tabular-nums`}
                        />
                      </div>
                    </div>
                    {problem ? (
                      <p role="alert" className="text-sm text-danger">
                        {problem}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  rates: [...current.rates, blankRate("store")],
                }))
              }
            >
              <Plus aria-hidden="true" className="size-4" />
              Add store rate
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  rates: [...current.rates, blankRate("category")],
                }))
              }
            >
              <Plus aria-hidden="true" className="size-4" />
              Add category rate
            </button>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={primaryButton}
            disabled={(tried && blocked) || save.isPending}
          >
            Save rewards
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        ) : null}
      </form>

      {entry.program ? (
        confirmOff ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">
              Turn off rewards for {entry.card.name}? Its rates are removed; its transactions stay.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(entry.card.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                Turn off rewards
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmOff(false)}>
                Keep rewards
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-surface-0/70 pt-4">
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmOff(true)}
            >
              Turn off rewards
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
