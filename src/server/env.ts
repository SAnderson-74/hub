/** The person making the request, as identified by Tailscale (or the dev login). */
export type AuthUser = { login: string; name: string };

/** Hono context variables available to every route after authentication. */
export type AppEnv = { Variables: { user: AuthUser } };
