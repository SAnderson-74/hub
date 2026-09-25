import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

type SheetProps = {
  open: boolean;
  /** Called for the close button, Escape, and taps outside the sheet. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** "drawer" docks to the right on wide screens; "dialog" is a small centered box. */
  variant?: "drawer" | "dialog";
  children: ReactNode;
};

const variants = {
  drawer:
    "md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-dvh md:w-[30rem] md:rounded-none md:rounded-l-panel",
  dialog: "md:inset-0 md:m-auto md:h-fit md:max-h-[85dvh] md:w-[28rem] md:rounded-panel",
};

/**
 * A modal sheet built on <dialog>: it rises from the bottom on phones and sits at the
 * side (or center) on wider screens. The browser handles focus and Escape.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  variant = "drawer",
  children,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // The dialog itself is only ever the click target for taps on the backdrop,
    // because its content fills it. Keyboard users close it with Escape or the button.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled by the dialog's cancel event.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-panel bg-mantle p-0 text-fg ring-1 ring-surface-0/60 backdrop:bg-crust/75 open:flex ${variants[variant]}`}
    >
      <div className="flex items-start gap-3 px-5 pt-5 pb-3 md:px-6 md:pt-6">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold tracking-[-0.01em] break-words">
            {title}
          </h2>
          {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:px-6">
        {children}
      </div>
    </dialog>
  );
}
