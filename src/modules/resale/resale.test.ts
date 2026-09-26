import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";

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
