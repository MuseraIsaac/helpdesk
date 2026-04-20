import { type TicketStatus, statusLabel } from "core/constants/ticket-status.ts";

const statusStyles: Record<TicketStatus, string> = {
  new: "bg-sky-500/15 text-sky-400",
  processing: "bg-amber-500/15 text-amber-400",
  open: "bg-pink-400/15 text-pink-400",
  in_progress: "bg-violet-500/15 text-violet-500",
  resolved: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  status: TicketStatus;
  customStatus?: { label: string; color: string } | null;
}

/** Convert a hex color to an rgba with reduced opacity for the badge background. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function StatusBadge({ status, customStatus }: StatusBadgeProps) {
  if (customStatus) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border-0 px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: hexToRgba(customStatus.color, 0.15),
          color: customStatus.color,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {customStatus.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border-0 px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel[status]}
    </span>
  );
}
