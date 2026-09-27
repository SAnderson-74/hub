import { ExternalLink, Plus, Tag, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ghostButton, iconButton, inputClass } from "../../../client/components/ui";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { formatShortDate, localDate } from "../../tasks/dates";
import {
  type Item,
  type Listing,
  useAddListing,
  useChangePrice,
  useDeleteListing,
  usePlatforms,
  useUpdateListing,
} from "../queries";
import { listingAge } from "../stock";

/** Where an item is (or was) up for sale, with each asking price. For the item sheet. */
export function ItemListings({ item }: { item: Item }) {
  const headingId = useId();
  const today = localDate();
  const update = useUpdateListing();
  const remove = useDeleteListing();
  const error = update.error ?? remove.error;
  const open = item.listings.filter((listing) => listing.endedOn === null);

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <h3 id={headingId} className="font-semibold text-fg">
        Listings
      </h3>
      <p className="text-sm text-muted">
        {item.listings.length === 0
          ? "Not listed anywhere yet."
          : open.length === 0
            ? "No open listings."
            : `Listed on ${open.length} ${open.length === 1 ? "platform" : "platforms"}.`}
      </p>

      {item.listings.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {item.listings.map((listing) => (
            <ListingRow
              key={listing.id}
              listing={listing}
              today={today}
              busy={update.isPending || remove.isPending}
              onEnd={(endedOn) => update.mutate({ id: listing.id, patch: { endedOn } })}
              onDelete={() => remove.mutate(listing.id)}
            />
          ))}
        </ul>
      ) : null}

      {item.status === "sold" || item.status === "kept" ? null : <NewListing item={item} />}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}

function ListingRow({
  listing,
  today,
  busy,
  onEnd,
  onDelete,
}: {
  listing: Listing;
  today: string;
  busy: boolean;
  onEnd: (endedOn: string | null) => void;
  onDelete: () => void;
}) {
  const [repricing, setRepricing] = useState(false);
  const name = listing.platform?.name ?? "No platform";
  const history = listing.prices.map((price) => formatCents(price.priceCents)).join(" → ");
  const ended = listing.endedOn !== null;

  return (
    <li className="rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold break-words ${ended ? "text-muted" : "text-fg"}`}>{name}</p>
          <p className="text-sm text-muted">
            Listed {formatShortDate(listing.listedOn, today)}
            {listing.endedOn ? `, ended ${formatShortDate(listing.endedOn, today)}` : ""}.{" "}
            {listingAge(listing, today)}.
          </p>
        </div>
        <p
          className={`shrink-0 text-lg font-bold tabular-nums ${ended ? "text-muted" : "text-fg"}`}
        >
          {formatCents(listing.priceCents)}
        </p>
      </div>
      {listing.title || listing.description ? (
        <details className="mt-2 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
            {listing.title || "Listing text"}
          </summary>
          {listing.description ? (
            <p className="whitespace-pre-wrap break-words text-muted">{listing.description}</p>
          ) : null}
        </details>
      ) : null}
      {listing.prices.length > 1 ? (
        <p className="mt-1 text-sm text-muted">
          <span className="sr-only">Price history: </span>
          {history}
        </p>
      ) : null}

      {repricing ? (
        <NewPrice listing={listing} onDone={() => setRepricing(false)} />
      ) : (
        <div className="mt-2 -ml-3 flex flex-wrap items-center gap-1">
          {ended ? null : (
            <button type="button" className={ghostButton} onClick={() => setRepricing(true)}>
              <Tag aria-hidden="true" className="size-4" />
              Change price
            </button>
          )}
          <button
            type="button"
            className={ghostButton}
            disabled={busy}
            onClick={() => onEnd(ended ? null : today)}
          >
            {ended ? "Reopen listing" : "End listing"}
          </button>
          {listing.url ? (
            <a href={listing.url} target="_blank" rel="noopener noreferrer" className={ghostButton}>
              <ExternalLink aria-hidden="true" className="size-4" />
              Open link
            </a>
          ) : null}
          <button
            type="button"
            className={`${iconButton} ml-auto hover:text-danger`}
            aria-label={`Delete listing on ${name}`}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function NewPrice({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const [price, setPrice] = useState(centsToInput(listing.priceCents));
  const change = useChangePrice();
  const cents = parseDollars(price);
  const unchanged = cents === listing.priceCents;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (cents === null || unchanged) return;
    change.mutate({ id: listing.id, json: { priceCents: cents } }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        inputMode="decimal"
        aria-label="New price"
        aria-invalid={cents === null}
        className={`${inputClass} w-32 tabular-nums`}
      />
      <button
        type="submit"
        disabled={cents === null || unchanged || change.isPending}
        className="inline-flex h-11 items-center rounded-full bg-accent px-4 font-bold text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save price
      </button>
      <button type="button" className={ghostButton} onClick={onDone}>
        Cancel
      </button>
      {cents === null ? (
        <p className="w-full text-sm text-danger">Use an amount like 12.50.</p>
      ) : null}
      {change.error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {change.error.message}
        </p>
      ) : null}
    </form>
  );
}

function NewListing({ item }: { item: Item }) {
  const ids = useId();
  const platforms = usePlatforms();
  const add = useAddListing();
  const [platformId, setPlatformId] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [listedOn, setListedOn] = useState("");
  const cents = price.trim() === "" ? null : parseDollars(price);
  const priceInvalid = price.trim() !== "" && cents === null;
  const active = (platforms.data ?? []).filter((platform) => !platform.archived);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (cents === null) return;
    add.mutate(
      {
        itemId: item.id,
        json: {
          platformId: platformId ? Number(platformId) : null,
          priceCents: cents,
          url: url.trim(),
          ...(listedOn && { listedOn }),
        },
      },
      {
        onSuccess: () => {
          setPrice("");
          setUrl("");
          setListedOn("");
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2" noValidate>
      <p className="text-sm font-semibold text-muted">New listing</p>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
        <select
          value={platformId}
          onChange={(event) => setPlatformId(event.target.value)}
          aria-label="Listing platform"
          className={inputClass}
        >
          <option value="">No platform</option>
          {active.map((platform) => (
            <option key={platform.id} value={String(platform.id)}>
              {platform.name}
            </option>
          ))}
        </select>
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          aria-label="Asking price"
          aria-invalid={priceInvalid}
          aria-describedby={priceInvalid ? `${ids}-price-error` : undefined}
          className={`${inputClass} tabular-nums`}
        />
      </div>
      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        type="url"
        inputMode="url"
        placeholder="https:// link (optional)"
        aria-label="Listing link"
        autoCapitalize="none"
        className={inputClass}
      />
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm text-muted">
          <span className="shrink-0">Listed on</span>
          <input
            type="date"
            value={listedOn}
            onChange={(event) => setListedOn(event.target.value)}
            aria-label="Listed on (leave empty for today)"
            className={`${inputClass} h-11 min-w-0 [color-scheme:dark]`}
          />
        </label>
        <button
          type="submit"
          aria-label="Add listing"
          disabled={cents === null || add.isPending}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-0 text-fg hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
      {priceInvalid ? (
        <p id={`${ids}-price-error`} className="text-sm text-danger">
          Use an amount like 12.50.
        </p>
      ) : null}
      {add.error ? (
        <p role="alert" className="text-sm text-danger">
          {add.error.message}
        </p>
      ) : null}
    </form>
  );
}
