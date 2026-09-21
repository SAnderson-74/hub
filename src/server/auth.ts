import type { Context, MiddlewareHandler } from "hono";
import type { Config } from "./config";
import type { AppEnv } from "./env";

const LOGIN_HEADER = "tailscale-user-login";
const NAME_HEADER = "tailscale-user-name";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function deny(c: Context<AppEnv>, status: 401 | 403, message: string) {
  if (c.req.path.startsWith("/api/")) return c.json({ error: message }, status);
  return c.text(message, status);
}

/**
 * Decodes an RFC 2047 encoded-word ("=?utf-8?q?...?=" or "=?utf-8?b?...?="), which
 * Tailscale uses for names with non-ASCII characters. Anything else is returned as-is.
 */
export function decodeHeaderName(value: string | undefined): string {
  if (!value) return "";
  const match = /^=\?utf-8\?([qb])\?(.*)\?=$/i.exec(value.trim());
  if (!match?.[1] || match[2] === undefined) return value.trim();
  const [, encoding, text] = match;
  try {
    if (encoding.toLowerCase() === "b") return Buffer.from(text, "base64").toString("utf8");
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "_") bytes.push(0x20);
      else if (ch === "=" && /^[0-9a-f]{2}$/i.test(text.slice(i + 1, i + 3))) {
        bytes.push(Number.parseInt(text.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(text.charCodeAt(i));
    }
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return value.trim();
  }
}

/**
 * Identifies the person making each request.
 *
 * In production the app is reachable only through Tailscale Serve, which shares
 * this container's network and proxies to 127.0.0.1. Serve strips any identity
 * headers a client sends and adds its own for people (tagged devices get none),
 * so the headers can be trusted as long as the app listens on localhost only.
 */
export function identify(auth: Config["auth"]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (auth.mode === "dev") {
      c.set("user", { login: auth.devLogin, name: "John Smith" });
      return next();
    }
    const login = c.req.header(LOGIN_HEADER)?.trim().toLowerCase();
    if (!login) {
      return deny(c, 401, "Open this app through its Tailscale address to sign in.");
    }
    if (login !== auth.ownerLogin) {
      return deny(c, 403, "This Tailscale account doesn't have access to this app.");
    }
    c.set("user", { login, name: decodeHeaderName(c.req.header(NAME_HEADER)) || login });
    return next();
  };
}

/**
 * Blocks cross-site requests that change data. Identity comes from the network,
 * not a cookie, so without this a web page open on a tailnet device could submit
 * a form to the app on the owner's behalf.
 */
export function sameOriginWrites(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const blocked = () => c.json({ error: "Cross-site requests can't change data." }, 403);

    const site = c.req.header("sec-fetch-site");
    if (site !== undefined) {
      return site === "same-origin" || site === "none" ? next() : blocked();
    }
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      let originHost: string | undefined;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = undefined;
      }
      if (!host || originHost !== host) return blocked();
    }
    // No browser metadata at all means a non-browser client (curl, iOS Shortcuts),
    // which a web page can't impersonate.
    return next();
  };
}
