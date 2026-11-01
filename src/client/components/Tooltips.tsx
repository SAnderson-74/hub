import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Tip = { label: string; hint: string; side: "right" | "bottom"; x: number; y: number };

const GAP = 8;

function place(anchor: HTMLElement): Tip | null {
  const label = anchor.getAttribute("aria-label");
  if (!label) return null;
  const rect = anchor.getBoundingClientRect();
  const side = anchor.dataset.tipSide === "right" ? "right" : "bottom";
  return side === "right"
    ? { label, hint: anchor.dataset.tip ?? "", side, x: rect.right, y: rect.top + rect.height / 2 }
    : {
        label,
        hint: anchor.dataset.tip ?? "",
        side,
        x: rect.left + rect.width / 2,
        y: rect.bottom,
      };
}

/** Whether the middle of the anchor is on screen and not scrolled out of its list. */
function inSight(anchor: HTMLElement): boolean {
  const rect = anchor.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return hit !== null && anchor.contains(hit);
}

/**
 * The name of an icon-only control, shown beside it. Controls opt in with
 * `data-tip` (its value, like a keyboard shortcut, shows after the name) and get
 * the name from their aria-label; `data-tip-side="right"` puts it to the right
 * instead of below. It shows on mouse hover and keyboard focus, stays while the
 * pointer moves onto it, and Escape, a click, or scrolling it out of sight hides it.
 * Screen readers already hear the aria-label, so this copy is hidden from them.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const find = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;
    const show = (element: HTMLElement) => {
      anchor.current = element;
      setTip(place(element));
    };
    const hide = () => {
      anchor.current = null;
      setTip(null);
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const element = find(event.target);
      if (element && element !== anchor.current) show(element);
    };
    const onOut = (event: PointerEvent) => {
      const element = find(event.target);
      if (!element || element !== anchor.current) return;
      const to = event.relatedTarget;
      if (to instanceof Node && (element.contains(to) || tipRef.current?.contains(to))) return;
      hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const element = find(event.target);
      if (element?.matches(":focus-visible")) show(element);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (find(event.target) === anchor.current) hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    // Focus scrolls an icon into view; the name follows it, and goes once it's hidden.
    const onScroll = () => {
      const element = anchor.current;
      if (!element) return;
      if (element.isConnected && inSight(element)) setTip(place(element));
      else hide();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // Keep a name that sits below its control inside the window.
  useLayoutEffect(() => {
    const element = tipRef.current;
    if (!element || tip?.side !== "bottom") return;
    const width = element.offsetWidth;
    const left = Math.min(Math.max(tip.x - width / 2, GAP), window.innerWidth - width - GAP);
    element.style.left = `${left}px`;
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={tipRef}
      aria-hidden="true"
      onPointerLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node && anchor.current?.contains(event.relatedTarget))
        ) {
          anchor.current = null;
          setTip(null);
        }
      }}
      style={{ top: tip.y, left: tip.x }}
      className={`fixed z-40 ${tip.side === "right" ? "-translate-y-1/2 pl-2" : "pt-1.5"}`}
    >
      <div className="flex items-center gap-2 rounded-full bg-surface-0 py-1.5 pr-1.5 pl-3 text-sm font-semibold whitespace-nowrap text-fg ring-1 ring-surface-1">
        {tip.label}
        {tip.hint ? (
          <span className="rounded-full bg-base px-2 py-0.5 text-xs text-muted">{tip.hint}</span>
        ) : (
          <span className="w-1.5" />
        )}
      </div>
    </div>
  );
}
