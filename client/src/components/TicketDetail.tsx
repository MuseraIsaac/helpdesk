import { useState } from "react";
import { type Ticket } from "core/constants/ticket.ts";
import { PriorityBadge, SeverityBadge, ImpactBadge, UrgencyBadge } from "@/components/TriageBadge";
import { SlaBadge, SlaDeadlineRow } from "@/components/SlaBadge";
import { EscalationBadge } from "@/components/EscalationBadge";
import EscalationHistory from "@/components/EscalationHistory";
import { Server, Clock, AlertTriangle, Users, User, ChevronDown } from "lucide-react";

/**
 * SectionCard
 *
 * Lightweight panel with an icon + title header. When `collapsible` is set,
 * the header becomes a button that toggles the body open/closed. A `summary`
 * slot lets callers render a one-line status preview (e.g. "Breached",
 * "Escalated · Sev1") that stays visible while the section is collapsed —
 * so users never lose context for sections that hide their content by default.
 */
function SectionCard({
  icon: Icon,
  title,
  children,
  className = "",
  headerClassName,
  borderClassName,
  collapsible = false,
  defaultOpen = true,
  summary,
}: {
  icon?: React.ElementType;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** Extra classes for the header bar — used by the destructive-tinted Escalation card. */
  headerClassName?: string;
  /** Extra classes for the outer border — used to tint the whole card. */
  borderClassName?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Inline status preview rendered on the right of the header (always visible). */
  summary?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = !collapsible || open;

  const headerInner = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        {title && (
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {title}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {summary && <div className="flex items-center gap-2 min-w-0">{summary}</div>}
        {collapsible && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground/70 shrink-0 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
          />
        )}
      </div>
    </>
  );

  return (
    <div
      className={`rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden ${borderClassName ?? ""} ${className}`}
    >
      {title !== undefined && (
        collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors text-left ${isOpen ? "" : "border-b-0"} ${headerClassName ?? ""}`}
            aria-expanded={isOpen}
          >
            {headerInner}
          </button>
        ) : (
          <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20 ${headerClassName ?? ""}`}>
            {headerInner}
          </div>
        )
      )}
      {/* Smooth height transition via CSS grid trick — avoids JS measurement. */}
      <div
        className={`grid transition-all duration-200 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface TicketDetailProps {
  ticket: Ticket;
}

export default function TicketDetail({ ticket }: TicketDetailProps) {
  const hasTriage = ticket.priority || ticket.severity || ticket.impact || ticket.urgency || ticket.affectedSystem;
  const hasSla = ticket.firstResponseDueAt || ticket.resolutionDueAt;
  const hasEscalation = ticket.isEscalated || (ticket.escalationEvents && ticket.escalationEvents.length > 0);

  return (
    <div className="space-y-3">
      {/* Triage strip */}
      {hasTriage && (
        <SectionCard icon={AlertTriangle} title="Triage">
          <div className="flex flex-wrap gap-5">
            {ticket.priority && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Priority</span>
                <PriorityBadge priority={ticket.priority} />
              </div>
            )}
            {ticket.severity && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Severity</span>
                <SeverityBadge severity={ticket.severity} />
              </div>
            )}
            {ticket.impact && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Impact</span>
                <ImpactBadge impact={ticket.impact} />
              </div>
            )}
            {ticket.urgency && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Urgency</span>
                <UrgencyBadge urgency={ticket.urgency} />
              </div>
            )}
            {ticket.affectedSystem && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Affected System</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  {ticket.affectedSystem}
                </span>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* SLA strip — collapsed by default; status badge stays visible in header */}
      {hasSla && ticket.slaStatus && (
        <SectionCard
          icon={Clock}
          title="SLA"
          collapsible
          defaultOpen={false}
          summary={<SlaBadge status={ticket.slaStatus} />}
        >
          <div className="space-y-2">
            <SlaDeadlineRow
              label="First Response"
              dueAt={ticket.firstResponseDueAt}
              respondedAt={ticket.firstRespondedAt}
            />
            <SlaDeadlineRow
              label="Resolution"
              dueAt={ticket.resolutionDueAt}
              respondedAt={ticket.resolvedAt}
            />
          </div>
        </SectionCard>
      )}

      {/* Escalation strip — collapsed by default; status pill stays visible in header */}
      {hasEscalation && (
        <SectionCard
          icon={AlertTriangle}
          title="Escalation"
          collapsible
          defaultOpen={false}
          borderClassName="border-destructive/20 bg-destructive/5"
          headerClassName="border-destructive/15 bg-destructive/5 hover:bg-destructive/10"
          summary={ticket.isEscalated
            ? <EscalationBadge reason={null} />
            : <span className="text-xs text-muted-foreground">De-escalated</span>}
        >
          <div className="space-y-2">
            {ticket.escalatedAt && (
              <p className="text-xs text-muted-foreground">
                First escalated:{" "}
                {new Intl.DateTimeFormat(undefined, {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit", timeZoneName: "short",
                }).format(new Date(ticket.escalatedAt))}
              </p>
            )}
            {(ticket.escalatedToTeam || ticket.escalatedToUser) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {ticket.escalatedToTeam && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3 w-3" />
                    Team:{" "}
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ticket.escalatedToTeam.color }}
                      />
                      {ticket.escalatedToTeam.name}
                    </span>
                  </span>
                )}
                {ticket.escalatedToUser && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3 w-3" />
                    Agent:{" "}
                    <span className="font-medium text-foreground">
                      {ticket.escalatedToUser.name}
                    </span>
                  </span>
                )}
              </div>
            )}
            <EscalationHistory
              events={ticket.escalationEvents ?? []}
              escalatedToTeam={ticket.escalatedToTeam}
              escalatedToUser={ticket.escalatedToUser}
            />
          </div>
        </SectionCard>
      )}
    </div>
  );
}
