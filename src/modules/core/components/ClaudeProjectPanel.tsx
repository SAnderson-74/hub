import { Copy } from "lucide-react";
import { useId, useRef, useState } from "react";
import { primaryButton, textareaClass } from "../../../client/components/ui";
import {
  PROJECT_FORMATS,
  PROJECT_INSTRUCTIONS,
  PROJECT_INSTRUCTIONS_VERSION,
} from "../../../shared/claudeProject";

/** The Claude Project's instructions, to copy into the Project. */
export function ClaudeProjectPanel() {
  const ids = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"" | "copied" | "select">("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROJECT_INSTRUCTIONS);
      setStatus("copied");
    } catch {
      // Copying needs a secure page and permission. Without them, select the text.
      box.current?.focus();
      box.current?.select();
      setStatus("select");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-muted">What it reads for Hub</p>
        <ul className="flex flex-wrap gap-2">
          {PROJECT_FORMATS.map((entry) => (
            <li
              key={entry.format}
              className="rounded-full bg-surface-0 px-3 py-1.5 text-sm text-fg"
            >
              {entry.label} <span className="text-muted">into {entry.into}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label htmlFor={`${ids}-text`} className="mb-1.5 block text-sm font-semibold text-muted">
          Instructions, version {PROJECT_INSTRUCTIONS_VERSION}
        </label>
        <textarea
          id={`${ids}-text`}
          ref={box}
          readOnly
          value={PROJECT_INSTRUCTIONS}
          rows={10}
          spellCheck={false}
          className={`${textareaClass} font-mono text-xs`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} onClick={() => void copy()}>
          <Copy aria-hidden="true" className="size-4" />
          Copy instructions
        </button>
        <p role="status" className="text-sm font-semibold text-ok">
          {status === "copied" ? "Instructions copied" : ""}
        </p>
      </div>
      {status === "select" ? (
        <p role="alert" className="text-sm text-warn">
          This browser didn't allow copying. The instructions are selected, so copy them from your
          device's menu.
        </p>
      ) : null}
      <p className="text-sm text-muted">
        In the Claude app, make a Project, then paste these as its instructions. When the version
        here goes up, Hub has learned something new: copy them again and replace the old ones. Then
        paste the Project's answers in Paste from Claude under Imports.
      </p>
    </div>
  );
}
