import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { timeEntries } from "../time/schema";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const addPlatform = async (name: string) => {
  const all = await body(await t.api.resale.platforms.$post({ json: { name } }));
  const platform = all.find((item) => item.name === name);
  if (!platform) throw new Error(`Expected a platform called ${name}`);
  return platform;
};
const itemParam = (id: number) => ({ param: { id: String(id) } });
const history = async (id: number) =>
  (await body(await t.api.activity.$get({ query: { type: "resale_item", id: String(id) } })))
    .entries;

describe("platforms", () => {
  it("keeps names unique and archives platforms that items use", async () => {
    const classifieds = await addPlatform("Local classifieds");
    const duplicate = await failure(
      await t.api.resale.platforms.$post({ json: { name: "local CLASSIFIEDS" } }),
    );
    expect(duplicate).toMatchObject({ status: 409 });
    expect(duplicate.error).toContain("already a platform");

    await body(
      await t.api.resale.items.$post({
        json: { title: "Desk lamp", purchasePlatformId: classifieds.id },
      }),
    );
    const inUse = await failure(
      await t.api.resale.platforms[":id"].$delete({ param: { id: String(classifieds.id) } }),
    );
    expect(inUse).toMatchObject({ status: 409 });
    expect(inUse.error).toContain("Archive it instead");

    const archived = await body(
      await t.api.resale.platforms[":id"].$patch({
        param: { id: String(classifieds.id) },
        json: { archived: true },
      }),
    );
    expect(archived).toEqual([
      { id: classifieds.id, name: "Local classifieds", notes: "", archived: true, itemCount: 1 },
    ]);

    const unused = await addPlatform("Example Market");
    const left = await body(
      await t.api.resale.platforms[":id"].$delete({ param: { id: String(unused.id) } }),
    );
    expect(left.map((p) => p.name)).toEqual(["Local classifieds"]);
  });
});

describe("items", () => {
  it("records purchases and logs changes, with money as dollars", async () => {
    const shop = await addPlatform("Thrift store");
    const item = await body(
      await t.api.resale.items.$post({
        json: {
          title: "Film camera",
          category: "Cameras",
          condition: "Untested",
          purchasedOn: "2030-01-05",
          purchaseCents: 1_250,
          purchasePlatformId: shop.id,
          purchaseFrom: "Garage sale",
        },
      }),
    );
    expect(item).toMatchObject({
      title: "Film camera",
      status: "acquired",
      purchaseCents: 1_250,
      purchasePlatform: { id: shop.id, name: "Thrift store" },
      purchaseFrom: "Garage sale",
    });

    const updated = await body(
      await t.api.resale.items[":id"].$patch({
        ...itemParam(item.id),
        json: { status: "repairing", purchaseCents: 1_500, purchasePlatformId: null },
      }),
    );
    expect(updated).toMatchObject({ status: "repairing", purchasePlatform: null });
    const entries = await history(item.id);
    expect(entries[0]?.details).toEqual({
      changes: {
        status: { from: "acquired", to: "repairing" },
        paid: { from: "$12.50", to: "$15" },
        boughtOn: { from: "Thrift store", to: null },
      },
    });

    // Nothing changed, nothing logged.
    await t.api.resale.items[":id"].$patch({
      ...itemParam(item.id),
      json: { title: "Film camera" },
    });
    expect(await history(item.id)).toHaveLength(2);

    const listed = await body(await t.api.resale.items.$get({ query: { status: "listed,sold" } }));
    expect(listed).toEqual([]);
    const repairing = await body(await t.api.resale.items.$get({ query: { status: "repairing" } }));
    expect(repairing.map((row) => row.id)).toEqual([item.id]);

    // Items can be linked like anything else, and deleting detaches them.
    const task = await body(await t.api.tasks.$post({ json: { title: "Replace light seals" } }));
    const link = await t.api.links.$post({
      json: { from: { type: "task", id: task.id }, to: { type: "resale_item", id: item.id } },
    });
    expect(link.status).toBe(201);
    expect((await t.api.resale.items[":id"].$delete(itemParam(item.id))).status).toBe(204);
    expect((await t.api.resale.items[":id"].$get(itemParam(item.id))).status).toBe(404);
    expect((await history(item.id))[0]?.action).toBe("deleted");
  });

  it("rejects bad amounts, dates, and unknown platforms", async () => {
    const negative = await failure(
      await t.api.resale.items.$post({ json: { title: "Chair", purchaseCents: -1 } }),
    );
    expect(negative).toMatchObject({
      status: 400,
      issues: [{ path: "purchaseCents", message: "Amounts can't be negative." }],
    });
    const badDate = await failure(
      await t.api.resale.items.$post({ json: { title: "Chair", purchasedOn: "yesterday" } }),
    );
    expect(badDate).toMatchObject({ status: 400, issues: [{ path: "purchasedOn" }] });
    const noPlatform = await failure(
      await t.api.resale.items.$post({ json: { title: "Chair", purchasePlatformId: 99 } }),
    );
    expect(noPlatform).toMatchObject({
      status: 400,
      error: "That platform doesn't exist. It may have been deleted.",
    });
    const noTitle = await failure(await t.api.resale.items.$post({ json: { title: "  " } }));
    expect(noTitle).toMatchObject({ status: 400, issues: [{ path: "title" }] });
  });
});

