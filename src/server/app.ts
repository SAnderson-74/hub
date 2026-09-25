import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { createApi } from "./api";
import { identify, sameOriginWrites } from "./auth";
import type { Deps } from "./deps";
import type { AppEnv } from "./env";
import { errorFields, log } from "./log";

export function createApp(deps: Deps) {
  const { config } = deps;
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: "no-referrer",
    }),
  );

  // Unauthenticated liveness check for the container health check.
  app.get("/api/health", (c) => c.json({ ok: true, version: config.version }));

  app.use("*", identify(config.auth));
  app.use("/api/*", sameOriginWrites());
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: "That request is too large." }, 413),
    }),
  );
  app.route("/api", createApi(deps));
  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  if (config.staticDir) mountBrowserApp(app, config.staticDir);

  app.onError((error, c) => {
    // Expected failures, like a missing task or malformed JSON.
    if (error instanceof HTTPException) {
      return c.json({ error: error.message || "That request couldn't be handled." }, error.status);
    }
    log.error("Unhandled error", { method: c.req.method, path: c.req.path, ...errorFields(error) });
    return c.json({ error: "Something went wrong on the server. Check the app logs." }, 500);
  });

  return app;
}

/** Serves the built browser app. Hashed assets are cached forever; everything else is revalidated. */
function mountBrowserApp(app: Hono<AppEnv>, root: string) {
  const indexFile = join(root, "index.html");
  if (!existsSync(indexFile)) {
    throw new Error(`Built app not found at ${indexFile}. Run "npm run build" first.`);
  }
  const indexHtml = readFileSync(indexFile, "utf8");

  app.use(
    "*",
    serveStatic({
      root,
      onFound: (path, c) => {
        const immutable = path.includes("/assets/");
        c.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
      },
    }),
  );
  // Any other page is a client-side route.
  app.get("*", (c) => {
    c.header("Cache-Control", "no-cache");
    return c.html(indexHtml);
  });
}
