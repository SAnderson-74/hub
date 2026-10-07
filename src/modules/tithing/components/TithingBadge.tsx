import { StatusDot, type Tone } from "../../../client/components/StatusDot";
import { formatCents } from "../../../shared/money";
import { STATUS_LABELS, type TithingStatus } from "../../../shared/tithing";

/** Red until the tithing is paid, amber while partly paid, green once it is. */
export const STATUS_TONE: Record<TithingStatus, Tone> = {
  unpaid: "danger",
  partial: "warn",
  paid: "ok",
};

const TEXT_CLASS: Record<TithingStatus, string> = {
  unpaid: "text-danger",
  partial: "text-warn",
  paid: "text-ok",
};

/** "Not paid, $200 owed", "Partly paid, $50 left", or "Paid". */
export function statusText(status: TithingStatus, owedCents: number, paidCents: number): string {
  if (status === "unpaid") return `${STATUS_LABELS.unpaid}, ${formatCents(owedCents)} owed`;
  if (status === "partial") {
    return `${STATUS_LABELS.partial}, ${formatCents(owedCents - paidCents)} left`;
  }
  return STATUS_LABELS.paid;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** A status light and the words for it, so color never says it alone. */
export function TithingBadge({
  status,
  owedCents,
  paidCents,
  prefix = "Tithing",
}: {
  status: TithingStatus;
  owedCents: number;
  paidCents: number;
  /** What it's the status of: "Tithing" in lists, empty where the context says it. */
  prefix?: string;
}) {
  const text = statusText(status, owedCents, paidCents);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-semibold ${TEXT_CLASS[status]}`}
    >
      <StatusDot tone={STATUS_TONE[status]} />
      <span>{prefix ? `${prefix}: ${lowerFirst(text)}` : text}</span>
    </span>
  );
}