describe("costs and time", () => {
  const newItem = async () =>
    body(await t.api.resale.items.$post({ json: { title: "Film camera", purchaseCents: 2_500 } }));

  it("adds up costs per item and logs the total on its timeline", async () => {
    const item = await newItem();
    const withParts = await body(
      await t.api.resale.items[":id"].costs.$post({
        ...itemParam(item.id),
        json: { kind: "parts", label: "Light seals", amountCents: 1_250, spentOn: "2030-01-06" },
      }),
    );
    const withShipping = await body(
      await t.api.resale.items[":id"].costs.$post({
        ...itemParam(item.id),
        json: { kind: "shipping", amountCents: 800 },
      }),
    );
    expect(withShipping).toMatchObject({
      costsCents: 2_050,
      costs: [
        { kind: "parts", label: "Light seals", amountCents: 1_250, spentOn: "2030-01-06" },
        { kind: "shipping", label: "", amountCents: 800, spentOn: null },
      ],
    });
    const [parts] = withParts.costs;
    if (!parts) throw new Error("Expected a cost");

    const changed = await body(
      await t.api.resale.costs[":id"].$patch({
        param: { id: String(parts.id) },
        json: { amountCents: 1_500 },
      }),
    );
    expect(changed.costsCents).toBe(2_300);
    const afterDelete = await body(
      await t.api.resale.costs[":id"].$delete({ param: { id: String(parts.id) } }),
    );
    expect(afterDelete).toMatchObject({ costsCents: 800, costs: [{ kind: "shipping" }] });

    const changes = (await history(item.id)).map((entry) => entry.details);
    expect(changes.slice(0, 4)).toEqual([
      { changes: { costs: { from: "$23", to: "$8" } } },
      { changes: { costs: { from: "$20.50", to: "$23" } } },
      { changes: { costs: { from: "$12.50", to: "$20.50" } } },
      { changes: { costs: { from: "$0", to: "$12.50" } } },
    ]);

    // Costs go with their item.
    await t.api.resale.items[":id"].$delete(itemParam(item.id));
    const gone = await failure(
      await t.api.resale.costs[":id"].$delete({ param: { id: String(parts.id + 1) } }),
    );
    expect(gone.status).toBe(404);
  });

  it("rejects costs without an amount, with a bad kind, or for a missing item", async () => {
    const item = await newItem();
    const post = (json: unknown) =>
      t.api.resale.items[":id"].costs.$post({
        ...itemParam(item.id),
        // @ts-expect-error Deliberately invalid input.
        json,
      });
    expect(await failure(await post({ kind: "parts" }))).toMatchObject({
      status: 400,
      issues: [{ path: "amountCents" }],
    });
    expect(await failure(await post({ kind: "gas", amountCents: 100 }))).toMatchObject({
      status: 400,
      issues: [{ path: "kind" }],
    });
    const missing = await failure(
      await t.api.resale.items[":id"].costs.$post({
        ...itemParam(999),
        json: { kind: "fees", amountCents: 100 },
      }),
    );
    expect(missing).toMatchObject({
      status: 404,
      error: "That item doesn't exist. It may have been deleted.",
    });
  });

  it("totals time logged on an item, counting a running timer", async () => {
    const item = await newItem();
    const subject = { type: "resale_item" as const, id: item.id };
    const hourAgo = Date.now() - 60 * 60_000;
    const logged = await t.api.time.entries.$post({
      json: {
        startedAt: new Date(hourAgo).toISOString(),
        endedAt: new Date(hourAgo + 45 * 60_000).toISOString(),
        subject,
      },
    });
    expect(logged.status).toBe(201);
    // A timer that has been running for ten minutes.
    t.db
      .insert(timeEntries)
      .values({
        startedAt: new Date(Date.now() - 10 * 60_000),
        subjectType: "resale_item",
        subjectId: item.id,
      })
      .run();
    const fetched = await body(await t.api.resale.items[":id"].$get(itemParam(item.id)));
    expect(fetched.timeMinutes).toBeGreaterThanOrEqual(55);
    expect(fetched.timeMinutes).toBeLessThanOrEqual(56);
  });
});

