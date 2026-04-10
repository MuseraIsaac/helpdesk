import DOMPurify from "dompurify";
import { type Ticket } from "core/constants/ticket.ts";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { PriorityBadge, SeverityBadge, ImpactBadge, UrgencyBadge } from "@/components/TriageBadge";
import { SlaBadge, SlaDeadlineRow } from "@/components/SlaBadge";
import { EscalationBadge } from "@/components/EscalationBadge";
import EscalationHistory from "@/components/EscalationHistory";

interface TicketDetailProps {
  ticket: Ticket;
}

export default function TicketDetail({ ticket }: TicketDetailProps) {
  const hasTriage = ticket.priority || ticket.severity || ticket.impact || ticket.urgency;
  const hasSla = ticket.firstResponseDueAt || ticket.resolutionDueAt;
  const hasEscalation = ticket.isEscalated || (ticket.escalationEvents && ticket.escalationEvents.length > 0);

  return (
    <>
      <div>
        <div className="flex items-start gap-3 mb-3">
          <h1 className="text-2xl font-semibold tracking-tight flex-1">
            {ticket.subject}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {ticket.isEscalated && (
              <EscalationBadge reason={ticket.escalationReason} />
            )}
            <StatusBadge status={ticket.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">From:</span>{" "}
            {ticket.senderName} ({ticket.senderEmail})
          </div>
          <div>
            <span className="font-medium text-foreground">Created:</span>{" "}
            {new Date(ticket.createdAt).toLocaleString()}
          </div>
          <div>
            <span className="font-medium text-foreground">Updated:</span>{" "}
            {new Date(ticket.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>

      {hasTriage && (
        <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 px-4 py-3">
          {ticket.priority && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Priority</span>
              <PriorityBadge priority={ticket.priority} />
            </div>
          )}
          {ticket.severity && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Severity</span>
              <SeverityBadge severity={ticket.severity} />
            </div>
          )}
          {ticket.impact && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Impact</span>
              <ImpactBadge impact={ticket.impact} />
            </div>
          )}
          {ticket.urgency && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Urgency</span>
              <UrgencyBadge urgency={ticket.urgency} />
            </div>
          )}
        </div>
      )}

      {hasSla && ticket.slaStatus && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">SLA</span>
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
        </div>
      )}

      {hasEscalation && (
        <div className="rounded-lg border border-red-200 bg-red-500/5 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-red-500/70">
              Escalation
            </span>
            {ticket.isEscalated ? (
              <EscalationBadge reason={null} />
            ) : (
              <span className="text-xs text-muted-foreground">De-escalated</span>
            )}
          </div>
          {ticket.escalatedAt && (
            <p className="text-xs text-muted-foreground">
              First escalated: {new Date(ticket.escalatedAt).toLocaleString()}
            </p>
          )}
          <EscalationHistory events={ticket.escalationEvents ?? []} />
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {ticket.bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(ticket.bodyHtml),
              }}
            />
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">{ticket.body}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
