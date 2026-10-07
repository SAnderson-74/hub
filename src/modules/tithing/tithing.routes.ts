import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  incomeSetSchema,
  overviewQuerySchema,
  paymentCreateSchema,
  paymentSetSchema,
  tithingImportSchema,
} from "../../shared/tithing";
import { importTithing } from "./import.service";
import { clearPayment, createPayment, overview, setIncome, setPayment } from "./tithing.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));

/** Tithing: what's owed and paid, choices on money in, donations, and pasted imports. */
export function tithingRoutes({ db }: Deps) {
  return (
    new Hono<AppEnv>()
      .get(
        "/overview",
        zValidator("query", overviewQuerySchema, invalid("Pass the year like 2030.")),
        (c) => c.json(overview(db, c.req.valid("query").year)),
      )
      // Whether tithing applies to money in, and the amount it's figured on.
      .put(
        "/income/:id",
        idParam,
        zValidator("json", incomeSetSchema, invalid("That tithing choice isn't valid.")),
        (c) => {
          setIncome(db, c.req.valid("param").id, c.req.valid("json"));
          return c.body(null, 204);
        },
      )
      // Adds a donation as a new money-out transaction.
      .post(
        "/payments",
        zValidator("json", paymentCreateSchema, invalid("That payment isn't valid.")),
        (c) => c.json(createPayment(db, c.req.valid("json")), 201),
      )
      // Marks an existing money-out transaction as a donation, and links it to income.
      .put(
        "/payments/:id",
        idParam,
        zValidator("json", paymentSetSchema, invalid("That payment isn't valid.")),
        (c) => {
          setPayment(db, c.req.valid("param").id, c.req.valid("json"));
          return c.body(null, 204);
        },
      )
      .delete("/payments/:id", idParam, (c) => {
        clearPayment(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      // Donations and paychecks pasted from a Claude Project (hub-tithing/v1). Like every
      // route, behind Tailscale sign-in; the pasted text is checked field by field.
      .post(
        "/imports",
        zValidator(
          "query",
          z.object({ dryRun: z.enum(["true", "false"]).optional() }),
          invalid("Use dryRun=true to preview, or leave it out to import."),
        ),
        zValidator(
          "json",
          tithingImportSchema,
          invalid(
            "That doesn't fit the hub-tithing/v1 format. Copy the Claude Project's whole answer again.",
          ),
        ),
        (c) => {
          const dryRun = c.req.valid("query").dryRun === "true";
          return c.json(importTithing(db, c.req.valid("json"), dryRun), dryRun ? 200 : 201);
        },
      )
  );
}
