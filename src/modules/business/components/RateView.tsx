import { type FormEvent, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { inputClass, labelClass, primaryButton } from "../../../client/components/ui";
import { useSaveSettings } from "../../../client/lib/queries";
import { type BusinessRate, businessRateSchema, hourlyRate } from "../../../shared/businessRate";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";

type Draft = Record<keyof BusinessRate, string>;

const FIELDS: Array<{
  name: keyof BusinessRate;
  label: string;
  hint: string;
  money?: boolean;
  suffix?: string;
}> = [
  {
    name: "incomeCents",
    label: "Income to keep a year",
    hint: "What you want left after business costs and taxes.",
    money: true,
  },
  {
    name: "overheadCents",
    label: "Business costs a year",
    hint: "Insurance, software, gear, fees, and the like.",
    money: true,
  },
  {
    name: "taxPercent",
    label: "Set aside for taxes",
    hint: "A share of profit. The Taxes page can help you pick one.",
    suffix: "%",
  },
  {
    name: "hoursPerWeek",
    label: "Billable hours a week",
    hint: "Hours you can charge for, not every hour you work.",
  },
  { name: "weeksPerYear", label: "Working weeks a year", hint: "After holidays and time off." },
];

const toDraft = (rate: BusinessRate): Draft => ({
  incomeCents: centsToInput(rate.incomeCents),
  overheadCents: centsToInput(rate.overheadCents),
  taxPercent: String(rate.taxPercent),
  hoursPerWeek: String(rate.hoursPerWeek),
  weeksPerYear: String(rate.weeksPerYear),
});

const number = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/,/g, "")));

/** Draft text as rate inputs, with a message per field that doesn't fit. */
function parse(draft: Draft) {
  const candidate = {
    incomeCents: parseDollars(draft.incomeCents) ?? Number.NaN,
    overheadCents: parseDollars(draft.overheadCents) ?? Number.NaN,
    taxPercent: number(draft.taxPercent),
    hoursPerWeek: number(draft.hoursPerWeek),
    weeksPerYear: number(draft.weeksPerYear),
  };
  const result = businessRateSchema.safeParse(candidate);
  if (result.success) return { rate: result.data, problems: new Map<string, string>() };
  const problems = new Map<string, string>();
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    if (!problems.has(field)) {
      problems.set(
        field,
        Number.isNaN(candidate[field as keyof BusinessRate])
          ? FIELDS.find((item) => item.name === field)?.money
            ? "Use an amount like 50000."
            : "Enter a number."
          : issue.message,
      );
    }
  }
  return { rate: null, problems };
}

/** What to charge an hour to keep an income after costs and taxes. */
export function RateView({ saved }: { saved: BusinessRate }) {
  const ids = useId();
  const save = useSaveSettings();
  const [draft, setDraft] = useState(() => toDraft(saved));
  const [message, setMessage] = useState("");
  const { rate, problems } = parse(draft);
  const result = rate ? hourlyRate(rate) : null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!rate) return;
    save.mutate({ businessRate: rate }, { onSuccess: () => setMessage("Rate inputs saved") });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <Panel
        title="Your numbers"
        description="Change any of them to see the rate move."
        className="lg:col-span-7"
      >
        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => {
            const id = `${ids}-${field.name}`;
            const problem = problems.get(field.name);
            return (
              <div key={field.name} className="min-w-0">
                <label htmlFor={id} className={labelClass}>
                  {field.label}
                </label>
                <div className="relative">
                  {field.money ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
                    >
                      $
                    </span>
                  ) : null}
                  <input
                    id={id}
                    value={draft[field.name]}
                    onChange={(event) => {
                      setMessage("");
                      setDraft((current) => ({ ...current, [field.name]: event.target.value }));
                    }}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={`${id}-note`}
                    className={`${inputClass} tabular-nums ${field.money ? "pl-8" : ""} ${field.suffix ? "pr-9" : ""}`}
                  />
                  {field.suffix ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
                    >
                      {field.suffix}
                    </span>
                  ) : null}
                </div>
                <p
                  id={`${id}-note`}
                  className={`mt-1.5 text-sm ${problem ? "text-danger" : "text-muted"}`}
                >
                  {problem ?? field.hint}
                </p>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" className={primaryButton} disabled={!rate || save.isPending}>
              Save rate inputs
            </button>
            <p role="status" className="text-sm font-semibold text-ok">
              {message}
            </p>
          </div>
          {save.error ? (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {save.error.message}
            </p>
          ) : null}
        </form>
      </Panel>

      <Panel title="Your rate" className="lg:col-span-5">
        {result && rate ? (
          <div aria-live="polite">
            <p className="text-4xl font-bold tracking-[-0.02em] text-fg">
              {formatCents(result.hourlyCents)}
              <span className="text-lg font-semibold text-muted"> an hour</span>
            </p>
            <p className="mt-1 text-sm text-muted">The least to charge, rounded up to a dollar.</p>
            <dl className="mt-4 divide-y divide-surface-0 text-sm">
              {[
                [
                  `Billed in a year (${result.billableHours.toLocaleString("en-US")} hours)`,
                  result.revenueCents,
                ],
                ["Business costs", rate.overheadCents],
                [`Taxes at ${rate.taxPercent}% of profit`, result.taxCents],
                ["Left to keep", rate.incomeCents],
              ].map(([label, cents]) => (
                <div key={String(label)} className="flex justify-between gap-3 py-2">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold text-fg tabular-nums">
                    {formatCents(Number(cents))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted">
              Charging more leaves room for slow weeks and unpaid time like quotes and travel.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">Fix the highlighted numbers to see a rate.</p>
        )}
      </Panel>
    </div>
  );
}
