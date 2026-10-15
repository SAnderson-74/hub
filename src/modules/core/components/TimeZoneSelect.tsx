import { inputClass } from "../../../client/components/ui";
import { timeZoneLabel, timeZoneOptions } from "../../../client/lib/timeZones";

/** Time zones, with "" standing for the server's own. */
export function TimeZoneSelect({
  id,
  value,
  serverTimeZone,
  onChange,
  describedBy,
}: {
  id: string;
  value: string;
  serverTimeZone: string;
  onChange: (zone: string) => void;
  describedBy?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-describedby={describedBy}
      className={inputClass}
    >
      <option value="">Server's time zone ({timeZoneLabel(serverTimeZone)})</option>
      {timeZoneOptions(value, serverTimeZone).map((zone) => (
        <option key={zone} value={zone}>
          {timeZoneLabel(zone)}
        </option>
      ))}
    </select>
  );
}
