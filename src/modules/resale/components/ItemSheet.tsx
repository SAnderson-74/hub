import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { StatusDot } from "../../../client/components/StatusDot";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { centsToInput, parseDollars } from "../../../shared/money";
import {
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
  type ItemStatus,
  type ItemUpdate,
} from "../../../shared/resale";
import { SubjectTime } from "../../time/components/SubjectTime";
import {
  type Item,
  type Platform,
  useCreateItem,
  useDeleteItem,
  usePlatforms,
  useUpdateItem,
} from "../queries";

import { ItemCosts } from "./ItemCosts";
import { ItemListings } from "./ItemListings";

/** "new" adds an item; an item edits it; null is closed. */
export type ItemTarget = "new" | Item | null;

type Draft = {
  title: string;
  status: ItemStatus;
  category: string;
  condition: string;
  purchasedOn: string;
  price: string;
  platformId: string;
  purchaseFrom: string;
  notes: string;
  soldOn: string;
  salePrice: string;
  salePlatformId: string;
  buyerNotes: string;
};

function toDraft(item: Item | null): Draft {
  return {
    title: item?.title ?? "",
    status: item?.status ?? "acquired",
    category: item?.category ?? "",
    condition: item?.condition ?? "",
    purchasedOn: item?.purchasedOn ?? "",
    price: item?.purchaseCents != null ? centsToInput(item.purchaseCents) : "",
    platformId: item?.purchasePlatform ? String(item.purchasePlatform.id) : "",
    purchaseFrom: item?.purchaseFrom ?? "",
    notes: item?.notes ?? "",
    soldOn: item?.soldOn ?? "",
    salePrice: item?.saleCents != null ? centsToInput(item.saleCents) : "",
    salePlatformId: item?.salePlatform ? String(item.salePlatform.id) : "",
    buyerNotes: item?.buyerNotes ?? "",
  };
}

export function ItemSheet({
  target,
  categories,
  onClose,
  onManagePlatforms,
}: {
  target: ItemTarget;
  /** Categories already in use, offered as suggestions. */
  categories: string[];
  onClose: () => void;
  onManagePlatforms: () => void;
}) {
  const item = target !== null && target !== "new" ? target : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={item ? "Item" : "Add item"}
      description={
        item ? undefined : "You can add listings, costs, and time once the item is saved."
      }
    >
      {target === null ? null : (
        <ItemForm
          key={item?.id ?? "new"}
          item={item}
          categories={categories}
          onDone={onClose}
          onManagePlatforms={onManagePlatforms}
        />
      )}
    </Sheet>
  );
}

