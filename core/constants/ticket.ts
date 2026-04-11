import { type TicketStatus } from "./ticket-status";
import { type TicketCategory } from "./ticket-category";
import { type TicketPriority } from "./ticket-priority";
import { type TicketSeverity } from "./ticket-severity";
import { type TicketImpact } from "./ticket-impact";
import { type TicketUrgency } from "./ticket-urgency";
import { type SlaStatus } from "./sla-status";
import { type EscalationReason } from "./escalation-reason";
import { type AuditEvent } from "./audit-event";
import { type CustomerSummary } from "./customer";

export interface EscalationEvent {
  id: number;
  reason: EscalationReason;
  createdAt: string;
}

export interface Ticket {
  id: number;
  subject: string;
  body: string;
  bodyHtml: string | null;
  status: TicketStatus;
  category: TicketCategory | null;
  priority: TicketPriority | null;
  severity: TicketSeverity | null;
  impact: TicketImpact | null;
  urgency: TicketUrgency | null;
  senderName: string;
  senderEmail: string;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;

  // SLA — stored timestamps
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  slaBreached: boolean;

  // SLA — computed by the server on every response
  slaStatus: SlaStatus | null;
  minutesUntilBreach: number | null;

  // Escalation
  isEscalated: boolean;
  escalatedAt: string | null;
  escalationReason: EscalationReason | null;
  /** Full event log — present only in GET /api/tickets/:id responses */
  escalationEvents?: EscalationEvent[];
  /** Append-only audit trail — present only in GET /api/tickets/:id responses */
  auditEvents?: AuditEvent[];
  /** Customer entity with org + prior ticket history — present only in GET /api/tickets/:id responses */
  customer?: CustomerSummary | null;
  /** CSAT rating — present only in GET /api/tickets/:id responses */
  csatRating?: {
    rating: number;
    comment: string | null;
    submittedAt: string;
  } | null;
}
