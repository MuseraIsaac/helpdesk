import { type Ticket } from "core/constants/ticket.ts";
import RichTextRenderer from "@/components/RichTextRenderer";
import { PriorityBadge, SeverityBadge, ImpactBadge, UrgencyBadge } from "@/components/TriageBadge";
import { SlaBadge, SlaDeadlineRow } from "@/components/SlaBadge";
import { EscalationBadge } from "@/components/EscalationBadge";
import EscalationHistory from "@/components/EscalationHistory";
import { Server, Clock, AlertTriangle, FileText } from "lucide-react";

function SectionCard({
  icon: Icon, title, children, className = "",
}: {
  icon?: React.ElementType; title?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
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

      {/* SLA strip */}
      {hasSla && ticket.slaStatus && (
        <SectionCard icon={Clock} title="SLA">
          <div className="flex items-center justify-between mb-3">
            <SlaBadge status={ticket.slaStatus} />
          </div>
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

      {/* Escalation strip */}
      {hasEscalation && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-destructive/15 bg-destructive/5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive/70 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-destructive/60">Escalation</span>
            </div>
            {ticket.isEscalated ? (
              <EscalationBadge reason={null} />
            ) : (
              <span className="text-xs text-muted-foreground">De-escalated</span>
            )}
          </div>
          <div className="p-4 space-y-2">
            {ticket.escalatedAt && (
              <p className="text-xs text-muted-foreground">
                First escalated:{" "}
                {new Intl.DateTimeFormat(undefined, {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit", timeZoneName: "short",
                }).format(new Date(ticket.escalatedAt))}
              </p>
            )}
            <EscalationHistory events={ticket.escalationEvents ?? []} />
          </div>
        </div>
      )}

      {/* Body */}
      <SectionCard icon={FileText} title="Message">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <RichTextRenderer content={ticket.bodyHtml ?? ticket.body} />
        </div>
      </SectionCard>
    </div>
  );
}
