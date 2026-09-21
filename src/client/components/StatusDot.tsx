export type Tone = "ok" | "warn" | "danger" | "accent" | "idle";

const toneClass: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  accent: "text-accent",
  idle: "text-faint",
};

export const toneLabel: Record<Tone, string> = {
  ok: "Healthy",
  warn: "Needs attention",
  danger: "Problem",
  accent: "Info",
  idle: "Inactive",
};

/** Decorative status light. Always pair it with text that says the same thing. */
export function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={`led inline-block size-2.5 shrink-0 rounded-full bg-current ${toneClass[tone]}`}
    />
  );
}