describe("listings and sales", () => {
  // The test app runs in UTC, which is what the server uses for "today".
  const today = new Date().toISOString().slice(0, 10);

  it("lists an item, tracks price changes, and ends listings when it sells", async () => {
    const market = await addPlatform("Local classifieds");
    const item = await body(
      await t.api.resale.items.$post({
        json: { title: "Mechanical keyboard", purchasedOn: "2030-01-02", purchaseCents: 4_000 },
      }),
    );
    const listed = await body(
      await t.api.resale.items[":id"].listings.$post({
        ...itemParam(item.id),
        json: {
          platformId: market.id,
          priceCents: 9_000,
          listedOn: "2030-01-05",
          url: "https://example.com/listing/1",
        },
      }),
    );
    expect(listed).toMatchObject({
      status: "listed",
      listings: [
        {
          platform: { id: market.id, name: "Local classifieds" },
          listedOn: "2030-01-05",
          endedOn: null,
          priceCents: 9_000,
        },
      ],
    });
    const listing = listed.listings[0];
    if (!listing) throw new Error("Expected a listing");

    const dropped = await body(
      await t.api.resale.listings[":id"].prices.$post({
        param: { id: String(listing.id) },
        json: { priceCents: 7_500, changedOn: "2030-01-12" },
      }),
    );
    expect(dropped.listings[0]).toMatchObject({
      priceCents: 7_500,
      prices: [
        { priceCents: 9_000, changedOn: "2030-01-05" },
        { priceCents: 7_500, changedOn: "2030-01-12" },
      ],
    });
    const early = await failure(
      await t.api.resale.listings[":id"].prices.$post({
        param: { id: String(listing.id) },
        json: { priceCents: 7_000, changedOn: "2030-01-01" },
      }),
    );
    expect(early).toMatchObject({ status: 400 });

    // Selling dates the sale today and takes the listing down the same day.
    const sold = await body(
      await t.api.resale.items[":id"].$patch({
        ...itemParam(item.id),
        json: {
          status: "sold",
          saleCents: 7_000,
          salePlatformId: market.id,
          buyerNotes: "Picked up, paid cash",
        },
      }),
    );
    expect(sold).toMatchObject({
      status: "sold",
      soldOn: today,
      saleCents: 7_000,
      salePlatform: { id: market.id, name: "Local classifieds" },
      buyerNotes: "Picked up, paid cash",
      listings: [{ endedOn: today }],
    });

    const changes = (await history(item.id)).map((entry) => entry.details);
    expect(changes[0]).toEqual({
      changes: {
        status: { from: "listed", to: "sold" },
        soldOn: { from: null, to: today },
        soldFor: { from: null, to: "$70" },
        soldVia: { from: null, to: "Local classifieds" },
        buyerNotes: { from: "", to: "Picked up, paid cash" },
      },
    });
    expect(changes[1]).toEqual({ changes: { askingPrice: { from: "$90", to: "$75" } } });
    expect(changes[2]).toEqual({
      changes: {
        listed: { from: null, to: "$90 on Local classifieds" },
        status: { from: "acquired", to: "listed" },
      },
    });

    // The platform is in use for listings and sales, so it can only be archived.
    const inUse = await failure(
      await t.api.resale.platforms[":id"].$delete({ param: { id: String(market.id) } }),
    );
    expect(inUse).toMatchObject({ status: 409 });
  });

  it("ends, reopens, and deletes listings, and checks their dates and links", async () => {
    const item = await body(await t.api.resale.items.$post({ json: { title: "Desk lamp" } }));
    const withListing = await body(
      await t.api.resale.items[":id"].listings.$post({
        ...itemParam(item.id),
        json: { priceCents: 2_500 },
      }),
    );
    const listing = withListing.listings[0];
    if (!listing) throw new Error("Expected a listing");
    expect(listing).toMatchObject({ listedOn: today, platform: null, url: "" });

    const backwards = await failure(
      await t.api.resale.listings[":id"].$patch({
        param: { id: String(listing.id) },
        json: { endedOn: "2000-01-01" },
      }),
    );
    expect(backwards).toMatchObject({
      status: 400,
      error: "A listing can't end before it was listed. Check the dates.",
    });
    const ended = await body(
      await t.api.resale.listings[":id"].$patch({
        param: { id: String(listing.id) },
        json: { endedOn: today },
      }),
    );
    expect(ended.listings[0]?.endedOn).toBe(today);
    const reopened = await body(
      await t.api.resale.listings[":id"].$patch({
        param: { id: String(listing.id) },
        json: { endedOn: null },
      }),
    );
    expect(reopened.listings[0]?.endedOn).toBeNull();

    const badLink = await failure(
      await t.api.resale.items[":id"].listings.$post({
        ...itemParam(item.id),
        json: { priceCents: 100, url: "javascript:alert(1)" },
      }),
    );
    expect(badLink).toMatchObject({
      status: 400,
      issues: [{ path: "url", message: "Use a web address that starts with https://." }],
    });

    const deleted = await body(
      await t.api.resale.listings[":id"].$delete({ param: { id: String(listing.id) } }),
    );
    expect(deleted.listings).toEqual([]);
    expect((await history(item.id))[0]?.details).toEqual({
      changes: { listed: { from: "$25", to: null } },
    });
  });
});