function ItemForm({
  item,
  categories,
  onDone,
  onManagePlatforms,
}: {
  item: Item | null;
  categories: string[];
  onDone: () => void;
  onManagePlatforms: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(item));
  // Adding a listing can change the status on the server (to listed). Follow it,
  // unless the status here was changed and not saved yet.
  const serverStatus = useRef(item?.status);
  useEffect(() => {
    if (!item || item.status === serverStatus.current) return;
    const previous = serverStatus.current;
    serverStatus.current = item.status;
    setDraft((current) =>
      current.status === previous ? { ...current, status: item.status } : current,
    );
  }, [item]);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tried, setTried] = useState(false);
  const platforms = usePlatforms();
  const create = useCreateItem();
  const update = useUpdateItem();
  const remove = useDeleteItem();
  const ids = useId();

  const titleMissing = draft.title.trim() === "";
  const cents = draft.price.trim() === "" ? null : parseDollars(draft.price);
  const priceInvalid = draft.price.trim() !== "" && cents === null;
  const saleCents = draft.salePrice.trim() === "" ? null : parseDollars(draft.salePrice);
  const salePriceInvalid = draft.salePrice.trim() !== "" && saleCents === null;
  const blocked = titleMissing || priceInvalid || salePriceInvalid;
  const error = create.error ?? update.error ?? remove.error;
  // Archived platforms stay selectable only for the item that already uses one.
  const choices = (platforms.data ?? []).filter(
    (platform: Platform) => !platform.archived || String(platform.id) === draft.platformId,
  );
  const saleChoices = (platforms.data ?? []).filter(
    (platform: Platform) => !platform.archived || String(platform.id) === draft.salePlatformId,
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked) return;
    const fields: ItemUpdate & { title: string } = {
      title: draft.title.trim(),
      status: draft.status,
      category: draft.category.trim(),
      condition: draft.condition.trim(),
      purchasedOn: draft.purchasedOn || null,
      purchaseCents: cents,
      purchasePlatformId: draft.platformId ? Number(draft.platformId) : null,
      purchaseFrom: draft.purchaseFrom.trim(),
      notes: draft.notes,
      // An empty sale date on a newly sold item is dated today by the server.
      soldOn: draft.soldOn || null,
      saleCents,
      salePlatformId: draft.salePlatformId ? Number(draft.salePlatformId) : null,
      buyerNotes: draft.buyerNotes,
    };
    if (!item) {
      create.mutate(fields, { onSuccess: onDone });
      return;
    }
    update.mutate(
      { id: item.id, patch: fields },
      {
        onSuccess: (saved) => {
          setDraft(toDraft(saved));
          setMessage("Item saved");
        },
      },
    );
  };

  return (
    <div className="space-y-8">
      {item?.needsReview ? (
        <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-warn/50">
          <p className="flex items-center gap-2 font-semibold text-warn">
            <StatusDot tone="warn" />
            Needs review
          </p>
          <p className="text-sm text-fg">
            {item.reviewNote || "This item was imported with values to check."}
          </p>
          <button
            type="button"
            className={secondaryButton}
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { id: item.id, patch: { needsReview: false } },
                { onSuccess: () => setMessage("Item marked reviewed") },
              )
            }
          >
            Mark reviewed
          </button>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${ids}-title`} className={labelClass}>
            Title
          </label>
          <input
            id={`${ids}-title`}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={200}
            placeholder="Film camera"
            aria-invalid={tried && titleMissing}
            className={inputClass}
          />
          {tried && titleMissing ? (
            <p className="mt-1.5 text-sm text-danger">Give the item a title.</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${ids}-status`} className={labelClass}>
              Status
            </label>
            <select
              id={`${ids}-status`}
              value={draft.status}
              onChange={(event) => set("status", event.target.value as ItemStatus)}
              className={inputClass}
            >
              {ITEM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ITEM_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-category`} className={labelClass}>
              Category
            </label>
            <input
              id={`${ids}-category`}
              value={draft.category}
              onChange={(event) => set("category", event.target.value)}
              maxLength={80}
              list={`${ids}-categories`}
              className={inputClass}
            />
            <datalist id={`${ids}-categories`}>
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-condition`} className={labelClass}>
            Condition
          </label>
          <input
            id={`${ids}-condition`}
            value={draft.condition}
            onChange={(event) => set("condition", event.target.value)}
            maxLength={80}
            placeholder="Used, works"
            className={inputClass}
          />
        </div>

        <fieldset
          aria-labelledby={`${ids}-purchase`}
          className="min-w-0 space-y-4 border-t border-surface-0/70 pt-5"
        >
          <h3 id={`${ids}-purchase`} className="font-semibold text-fg">
            Purchase
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor={`${ids}-paid`} className={labelClass}>
                Price paid
              </label>
              <input
                id={`${ids}-paid`}
                value={draft.price}
                onChange={(event) => set("price", event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={priceInvalid}
                aria-describedby={priceInvalid ? `${ids}-paid-error` : undefined}
                className={`${inputClass} tabular-nums`}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${ids}-date`} className={labelClass}>
                Bought on
              </label>
              <input
                id={`${ids}-date`}
                type="date"
                value={draft.purchasedOn}
                onChange={(event) => set("purchasedOn", event.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </div>
          </div>
          {priceInvalid ? (
            <p id={`${ids}-paid-error`} className="-mt-2 text-sm text-danger">
              Use an amount like 12.50.
            </p>
          ) : null}
          <div>
            <label htmlFor={`${ids}-platform`} className={labelClass}>
              Platform
            </label>
            <select
              id={`${ids}-platform`}
              value={draft.platformId}
              onChange={(event) => set("platformId", event.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {choices.map((platform) => (
                <option key={platform.id} value={String(platform.id)}>
                  {platform.archived ? `${platform.name} (archived)` : platform.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-sm text-muted">
              {choices.length === 0 ? "No platforms yet. " : "Missing one? "}
              <button
                type="button"
                onClick={onManagePlatforms}
                className="font-semibold text-accent-text underline"
              >
                Manage platforms
              </button>
            </p>
          </div>
          <div>
            <label htmlFor={`${ids}-from`} className={labelClass}>
              Seller or place
            </label>
            <input
              id={`${ids}-from`}
              value={draft.purchaseFrom}
              onChange={(event) => set("purchaseFrom", event.target.value)}
              maxLength={200}
              placeholder="Garage sale"
              className={inputClass}
            />
          </div>
        </fieldset>

        {draft.status === "sold" ? (
          <fieldset
            aria-labelledby={`${ids}-sale`}
            className="min-w-0 space-y-4 border-t border-surface-0/70 pt-5"
          >
            <h3 id={`${ids}-sale`} className="font-semibold text-fg">
              Sale
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor={`${ids}-sold-for`} className={labelClass}>
                  Sold for
                </label>
                <input
                  id={`${ids}-sold-for`}
                  value={draft.salePrice}
                  onChange={(event) => set("salePrice", event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={salePriceInvalid}
                  aria-describedby={salePriceInvalid ? `${ids}-sold-for-error` : undefined}
                  className={`${inputClass} tabular-nums`}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${ids}-sold-on`} className={labelClass}>
                  Sold on
                </label>
                <input
                  id={`${ids}-sold-on`}
                  type="date"
                  value={draft.soldOn}
                  onChange={(event) => set("soldOn", event.target.value)}
                  className={`${inputClass} [color-scheme:dark]`}
                />
              </div>
            </div>
            <p
              id={salePriceInvalid ? `${ids}-sold-for-error` : undefined}
              className={`-mt-2 text-sm ${salePriceInvalid ? "text-danger" : "text-muted"}`}
            >
              {salePriceInvalid
                ? "Use an amount like 12.50."
                : "Leave the date empty to use today. Open listings end on the sale date."}
            </p>
            <div>
              <label htmlFor={`${ids}-sold-via`} className={labelClass}>
                Sold on platform
              </label>
              <select
                id={`${ids}-sold-via`}
                value={draft.salePlatformId}
                onChange={(event) => set("salePlatformId", event.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {saleChoices.map((platform) => (
                  <option key={platform.id} value={String(platform.id)}>
                    {platform.archived ? `${platform.name} (archived)` : platform.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-buyer`} className={labelClass}>
                Buyer notes
              </label>
              <textarea
                id={`${ids}-buyer`}
                value={draft.buyerNotes}
                onChange={(event) => set("buyerNotes", event.target.value)}
                rows={2}
                maxLength={2_000}
                placeholder="How it was paid, picked up, or shipped"
                className={textareaClass}
              />
            </div>
          </fieldset>
        ) : null}

        <div>
          <label htmlFor={`${ids}-notes`} className={labelClass}>
            Notes
          </label>
          <textarea
            id={`${ids}-notes`}
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
            rows={3}
            className={textareaClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={primaryButton}
            disabled={(tried && blocked) || create.isPending || update.isPending}
          >
            {item ? "Save item" : "Add item"}
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        ) : null}
      </form>
      {item ? <ItemListings item={item} /> : null}
      {item ? <ItemCosts item={item} /> : null}
      {item ? <SubjectTime subject={{ type: "resale_item", id: item.id }} /> : null}
      {item ? (
        confirmDelete ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">
              Delete this item? Its links and tags go with it. This can't be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                Delete item
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
                Keep item
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-surface-0/70 pt-4">
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete item
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
