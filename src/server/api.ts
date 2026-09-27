import { Hono } from "hono";
import { activityRoutes } from "../modules/core/activity.routes";
import { linkRoutes } from "../modules/core/links.routes";
import { settingsRoutes } from "../modules/core/settings.routes";
import { systemRoutes } from "../modules/core/system.routes";
import { tagRoutes } from "../modules/core/tags.routes";
import { educationRoutes } from "../modules/education/education.routes";
import { goalRoutes } from "../modules/goals/goals.routes";
import { resaleRoutes } from "../modules/resale/resale.routes";
import { projectRoutes } from "../modules/tasks/projects.routes";
import { taskRoutes } from "../modules/tasks/tasks.routes";
import { timeRoutes } from "../modules/time/time.routes";
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
    .route("/settings", settingsRoutes(deps))
    .route("/projects", projectRoutes(deps))
    .route("/tasks", taskRoutes(deps))
    .route("/tags", tagRoutes(deps))
    .route("/links", linkRoutes(deps))
    .route("/activity", activityRoutes(deps))
    .route("/time", timeRoutes(deps))
    .route("/goals", goalRoutes(deps))
    .route("/education", educationRoutes(deps))
    .route("/resale", resaleRoutes(deps));
}

export type Api = ReturnType<typeof createApi>;
