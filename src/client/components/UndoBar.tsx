import { useEffect } from "react";
import { flushDelete, pauseUndo, resumeUndo, undoDelete, useUndo } from "../lib/undo";

/**
 * "Deleted Buy milk · Undo" for a few seconds after a delete, above the phone tab bar.
 * Ctrl+Z or ⌘Z undoes too, outside text fields. The countdown holds while the mouse is
 * over it or it has focus.
 */
export function UndoBar() {
  const undo = useUndo();
  const pending = undo.kind === "pending";

  // The delete goes out before the page closes or is put away, so it isn't lost.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushDelete();
    };
    window.addEventListener("pagehide", flushDelete);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushDelete);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey)) return;
      if (event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      undoDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-30 flex justify-center px-4 md:bottom-6 md:pl-16">
      {/* Always there, so a screen reader hears each new message. */}
      <div role="status" className="w-full max-w-md">
        {undo.kind === "idle" ? null : (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only pause the countdown
          <div
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") pauseUndo();
            }}
            onPointerLeave={resumeUndo}
            onFocus={pauseUndo}
            onBlur={resumeUndo}
            className="pointer-events-auto flex w-full items-center gap-3 rounded-tile bg-surface-0 py-2 pr-2 pl-4 ring-1 ring-surface-1"
          >
            <p
              className={`min-w-0 flex-1 py-2 text-sm font-semibold break-words ${
                undo.kind === "notice" && undo.error ? "text-danger" : "text-fg"
              }`}
            >
              {undo.message}
            </p>
            {pending ? (
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center rounded-full px-4 font-bold text-accent-text hover:bg-surface-1"
                onClick={undoDelete}
              >
                Undo
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
