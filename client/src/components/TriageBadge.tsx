import { type TicketPriority, priorityLabel } from "core/constants/ticket-priority.ts";
import { type TicketSeverity, severityShortLabel } from "core/constants/ticket-severity.ts";
import { type TicketImpact, impactLabel } from "core/constants/ticket-impact.ts";
import { type TicketUrgency, urgencyLabel } from "core/constants/ticket-urgency.ts";

// Shared style maps keyed by semantic level (critical > high > medium > low)
const redStyles = "bg-red-500/15 text-red-500";
const orangeStyles = "bg-orange-500/15 text-orange-500";
const amberStyles = "bg-amber-500/15 text-amber-500";
const greenStyles = "bg-green-500/15 text-green-600";

function Badge({ label, styles }: { label: string; styles: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

const priorityStyles: Record<TicketPriority, string> = {
  urgent: redStyles,
  high: orangeStyles,
  medium: amberStyles,
  low: greenStyles,
};

const severityStyles: Record<TicketSeverity, string> = {
  sev1: redStyles,
  sev2: orangeStyles,
  sev3: amberStyles,
  sev4: greenStyles,
};

const levelStyles: Record<"high" | "medium" | "low", string> = {
  high: redStyles,
  medium: amberStyles,
  low: greenStyles,
};

export function PriorityBadge({ priority }: { priority: TicketPriority | null }) {
  if (!priority) return <span className="text-muted-foreground text-xs">—</span>;
  return <Badge label={priorityLabel[priority]} styles={priorityStyles[priority]} />;
}

export function SeverityBadge({ severity }: { severity: TicketSeverity | null }) {
  if (!severity) return <span className="text-muted-foreground text-xs">—</span>;
  return <Badge label={severityShortLabel[severity]} styles={severityStyles[severity]} />;
}

export function ImpactBadge({ impact }: { impact: TicketImpact | null }) {
  if (!impact) return <span className="text-muted-foreground text-xs">—</span>;
  return <Badge label={impactLabel[impact]} styles={levelStyles[impact]} />;
}

export function UrgencyBadge({ urgency }: { urgency: TicketUrgency | null }) {
  if (!urgency) return <span className="text-muted-foreground text-xs">—</span>;
  return <Badge label={urgencyLabel[urgency]} styles={levelStyles[urgency]} />;
}
