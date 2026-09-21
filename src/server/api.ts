import { Hono } from "hono";
import { settingsRoutes } from "../modules/core/settings.routes";
import { systemRoutes } from "../modules/core/system.routes";
import type { Deps } from "./deps";
import type { AppEnv } from "./env";

/**
 * Every API route, mounted under /api. Chaining keeps the full type available to
 * the browser client (see src/client/lib/api.ts). Register a new module's routes
 * with one more .route() line.
 */
export function createApi(deps: Deps) {
  return new Hono<AppEnv>()
    .get("/me", (c) => c.json(c.get("user")))
    .route("/system", systemRoutes(deps))
    .route("/settings", settingsRoutes(deps));
}

export type Api = ReturnType<typeof createApi>;
