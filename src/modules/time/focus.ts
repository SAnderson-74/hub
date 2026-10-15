// The focus timer's state, kept in this browser so a block survives a reload or a
// locked phone. A finished work block becomes a time entry; breaks aren't logged.

export const WORK_CHOICES = [15, 25, 45, 50, 60, 90] as const;
export const BREAK_CHOICES = [5, 10, 15] as const;

export type FocusState = {
  phase: "work" | "break" | "ready";
  /** When this phase started and ends, in milliseconds. */
  startedAt: number;
  endsAt: number;
  workMinutes: number;
  breakMinutes: number;
  /** "task:12", or "" for nothing in particular. */
  subject: string;
  /** Work blocks finished in this session. */
  rounds: number;
};

const KEY = "hub.focus";

export function loadFocus(): FocusState | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as FocusState | null;
    return value && typeof value.endsAt === "number" && typeof value.phase === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function saveFocus(state: FocusState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing: the timer still runs for this visit.
  }
}

/** "24:59" */
export function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A work block that started at `startedAt`, as a time entry's start and end. */
export function blockEntry(startedAt: number, endedAt: number) {
  return { startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString() };
}
