import { type TicketStatus } from "./ticket-status";
import { type TicketType } from "./ticket-type";
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
  /** Human-readable display ID, e.g. INC0042. Immutable after creation. */
  ticketNumber: string;
  subject: string;
  body: string;
  bodyHtml: string | null;
  status: TicketStatus;
  ticketType: TicketType | null;
  affectedSystem: string | null;
  category: TicketCategory | null;
  priority: TicketPriority | null;
  severity: TicketSeverity | null;
  impact: TicketImpact | null;
  urgency: TicketUrgency | null;
  senderName: string;
  senderEmail: string;
  assignedTo: { id: string; name: string } | null;
  teamId: number | null;
  team: { id: number; name: string; color: string } | null;
  /** Channel that created this ticket: "email" | "portal" | "agent" | null for legacy rows */
  source: string | null;
  /** Customer's organization name — present in list responses when available */
  organization: string | null;
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

  // Custom ticket type — set when a user-defined ticket type is selected
  customTicketTypeId: number | null;
  customTicketType: { id: number; name: string; slug: string; color: string } | null;

  // Custom status — overrides built-in status display when set
  customStatusId: number | null;
  customStatus: { id: number; label: string; color: string } | null;
  // SLA pause — set when ticket is in an on_hold custom status
  slaPausedAt: string | null;
  slaPausedMinutes: number;

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
  /** Linked Incident — present only in GET /api/tickets/:id responses when ticketType is "incident" */
  linkedIncident?: {
    id: number;
    incidentNumber: string;
    title: string;
    status: string;
    priority: string;
    isMajor: boolean;
    affectedSystem: string | null;
    assignedTo: { id: string; name: string } | null;
    team: { id: number; name: string; color: string } | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  /** Linked ServiceRequest — present only in GET /api/tickets/:id responses when ticketType is "service_request" */
  linkedServiceRequest?: {
    id: number;
    requestNumber: string;
    title: string;
    status: string;
    priority: string;
    approvalStatus: string;
    assignedTo: { id: string; name: string } | null;
    team: { id: number; name: string; color: string } | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}
