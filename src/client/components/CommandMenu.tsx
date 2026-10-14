import {
  Folder,
  GraduationCap,
  ListTodo,
  type LucideIcon,
  NotebookPen,
  Package,
  ReceiptText,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { formatShortDate, localDate } from "../../modules/tasks/dates";
import { formatSigned } from "../../shared/profit";
import { SEARCH_MIN_LENGTH, type SearchResult } from "../../shared/search";
import { type Command, matchCommands } from "../lib/commands";
import { useSearch } from "../lib/queries";
import { useNow } from "../lib/useNow";

const KIND_ICONS: Record<string, LucideIcon> = {
  task: ListTodo,
  project: Folder,
  goal: Target,
  course: GraduationCap,
  resale_item: Package,
  transaction: ReceiptText,
  lead: Users,
  business_note: NotebookPen,
};

type Option = {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  keys?: string[] | undefined;
  /** A path, or "help" for the list of shortcuts. */
  to: string;
};

type Section = { id: string; label: string; options: Option[]; more: boolean };

/** Typed commands shown at most, so search results stay in view. */
const COMMANDS_WHILE_TYPING = 5;

function commandOption(command: Command): Option {
  return {
    id: `command-${command.id}`,
    label: command.label,
    detail: "",
    icon: command.icon,
    keys: command.keys,
    to: command.to,
  };
}

function resultOption(kind: string, result: SearchResult, today: string): Option {
  const detail = [
    result.detail,
    result.date ? formatShortDate(result.date, today) : "",
    result.amountCents === null ? "" : formatSigned(result.amountCents),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `result-${kind}-${result.id}`,
    label: result.title,
    detail,
    icon: KIND_ICONS[kind] ?? Search,
    to: result.href,
  };
}

/** Waits until typing pauses, so each keystroke isn't a request. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * One box to search everything and run commands. A full-screen dialog on phones and
 * a panel near the top on wider screens. Arrow keys move through the list and Enter
 * opens the highlighted row (the combobox pattern).
 */
export function CommandMenu({
  open,
  onClose,
  commands,
  onShowShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  onShowShortcuts: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const navigate = useNavigate();
  const today = localDate(useNow());
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const settled = useDebounced(query, 150);
  const typed = query.trim();
  const searching = typed.length >= SEARCH_MIN_LENGTH;
  const search = useSearch(open && searching ? settled : "");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const sections: Section[] = [];
  if (!typed) {
    for (const group of ["Actions", "Pages"] as const) {
      const options = commands.filter((command) => command.group === group).map(commandOption);
      if (options.length > 0) sections.push({ id: group, label: group, options, more: false });
    }
  } else {
    const matched = matchCommands(commands, typed).slice(0, COMMANDS_WHILE_TYPING);
    if (matched.length > 0) {
      sections.push({
        id: "commands",
        label: "Commands",
        options: matched.map(commandOption),
        more: false,
      });
    }
    if (searching && search.data) {
      for (const group of search.data.groups) {
        sections.push({
          id: group.kind,
          label: group.label,
          options: group.results.map((result) => resultOption(group.kind, result, today)),
          more: group.more,
        });
      }
    }
  }
  const options = sections.flatMap((section) => section.options);
  const current = options[Math.min(active, options.length - 1)];
  const optionId = (option: Option) => `${ids}-${option.id}`;

  // A new search starts at the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets when the text changes
  useEffect(() => setActive(0), [typed]);

  // Keep the highlighted row in view as the arrow keys move it.
  useEffect(() => {
    if (!current) return;
    document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  });

  const choose = (option: Option) => {
    onClose();
    if (option.to === "help") onShowShortcuts();
    else navigate(option.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const from = Math.min(active, options.length - 1);
      setActive((from + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (current) choose(current);
    }
  };

  const busy = searching && (search.isFetching || settled.trim() !== typed);
  const status = !typed
    ? ""
    : search.isError && searching
      ? `Couldn't search: ${search.error.message}`
      : busy && options.length === 0
        ? "Searching…"
        : options.length === 0
          ? searching
            ? `Nothing matches “${typed}”. Try fewer words or check the spelling.`
            : "Type another letter to search everything."
          : !searching
            ? "Type another letter to search everything."
            : "";

  let index = -1;
  return (
    // Taps on the backdrop close it; Escape is the dialog's cancel event.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it from the keyboard.
    <dialog
      ref={ref}
      data-command-menu=""
      aria-label="Search and commands"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col overflow-hidden bg-mantle p-0 text-fg ring-1 ring-surface-0/60 backdrop:bg-crust/75 open:flex md:inset-x-0 md:top-[12dvh] md:bottom-auto md:mx-auto md:h-auto md:max-h-[70dvh] md:w-[36rem] md:rounded-panel"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-surface-0 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 md:pt-2">
        <Search aria-hidden="true" className="ml-2 size-5 shrink-0 text-muted" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search or run a command"
          aria-expanded={options.length > 0}
          aria-controls={`${ids}-list`}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(current) : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={100}
          placeholder="Search or type a command"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent px-2 text-fg placeholder:text-faint focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      <p role="status" className={status ? "shrink-0 px-5 py-4 text-sm text-muted" : "sr-only"}>
        {status}
      </p>
      <div
        id={`${ids}-list`}
        role="listbox"
        aria-label="Results"
        aria-busy={busy}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-2"
      >
        {sections.map((section) => (
          // A group of options inside a listbox; a fieldset would mean a form.
          // biome-ignore lint/a11y/useSemanticElements: listbox groups have no element
          <div key={section.id} role="group" aria-labelledby={`${ids}-${section.id}`}>
            <div
              id={`${ids}-${section.id}`}
              aria-hidden="true"
              className="px-3 pt-3 pb-1 text-sm font-semibold text-muted"
            >
              {section.label}
            </div>
            {section.options.map((option) => {
              index += 1;
              const position = index;
              const selected = current?.id === option.id;
              return (
                // The input keeps focus and moves the highlight; taps choose directly.
                // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox handles keys
                <div
                  key={option.id}
                  id={optionId(option)}
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  onClick={() => choose(option)}
                  onMouseMove={() => {
                    if (active !== position) setActive(position);
                  }}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3 py-2 ${
                    selected ? "bg-surface-0" : ""
                  }`}
                >
                  <option.icon
                    aria-hidden="true"
                    className={`size-5 shrink-0 ${selected ? "text-accent-text" : "text-muted"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">{option.label}</span>
                    {option.detail ? (
                      <span className="block truncate text-sm text-muted">{option.detail}</span>
                    ) : null}
                  </span>
                  {option.keys ? (
                    <span aria-hidden="true" className="hidden shrink-0 gap-1 md:flex">
                      {option.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded-control bg-base px-1.5 py-0.5 font-sans text-xs text-muted ring-1 ring-surface-1"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  ) : null}
                </div>
              );
            })}
            {section.more ? (
              <p aria-hidden="true" className="px-3 pt-1 pb-2 text-sm text-muted">
                More {section.label.toLowerCase()} match. Add a word to narrow it down.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </dialog>
  );
}
