import { ArrowRight } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { BrandMark } from "../../../client/components/BrandMark";
import { primaryButton } from "../../../client/components/ui";
import { useFinishSetup } from "../../../client/lib/queries";
import { browserTimeZone, timeZoneOptions } from "../../../client/lib/timeZones";
import { defaultModules, type ModuleSettings } from "../../../shared/modules";
import { ModuleChoices } from "../components/ModuleChoices";
import { TimeZoneSelect } from "../components/TimeZoneSelect";

/**
 * First-run setup on a new, empty install: which modules to use, the time zone, and
 * whether to start with example data. Everything can be changed later in Settings.
 */
export function SetupPage({ serverTimeZone }: { serverTimeZone: string }) {
  const ids = useId();
  const finish = useFinishSetup();
  const [modules, setModules] = useState<ModuleSettings>(defaultModules);
  // The browser's time zone, when it differs from the server's.
  const [timeZone, setTimeZone] = useState(() => {
    const local = browserTimeZone();
    return local && local !== serverTimeZone && timeZoneOptions().includes(local) ? local : "";
  });
  const [demo, setDemo] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    finish.mutate({ modules, timeZone, demo });
  };

  return (
    <main className="min-h-dvh bg-base px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pt-16">
      <form onSubmit={onSubmit} className="mx-auto w-full max-w-2xl space-y-8">
        <header className="space-y-4">
          <BrandMark className="size-12" />
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.02em] text-fg">Welcome to Hub</h1>
            <p className="mt-2 text-muted">
              Pick what you'll use it for. You can change all of this later in Settings.
            </p>
          </div>
        </header>

        <section className="space-y-3 rounded-panel bg-mantle p-5 ring-1 ring-surface-0/60 md:p-6">
          <ModuleChoices value={modules} onChange={setModules} legend="Modules" />
          <p className="text-sm text-muted">Home and Settings are always there.</p>
        </section>

        <section className="space-y-3 rounded-panel bg-mantle p-5 ring-1 ring-surface-0/60 md:p-6">
          <label htmlFor={`${ids}-zone`} className="block text-sm font-semibold text-muted">
            Time zone
          </label>
          <TimeZoneSelect
            id={`${ids}-zone`}
            value={timeZone}
            serverTimeZone={serverTimeZone}
            onChange={setTimeZone}
            describedBy={`${ids}-zone-hint`}
          />
          <p id={`${ids}-zone-hint`} className="text-sm text-muted">
            Used for what counts as today, the study streak, reminders, and nightly backups.
          </p>
        </section>

        <section className="rounded-panel bg-mantle p-5 ring-1 ring-surface-0/60 md:p-6">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={demo}
              onChange={(event) => setDemo(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-accent"
            />
            <span>
              <span className="block font-semibold text-fg">Start with example data</span>
              <span className="block text-sm text-muted">
                Tasks, goals, a course, resale items, a budget, and business steps with made-up
                names, to try things out. Remove them any time in Settings.
              </span>
            </span>
          </label>
        </section>

        <div className="space-y-3">
          <button type="submit" className={primaryButton} disabled={finish.isPending}>
            {finish.isPending ? "Setting up…" : "Start using Hub"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
          {finish.isError ? (
            <p role="alert" className="text-sm text-danger">
              {finish.error.message}
            </p>
          ) : null}
        </div>
      </form>
    </main>
  );
}
