import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

// Undo after deleting: the thing leaves the lists at once, but the delete is only sent
// after a few seconds. Undo in that time cancels it, so nothing is lost and nothing has
// to be rebuilt. If the page closes or goes to the background first, the delete is sent
// right away. One at a time: a second delete sends the first.

/** How long Undo stays, unless the bar is hovered or focused. */
export const UNDO_MS = 6_000;
/** How long "Restored" or an error stays. */
const NOTICE_MS = 4_000;

export type LaterDelete = {
  /** What the bar says, like "Deleted Buy milk". */
  message: string;
  /** Said after Undo, like "Restored Buy milk". */
  restoredMessage: string;
  /** The queries it shows in (by key prefix), and how to take it out of each one's data. */
  hide: { keys: QueryKey[]; remove: (data: unknown, key: QueryKey) => unknown };
  /** Sends the delete. Its own success refreshes the lists. */
  commit: () => Promise<unknown>;
  /** Sends the delete as the page closes, so the browser finishes it after. */
  flush: () => void;
};

type Active = LaterDelete & {
  stopHiding: () => void;
  putBack: () => void;
  timer: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
};

export type UndoState =
  | { kind: "idle" }
  | { kind: "pending"; message: string }
  | { kind: "notice"; message: string; error: boolean };

let active: Active | null = null;
let state: UndoState = { kind: "idle" };
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: UndoState) {
  state = next;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = next.kind === "notice" ? setTimeout(() => set({ kind: "idle" }), NOTICE_MS) : null;
  for (const listener of listeners) listener();
}

const startsWith = (key: QueryKey, prefix: QueryKey) =>
  prefix.every((part, index) => JSON.stringify(part) === JSON.stringify(key[index]));

/**
 * Takes the thing out of every matching query now, and again whenever one refetches
 * while the delete waits (the server still has it then).
 */
function hideIn(queryClient: QueryClient, hide: LaterDelete["hide"]) {
  for (const key of hide.keys) void queryClient.cancelQueries({ queryKey: key });
  const saved = hide.keys.flatMap((key) => queryClient.getQueriesData({ queryKey: key }));
  const apply = (key: QueryKey) =>
    queryClient.setQueryData(key, (data: unknown) =>
      data === undefined ? data : hide.remove(data, key),
    );
  for (const [key] of saved) apply(key);
  const stopHiding = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success" || event.action.manual) return;
    if (!hide.keys.some((prefix) => startsWith(event.query.queryKey, prefix))) return;
    apply(event.query.queryKey);
  });
  const putBack = () => {
    stopHiding();
    for (const [key, data] of saved) queryClient.setQueryData(key, data);
    for (const key of hide.keys) void queryClient.invalidateQueries({ queryKey: key });
  };
  return { stopHiding, putBack };
}

function run(item: Active) {
  item.startedAt = Date.now();
  item.timer = setTimeout(() => send(item), item.remaining);
}

function stop(item: Active) {
  if (item.timer) clearTimeout(item.timer);
  item.timer = null;
  if (active === item) active = null;
}

/** Sends a waiting delete now. On failure, it comes back and the bar says why. */
function send(item: Active) {
  stop(item);
  if (state.kind === "pending") set({ kind: "idle" });
  item.commit().then(
    () => item.stopHiding(),
    (error: unknown) => {
      item.putBack();
      set({
        kind: "notice",
        error: true,
        message: `${item.message.replace(/^Deleted/, "Couldn't delete")}. ${
          error instanceof Error ? error.message : "Try again."
        }`,
      });
    },
  );
}

/** Hides the thing now and deletes it after a few seconds, unless Undo is pressed. */
export function deleteLater(queryClient: QueryClient, request: LaterDelete) {
  if (active) send(active);
  const { stopHiding, putBack } = hideIn(queryClient, request.hide);
  active = { ...request, stopHiding, putBack, timer: null, remaining: UNDO_MS, startedAt: 0 };
  run(active);
  set({ kind: "pending", message: request.message });
}

/** Cancels the waiting delete and puts the thing back. */
export function undoDelete() {
  const item = active;
  if (!item) return;
  stop(item);
  item.putBack();
  set({ kind: "notice", error: false, message: item.restoredMessage });
}

/** Holds the countdown while the bar is hovered or focused, so there's time to read and reach it. */
export function pauseUndo() {
  if (!active?.timer) return;
  clearTimeout(active.timer);
  active.timer = null;
  active.remaining = Math.max(1_000, active.remaining - (Date.now() - active.startedAt));
}

export function resumeUndo() {
  if (active && !active.timer) run(active);
}

/** Sends a waiting delete as the page closes or is put away. */
export function flushDelete() {
  const item = active;
  if (!item) return;
  stop(item);
  item.stopHiding();
  item.flush();
  set({ kind: "idle" });
}

export function useUndo(): UndoState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
