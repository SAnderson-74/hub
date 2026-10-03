import { Link } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { secondaryButton } from "../../../client/components/ui";

/** Shown at a turned-off module's address. Its data is still there. */
export function ModuleOffPage({ label }: { label: string }) {
  return (
    <>
      <PageHeader title={label} />
      <Panel title={`${label} is off`}>
        <div className="space-y-4">
          <p className="text-muted">
            {label} is turned off, so it's hidden from the menu and the home screen. Anything in it
            is kept. Turn it back on in Settings to use it again.
          </p>
          <Link to="/settings" className={secondaryButton}>
            Open Settings
          </Link>
        </div>
      </Panel>
    </>
  );
}
