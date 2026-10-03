import { type FormEvent, useId, useState } from "react";
import { ghostButton, primaryButton, secondaryButton } from "../../../client/components/ui";
import { useRemoveDemo, useSaveSettings, useSetup } from "../../../client/lib/queries";
import type { ModuleSettings } from "../../../shared/modules";
import { ModuleChoices } from "./ModuleChoices";
import { TimeZoneSelect } from "./TimeZoneSelect";

/** Which modules show, Hub's time zone, and removing example data. */
export function ModulesPanel({ saved }: { saved: { modules: ModuleSettings; timeZone: string } }) {
  const ids = useId();
  const save = useSaveSettings();
  const setup = useSetup();
  const removeDemo = useRemoveDemo();
  const [modules, setModules] = useState(saved.modules);
  const [timeZone, setTimeZone] = useState(saved.timeZone);
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dirty =
    JSON.stringify(modules) !== JSON.stringify(saved.modules) || timeZone !== saved.timeZone;
  const serverTimeZone = setup.data?.serverTimeZone ?? "UTC";

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { modules, timeZone },
      { onSuccess: () => setMessage("Modules and time zone saved") },
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSave} className="space-y-5">
        <ModuleChoices
          value={modules}
          onChange={(next) => {
            setModules(next);
            setMessage("");
          }}
          legend="Modules"
        />
        <p className="text-sm text-muted">
          A module that's off leaves the menu and the home screen. Its data stays, and comes back
          when it's turned on.
        </p>
        <div>
          <label htmlFor={`${ids}-zone`} className="mb-1.5 block text-sm font-semibold text-muted">
            Time zone
          </label>
          <TimeZoneSelect
            id={`${ids}-zone`}
            value={timeZone}
            serverTimeZone={serverTimeZone}
            onChange={(zone) => {
              setTimeZone(zone);
              setMessage("");
            }}
            describedBy={`${ids}-zone-hint`}
          />
          <p id={`${ids}-zone-hint`} className="mt-1.5 text-sm text-muted">
            Used for what counts as today, the study streak, reminders, and nightly backups.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : "Save modules and time zone"}
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {save.isError ? (
          <p role="alert" className="text-sm text-danger">
            {save.error.message}
          </p>
        ) : null}
      </form>

      {setup.data?.demo ? (
        <div className="space-y-3 border-t border-surface-0/70 pt-4">
          <p className="font-semibold text-fg">Example data</p>
          <p className="text-sm text-muted">
            Hub has the example tasks, goals, course, items, budget, and business steps from setup.
          </p>
          {confirmRemove ? (
            <div className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
              <p className="text-sm text-fg">
                Remove the example data? Anything you added to it, like a transaction in the example
                account, stays along with what holds it.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={removeDemo.isPending}
                  onClick={() =>
                    removeDemo.mutate(undefined, {
                      onSuccess: ({ kept }) => {
                        setConfirmRemove(false);
                        setMessage(
                          kept > 0
                            ? `Example data removed, except ${kept} ${kept === 1 ? "thing" : "things"} you'd added to`
                            : "Example data removed",
                        );
                      },
                    })
                  }
                >
                  Remove example data
                </button>
                <button
                  type="button"
                  className={ghostButton}
                  onClick={() => setConfirmRemove(false)}
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setConfirmRemove(true)}
            >
              Remove example data
            </button>
          )}
          {removeDemo.isError ? (
            <p role="alert" className="text-sm text-danger">
              {removeDemo.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
