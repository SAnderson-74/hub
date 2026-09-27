import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  costCreateSchema,
  costUpdateSchema,
  itemCreateSchema,
  itemListQuerySchema,
  itemUpdateSchema,
  platformCreateSchema,
  platformUpdateSchema,
} from "../../shared/resale";
import {
  createCost,
  createItem,
  createPlatform,
  deleteCost,
  deleteItem,
  deletePlatform,
  getItem,
  listItems,
  listPlatforms,
  updateCost,
  updateItem,
  updatePlatform,
} from "./resale.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));

/** Resale items, their costs, and the platforms they're bought and sold on. Platform writes answer with every platform. */
export function resaleRoutes({ db }: Deps) {
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
      c.json(createItem(db, c.req.valid("json"), c.get("user").login), 201),
    )
    .get("/items/:id", idParam, (c) => c.json(getItem(db, c.req.valid("param").id)))
    .patch(
      "/items/:id",
      idParam,
      zValidator("json", itemUpdateSchema, invalid("Those item changes aren't valid.")),
      (c) =>
        c.json(updateItem(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login)),
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
    );
}