describe("CSV import", () => {
  const rows = [
    {
      title: "Road bike",
      status: "sold",
      purchasedOn: "7/1/2030",
      purchasePrice: "$120",
      purchasePlatform: "Thrift store",
      soldOn: "2030-08-10",
      salePrice: "210",
      salePlatform: "local classifieds",
      fees: "5.25",
    },
    { title: "Desk lamp", purchasePrice: "cheap" },
    { purchasePrice: "5" },
  ];

  it("previews without saving, then imports and flags rows to review", async () => {
    await addPlatform("Local classifieds");
    const preview = await body(
      await t.api.resale.import.$post({ query: { dryRun: "true" }, json: { rows } }),
    );
    expect(preview).toMatchObject({
      created: 2,
      needsReview: 1,
      duplicates: 0,
      skipped: 1,
      platformsCreated: ["Thrift store"],
    });
    expect(preview.rows).toEqual([
      { row: 1, title: "Road bike", outcome: "create", problems: [] },
      {
        row: 2,
        title: "Desk lamp",
        outcome: "create",
        problems: [`Price paid "cheap" isn't an amount Hub can read.`, "No purchase date."],
      },
      {
        row: 3,
        title: "",
        outcome: "skip",
        problems: ["No title, so this row can't be imported."],
      },
    ]);
    expect(await body(await t.api.resale.items.$get({ query: {} }))).toEqual([]);
    expect(
      (await body(await t.api.resale.platforms.$get())).map((platform) => platform.name),
    ).toEqual(["Local classifieds"]);

    const imported = await body(await t.api.resale.import.$post({ query: {}, json: { rows } }));
    expect(imported).toMatchObject({ created: 2, needsReview: 1, skipped: 1 });
    const items = await body(await t.api.resale.items.$get({ query: {} }));
    const bike = items.find((item) => item.title === "Road bike");
    const lamp = items.find((item) => item.title === "Desk lamp");
    expect(bike).toMatchObject({
      status: "sold",
      purchasedOn: "2030-07-01",
      purchaseCents: 12_000,
      purchasePlatform: { name: "Thrift store" },
      saleCents: 21_000,
      salePlatform: { name: "Local classifieds" },
      costs: [{ kind: "fees", amountCents: 525, spentOn: "2030-08-10" }],
      needsReview: false,
    });
    expect(lamp).toMatchObject({
      status: "acquired",
      purchaseCents: null,
      needsReview: true,
      reviewNote: `Price paid "cheap" isn't an amount Hub can read. No purchase date.`,
    });

    // Importing the same file again only reports duplicates.
    const again = await body(await t.api.resale.import.$post({ query: {}, json: { rows } }));
    expect(again).toMatchObject({ created: 0, duplicates: 2, skipped: 1, platformsCreated: [] });

    // Marking an item reviewed clears its note.
    if (!lamp) throw new Error("Expected the lamp");
    const reviewed = await body(
      await t.api.resale.items[":id"].$patch({
        ...itemParam(lamp.id),
        json: { needsReview: false, purchaseCents: 500 },
      }),
    );
    expect(reviewed).toMatchObject({ needsReview: false, reviewNote: "", purchaseCents: 500 });
  });

  it("rejects an empty file or too many rows", async () => {
    const empty = await failure(await t.api.resale.import.$post({ query: {}, json: { rows: [] } }));
    expect(empty).toMatchObject({
      status: 400,
      issues: [{ path: "rows", message: "The file has no rows to import." }],
    });
    const tooMany = await failure(
      await t.api.resale.import.$post({
        query: {},
        json: { rows: Array.from({ length: 2_001 }, () => ({ title: "x" })) },
      }),
    );
    expect(tooMany.status).toBe(400);
  });
});

