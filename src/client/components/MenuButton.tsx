import type { LucideIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { iconSecondaryButton } from "./ui";

export type MenuItem = { label: string; icon: LucideIcon; onSelect: () => void };

function itemButtons(menu: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
}

/**
 * An icon button that opens a short menu of related actions, like Import's "Import
 * a bank file" and "Paste receipts". Arrow keys move through the menu; Escape,
 * Tab, or a click outside closes it.
 */
export function MenuButton({
  label,
  icon: Icon,
  items,
  disabled = false,
  align = "end",
}: {
  /** The button's name, also shown as its tooltip. */
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
  disabled?: boolean;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    itemButtons(menu.current)[0]?.focus();
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && wrapper.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onMenuKey = (event: KeyboardEvent) => {
    const buttons = itemButtons(menu.current);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      buttons[(to + buttons.length) % buttons.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(buttons.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-tip=""
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`${iconSecondaryButton} ${open ? "bg-surface-1" : ""}`}
      >
        <Icon aria-hidden="true" className="size-[1.125rem]" />
      </button>
      {open ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className={`absolute top-full z-30 mt-1.5 min-w-48 rounded-tile bg-surface-0 p-1 ring-1 ring-surface-1 ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex h-10 w-full items-center gap-2.5 rounded-control px-3 text-left font-semibold whitespace-nowrap text-fg hover:bg-surface-1 focus-visible:outline-offset-[-2px]"
            >
              <item.icon aria-hidden="true" className="size-4 text-muted" />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
