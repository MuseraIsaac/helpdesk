import { type EscalationReason, escalationReasonLabel } from "core/constants/escalation-reason.ts";
import { AlertTriangle } from "lucide-react";

interface EscalationBadgeProps {
  /** When true, renders a compact inline icon only (for table cells) */
  compact?: boolean;
  reason?: EscalationReason | null;
}

/**
 * Full badge — used in the ticket detail escalation panel.
 */
export function EscalationBadge({ reason }: EscalationBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-red-500/15 text-red-500">
      <AlertTriangle className="h-3 w-3" />
      {reason ? escalationReasonLabel[reason] : "Escalated"}
    </span>
  );
}

/**
 * Compact icon-only indicator — used in table rows next to the subject.
 */
export function EscalationIcon({ title }: { title?: string }) {
  return (
    <span
      title={title ?? "Escalated"}
      className="inline-flex items-center justify-center h-4 w-4 rounded text-red-500"
      aria-label="Escalated"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
    </span>
  );
}