describe("listing import (paste or Shortcut)", () => {
  const example = {
    format: "hub-listing/v1" as const,
    item: { title: "Stereo receiver", brand: "Example", model: "RX-100", condition: "used" },
    listing: {
      platform: "Local classifieds",
      price: 150,
      title: "Stereo receiver, works great",
      description: "Tested with speakers.",
    },
    purchase: { price: 60, date: "2030-01-10", source: "Garage sale" },
  };
  const post = (json: unknown, dryRun = false) =>
    t.api.resale["listing-import"].$post({
      query: dryRun ? { dryRun: "true" } : {},
      // @ts-expect-error Deliberately loose input, as a Shortcut might send.
      json,
    });

  it("previews, then adds the item, its listing, and a new platform", async () => {
    const preview = await body(await post(example, true));
    expect(preview).toEqual({
      outcome: "created",
      itemId: null,
      title: "Stereo receiver",
      platformCreated: "Local classifieds",
      needsReview: false,
      problems: [],
      message: "Added Stereo receiver and listed it on Local classifieds for $150.",
    });
    expect(await body(await t.api.resale.items.$get({ query: {} }))).toEqual([]);

    const response = await post(example);
    expect(response.status).toBe(201);
    const result = await body(response);
    if (!result.itemId) throw new Error("Expected an item");
    const item = await body(await t.api.resale.items[":id"].$get(itemParam(result.itemId)));
    expect(item).toMatchObject({
      title: "Stereo receiver",
      status: "listed",
      condition: "used",
      notes: "Brand: Example\nModel: RX-100",
      purchasedOn: "2030-01-10",
      purchaseCents: 6_000,
      purchaseFrom: "Garage sale",
      needsReview: false,
      listings: [
        {
          platform: { name: "Local classifieds" },
          priceCents: 15_000,
          title: "Stereo receiver, works great",
          description: "Tested with speakers.",
        },
      ],
    });

    // A second listing for the same unsold item goes on that item.
    const again = await body(
      await post({
        format: "hub-listing/v1",
        item: { title: "stereo RECEIVER" },
        listing: { platform: "Local classifieds", price: "$140" },
      }),
    );
    expect(again).toMatchObject({
      outcome: "listed",
      itemId: result.itemId,
      platformCreated: null,
      needsReview: false,
      problems: [],
      message: "Listed Stereo receiver on Local classifieds for $140.",
    });
    const listed = await body(await t.api.resale.items[":id"].$get(itemParam(result.itemId)));
    expect(listed.listings).toHaveLength(2);
    expect(await body(await t.api.resale.items.$get({ query: {} }))).toHaveLength(1);
  });

  it("flags a new item with missing details and skips a listing without a price", async () => {
    const result = await body(
      await post({ format: "hub-listing/v1", listing: { title: "Desk lamp", platform: "Shop" } }),
    );
    expect(result).toMatchObject({
      outcome: "created",
      needsReview: true,
      problems: ["No price paid.", "No purchase date.", "The listing has no price."],
      message: "Added Desk lamp. It's flagged to review.",
    });
    if (!result.itemId) throw new Error("Expected an item");
    const item = await body(await t.api.resale.items[":id"].$get(itemParam(result.itemId)));
    expect(item).toMatchObject({
      status: "acquired",
      listings: [],
      needsReview: true,
      reviewNote: "No price paid. No purchase date. The listing has no price.",
    });
  });

  it("explains a wrong format or a missing title", async () => {
    expect(await failure(await post({ ...example, format: "hub-listing/v2" }))).toMatchObject({
      status: 400,
      issues: [{ path: "format" }],
    });
    expect(
      await failure(await post({ format: "hub-listing/v1", purchase: { price: 5 } })),
    ).toMatchObject({
      status: 400,
      error: "Give the item a title, in item.title or listing.title.",
    });
  });
});
