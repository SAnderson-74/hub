import { hc } from "hono/client";
import type { Api } from "../../server/api";

/** Typed API client. Paths and response shapes come straight from the server routes. */
export const api = hc<Api>("/api");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Builds an ApiError from a failed response, using the server's { error } message. */
export async function toApiError(response: {
  status: number;
  json(): Promise<unknown>;
}): Promise<ApiError> {
  let message = `The server responded with status ${response.status}.`;
  try {
    const body = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      message = body.error;
    }
  } catch {
    // Not JSON; keep the generic message.
  }
  return new ApiError(message, response.status);
}
