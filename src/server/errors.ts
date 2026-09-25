import { HTTPException } from "hono/http-exception";

// Services throw these; the app turns them into { error } responses (see app.ts).
// Messages say what happened and what to do next.

export function notFound(message: string) {
  return new HTTPException(404, { message });
}

export function badRequest(message: string) {
  return new HTTPException(400, { message });
}

export function conflict(message: string) {
  return new HTTPException(409, { message });
}
