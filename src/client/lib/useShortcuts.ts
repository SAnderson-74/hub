import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import type { AppPage } from "../pages";
import { isTyping } from "./commands";

/** How long after G the second key still counts. */
const SECOND_KEY_MS = 1500;

/**
 * Keyboard shortcuts for every page: Ctrl+K or ⌘K toggles the command menu, / opens
 * it, ? lists the shortcuts, and G then a page's key goes there. None of them fire
 * while typing in a field or while another sheet is open.
 */
export function useShortcuts({
  pages,
  onToggleMenu,
  onOpenMenu,
  onShowShortcuts,
}: {
  pages: AppPage[];
  onToggleMenu: () => void;
  onOpenMenu: () => void;
  onShowShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const latest = useRef({ pages, onToggleMenu, onOpenMenu, onShowShortcuts, navigate });
  latest.current = { pages, onToggleMenu, onOpenMenu, onShowShortcuts, navigate };

  useEffect(() => {
    let pressedG = 0;
    const otherDialogOpen = () => document.querySelector("dialog[open]:not([data-command-menu])");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const handlers = latest.current;
      const key = event.key.toLowerCase();
      if (key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        if (otherDialogOpen()) return;
        event.preventDefault();
        handlers.onToggleMenu();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector("dialog[open]")) {
        pressedG = 0;
        return;
      }

      if (pressedG && event.timeStamp - pressedG < SECOND_KEY_MS) {
        pressedG = 0;
        const page = handlers.pages.find((item) => item.key === key);
        if (page) {
          event.preventDefault();
          handlers.navigate(page.path);
        }
        return;
      }
      pressedG = 0;
      if (key === "g" && !event.shiftKey) {
        pressedG = event.timeStamp;
      } else if (event.key === "/") {
        event.preventDefault();
        handlers.onOpenMenu();
      } else if (event.key === "?") {
        event.preventDefault();
        handlers.onShowShortcuts();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
