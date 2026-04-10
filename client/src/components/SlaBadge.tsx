import { type SlaStatus, slaStatusLabel } from "core/constants/sla-status.ts";

// ─── Duration formatter ────────────────────────────────────────────────────

/**
 * Format an absolute number of minutes into "Xh Ym" or "Ym".
 */
export function formatDuration(totalMinutes: number): string {
  const abs = Math.abs(Math.round(totalMinutes));
  if (abs < 60) return `${abs}m`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Status styles ─────────────────────────────────────────────────────────

const statusStyles: Record<SlaStatus, string> = {
  on_track:  "bg-green-500/15 text-green-600",
  at_risk:   "bg-amber-500/15 text-amber-600",
  breached:  "bg-red-500/15 text-red-500",
  paused:    "bg-blue-500/15 text-blue-500",
  completed: "bg-muted text-muted-foreground",
};

// ─── Components ────────────────────────────────────────────────────────────

interface SlaBadgeProps {
  status: SlaStatus;
}

/** Compact coloured pill — for use in table cells and other tight spaces. */
export function SlaBadge({ status }: SlaBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {slaStatusLabel[status]}
    </span>
  );
}

interface SlaCountdownProps {
  status: SlaStatus;
  minutesUntilBreach: number | null;
}

/**
 * One-line SLA summary: badge + human-readable time remaining/overdue.
 * Used in the ticket list column.
 */
export function SlaCountdown({ status, minutesUntilBreach }: SlaCountdownProps) {
  let label: string | null = null;

  if (status === "completed") {
    label = "SLA met";
  } else if (minutesUntilBreach !== null) {
    if (minutesUntilBreach < 0) {
      label = `Overdue ${formatDuration(minutesUntilBreach)}`;
    } else {
      label = `Due in ${formatDuration(minutesUntilBreach)}`;
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <SlaBadge status={status} />
      {label && (
        <span className="text-[11px] text-muted-foreground pl-0.5">{label}</span>
      )}
    </div>
  );
}

interface SlaDeadlineRowProps {
  label: string;
  dueAt: string | null;
  respondedAt: string | null;
}

/**
 * A single SLA milestone row for the ticket detail panel.
 * Shows due time, actual time (if met), and breach status.
 */
export function SlaDeadlineRow({ label, dueAt, respondedAt }: SlaDeadlineRowProps) {
  if (!dueAt) return null;

  const due = new Date(dueAt);
  const actual = respondedAt ? new Date(respondedAt) : null;
  const now = new Date();
  const isMet = actual != null;
  const isBreached = !isMet && now > due;
  const minutesLeft = Math.round((due.getTime() - now.getTime()) / 60_000);

  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground font-medium w-36 shrink-0">{label}</span>
      <div className="text-right">
        {isMet ? (
          <span className="text-green-600 font-medium">
            ✓ {actual!.toLocaleString()}
            <span className="text-muted-foreground font-normal ml-1">
              (due {due.toLocaleString()})
            </span>
          </span>
        ) : isBreached ? (
          <span className="text-red-500 font-medium">
            Overdue {formatDuration(minutesLeft)}{" "}
            <span className="text-muted-foreground font-normal">
              (was due {due.toLocaleString()})
            </span>
          </span>
        ) : (
          <span>
            <span className="font-medium">Due {due.toLocaleString()}</span>
            <span className="text-muted-foreground ml-1">
              (in {formatDuration(minutesLeft)})
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
