import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { localDateParts } from "../../server/db/backup";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  costCreateSchema,
  costUpdateSchema,
  itemCreateSchema,
  itemListQuerySchema,
  itemUpdateSchema,
  listingCreateSchema,
  listingUpdateSchema,
  platformCreateSchema,
  platformUpdateSchema,
  priceChangeSchema,
} from "../../shared/resale";
import { resaleImportSchema } from "../../shared/resaleImport";
import {
  changePrice,
  createCost,
  createItem,
  createListing,
  createPlatform,
  deleteCost,
  deleteItem,
  deleteListing,
  deletePlatform,
  getItem,
  importResale,
  listItems,
  listPlatforms,
  updateCost,
  updateItem,
  updateListing,
  updatePlatform,
} from "./resale.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));

/** Resale items, their costs, and the platforms they're bought and sold on. Platform writes answer with every platform. */
export function resaleRoutes({ db, config }: Deps) {
  // "Today" for dating sales, listings, and price changes, in the owner's time zone.
  const today = () => localDateParts(new Date(), config.timeZone).date;
  return new Hono<AppEnv>()
    .get("/platforms", (c) => c.json(listPlatforms(db)))
    .post(
      "/platforms",
      zValidator("json", platformCreateSchema, invalid("That platform isn't valid.")),
      (c) => c.json(createPlatform(db, c.req.valid("json")), 201),
    )
    .patch(
      "/platforms/:id",
      idParam,
      zValidator("json", platformUpdateSchema, invalid("Those platform changes aren't valid.")),
      (c) => c.json(updatePlatform(db, c.req.valid("param").id, c.req.valid("json"))),
    )
    .delete("/platforms/:id", idParam, (c) => c.json(deletePlatform(db, c.req.valid("param").id)))
    .get(
      "/items",
      zValidator("query", itemListQuerySchema, invalid("Those filters aren't valid.")),
      (c) => c.json(listItems(db, c.req.valid("query"))),
    )
    .post("/items", zValidator("json", itemCreateSchema, invalid("That item isn't valid.")), (c) =>
      c.json(createItem(db, c.req.valid("json"), c.get("user").login, today()), 201),
    )
    .get("/items/:id", idParam, (c) => c.json(getItem(db, c.req.valid("param").id)))
    .patch(
      "/items/:id",
      idParam,
      zValidator("json", itemUpdateSchema, invalid("Those item changes aren't valid.")),
      (c) =>
        c.json(
          updateItem(
            db,
            c.req.valid("param").id,
            c.req.valid("json"),
            c.get("user").login,
            today(),
          ),
        ),
    )
    .delete("/items/:id", idParam, (c) => {
      deleteItem(db, c.req.valid("param").id, c.get("user").login);
      return c.body(null, 204);
    })
    .post(
      "/items/:id/costs",
      idParam,
      zValidator("json", costCreateSchema, invalid("That cost isn't valid.")),
      (c) =>
        c.json(
          createCost(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login),
          201,
        ),
    )
    .patch(
      "/costs/:id",
      idParam,
      zValidator("json", costUpdateSchema, invalid("Those cost changes aren't valid.")),
      (c) =>
        c.json(updateCost(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login)),
    )
    .delete("/costs/:id", idParam, (c) =>
      c.json(deleteCost(db, c.req.valid("param").id, c.get("user").login)),
    )
    .post(
      "/items/:id/listings",
      idParam,
      zValidator("json", listingCreateSchema, invalid("That listing isn't valid.")),
      (c) =>
        c.json(
          createListing(
            db,
            c.req.valid("param").id,
            c.req.valid("json"),
            c.get("user").login,
            today(),
          ),
          201,
        ),
    )
    .patch(
      "/listings/:id",
      idParam,
      zValidator("json", listingUpdateSchema, invalid("Those listing changes aren't valid.")),
      (c) =>
        c.json(
          updateListing(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login),
        ),
    )
    .post(
      "/listings/:id/prices",
      idParam,
      zValidator("json", priceChangeSchema, invalid("That price isn't valid.")),
      (c) =>
        c.json(
          changePrice(
            db,
            c.req.valid("param").id,
            c.req.valid("json"),
            c.get("user").login,
            today(),
          ),
          201,
        ),
    )
    .delete("/listings/:id", idParam, (c) =>
      c.json(deleteListing(db, c.req.valid("param").id, c.get("user").login)),
    )
    .post(
      "/import",
      zValidator(
        "query",
        z.object({ dryRun: z.enum(["true", "false"]).optional() }),
        invalid("Use dryRun=true to preview, or leave it out to import."),
      ),
      zValidator("json", resaleImportSchema, invalid("That file can't be imported.")),
      (c) =>
        c.json(
          importResale(
            db,
            c.req.valid("json").rows,
            c.get("user").login,
            c.req.valid("query").dryRun === "true",
          ),
        ),
    );
}
