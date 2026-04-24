/**
 * Automation Engine — Internal Types
 *
 * These types represent the runtime context passed to condition evaluators
 * and action executors. They are server-only — not exported from core.
 */

import type { AutomationTriggerType } from "core/constants/automation";

// ── Entity snapshots passed to the engine ─────────────────────────────────────

export interface TicketSnapshot {
  id: number;
  ticketNumber?: string;           // e.g. TKT0042 — used for notification template variables
  subject: string;
  body: string;
  status: string;
  category: string | null;
  priority: string | null;
  severity: string | null;
  impact: string | null;
  urgency: string | null;
  ticketType: string | null;
  source: string | null;
  affectedSystem: string | null;
  senderEmail: string;
  senderName: string;
  assignedToId: string | null;
  teamId: number | null;
  isEscalated: boolean;
  slaBreached: boolean;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  linkedIncidentId: number | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  // Email intake fields — populated from inbound email headers
  emailMessageId?: string | null;
  emailTo?: string | null;
  emailCc?: string | null;
  emailReplyTo?: string | null;
  isAutoReply?: boolean;
  isBounce?: boolean;
  isSpam?: boolean;
  isQuarantined?: boolean;
  mailboxAlias?: string | null;
  // Computed by intake runner — not stored in DB
  senderDomain?: string | null;
  requesterIsVip?: boolean;
  requesterSupportTier?: string | null;
  requesterOrgName?: string | null;
  requesterTimezone?: string | null;
  requesterLanguage?: string | null;
  isBusinessHours?: boolean;
  deletedAt?: Date | null;
  // Time-supervisor tracking fields (populated from DB)
  lastAgentReplyAt?: Date | null;
  lastCustomerReplyAt?: Date | null;
  statusChangedAt?: Date | null;
  // Computed time metrics — populated by the time-snapshot builder at scan time
  // Units: hours (floating point). null = data not available for this ticket.
  ageHours?: number;                       // hours since ticket was created
  idleHours?: number;                      // hours since any update (updatedAt)
  hoursSinceLastReply?: number | null;     // hours since last reply (any sender)
  hoursSinceLastAgentReply?: number | null;     // hours since last agent reply
  hoursSinceLastCustomerReply?: number | null;  // hours since last customer reply
  hoursUntilSlaFirstResponse?: number | null;   // positive = time left, negative = breached
  hoursUntilSlaResolution?: number | null;      // positive = time left, negative = breached
  hoursInCurrentStatus?: number | null;         // hours since statusChangedAt
  hoursUnassigned?: number | null;              // hours since assignedToId became null (or total if never assigned)
  pendingApprovalHours?: number | null;         // for approval-related trigger contexts
  // Previous field values — populated when firing changed-field events
  // Enables conditions like: previous.status = "open" AND status = "escalated"
  previousValues?: Record<string, unknown>;
  // Enriched at runtime by the engine
  teamMemberIds?: string[];
  tags?: string[];
  // ── Enrichment fields — populated from Customer + Organization lookups ─────
  customerId?: number | null;
  customerJobTitle?: string | null;
  customerPhone?: string | null;
  customerPreferredChannel?: string | null;
  // Org fields
  orgSupportTier?: string | null;
  orgCountry?: string | null;
  orgIndustry?: string | null;
  orgEmployeeCount?: number | null;
  orgWebsite?: string | null;
  // ── Lifecycle condition fields — computed from related records ─────────────
  hasLinkedIncident?: boolean;
  hasLinkedProblem?: boolean;
  hasLinkedChange?: boolean;
  linkedProblemId?: number | null;
  linkedChangeRef?: string | null;
  mergedTicketCount?: number;
  isMerged?: boolean;
}

export type EntitySnapshot = TicketSnapshot; // extend with IncidentSnapshot etc. as needed

// ── Engine run context ────────────────────────────────────────────────────────

export interface EngineRunContext {
  trigger: AutomationTriggerType;
  entityType: "ticket" | "incident" | "change" | "request";
  entityId: number;
  snapshot: EntitySnapshot;
  /** Internal dedup guard — prevents the same rule firing twice in a chain */
  _appliedRuleIds?: Set<number>;
  /** Extra trigger-time metadata (changed fields, old values, etc.) */
  meta?: Record<string, unknown>;
}

// ── Per-action result ─────────────────────────────────────────────────────────

export interface ActionResult {
  type: string;
  applied: boolean;
  skippedReason?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}

// ── Engine run result ─────────────────────────────────────────────────────────

export interface EngineRunResult {
  ruleId: number;
  ruleName: string;
  conditionsMatched: boolean;
  actions: ActionResult[];
  stopped: boolean; // stopOnMatch fired
}
