import { z } from "zod/v4";
import { agentTicketStatuses } from "../constants/ticket-status";
import { ticketCategories } from "../constants/ticket-category";
import { ticketPriorities } from "../constants/ticket-priority";
import { ticketSeverities } from "../constants/ticket-severity";
import { ticketImpacts } from "../constants/ticket-impact";
import { ticketUrgencies } from "../constants/ticket-urgency";
import { ticketTypes } from "../constants/ticket-type";

export const inboundEmailSchema = z.object({
  from: z.email("Invalid email address"),
  fromName: z.string().trim().min(1, "Sender name is required").max(255, "Sender name is too long"),
  subject: z.string().trim().min(1, "Subject is required").max(500, "Subject is too long"),
  // Real-world emails routinely exceed the original 1000/2000 caps —
  // signatures, quoted threads, and HTML markup all push past those limits.
  // The DB columns are TEXT so 100 KB / 500 KB is comfortable.
  body: z.string().max(100_000, "Body is too long").default(""),
  bodyHtml: z.string().max(500_000, "HTML body is too long").optional(),
});

export type InboundEmailInput = z.infer<typeof inboundEmailSchema>;

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(255, "Subject is too long"),
  body: z.string().trim().min(1, "Description is required").max(5000, "Description is too long"),
  /** HTML version of the body from the rich text editor. */
  bodyHtml: z.string().optional(),
  senderName: z.string().trim().min(1, "Sender name is required").max(255, "Sender name is too long"),
  senderEmail: z.email("Invalid email address"),
  ticketType: z.enum(ticketTypes).nullable().optional(),
  affectedSystem: z.string().trim().max(255, "Affected system is too long").nullable().optional(),
  category: z.enum(ticketCategories).nullable().optional(),
  priority: z.enum(ticketPriorities).nullable().optional(),
  severity: z.enum(ticketSeverities).nullable().optional(),
  impact: z.enum(ticketImpacts).nullable().optional(),
  urgency: z.enum(ticketUrgencies).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  teamId: z.number().int().positive().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional().default({}),
  customTicketTypeId: z.number().int().positive().nullable().optional(),
  organizationId: z.number().int().positive().nullable().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

const sortableColumns = [
  "subject",
  "senderName",
  "status",
  "ticketType",
  "category",
  "priority",
  "severity",
  "createdAt",
  "updatedAt",
] as const;

export type TicketSortField = (typeof sortableColumns)[number];

export const updateTicketSchema = z.object({
  assignedToId: z.string().nullable().optional(),
  status: z.enum(agentTicketStatuses).optional(),
  ticketType: z.enum(ticketTypes).nullable().optional(),
  affectedSystem: z.string().trim().max(255, "Affected system is too long").nullable().optional(),
  category: z.enum(ticketCategories).nullable().optional(),
  priority: z.enum(ticketPriorities).nullable().optional(),
  severity: z.enum(ticketSeverities).nullable().optional(),
  impact: z.enum(ticketImpacts).nullable().optional(),
  urgency: z.enum(ticketUrgencies).nullable().optional(),
  /** true = manual escalate, false = de-escalate */
  escalate: z.boolean().optional(),
  /** Optional manual-escalation target — team to escalate to */
  escalateToTeamId: z.number().int().positive().optional(),
  /** Optional manual-escalation target — agent to escalate to */
  escalateToUserId: z.string().optional(),
  /** null = remove from team; positive int = assign to team */
  teamId: z.number().int().positive().nullable().optional(),
  /** null = clear custom status; positive int = apply custom status ID */
  customStatusId: z.number().int().positive().nullable().optional(),
  /** null = clear custom ticket type; positive int = apply custom ticket type ID */
  customTicketTypeId: z.number().int().positive().nullable().optional(),
});

// Predefined views that translate to compound where-clauses on the backend.
// Mutually exclusive with fine-grained filter params when active.
export const ticketViews = ["overdue", "at_risk", "unassigned_urgent"] as const;
export type TicketView = (typeof ticketViews)[number];

// Coerce "true"/"false" query-string values to boolean
const boolParam = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// Accept a comma-separated string, a repeated param (array), or a single value;
// split and validate each element against the allowed enum values.
function csvEnum<T extends readonly [string, ...string[]]>(vals: T) {
  return z.preprocess((v) => {
    if (v == null) return undefined;
    const arr = Array.isArray(v)
      ? v.flatMap((s) => String(s).split(","))
      : typeof v === "string"
      ? v.split(",")
      : [String(v)];
    const filtered = arr.map((s) => s.trim()).filter(Boolean);
    return filtered.length ? filtered : undefined;
  }, z.array(z.enum(vals as unknown as [string, ...string[]])).optional());
}

// Comma-separated list of arbitrary strings (used for IDs / mixed values)
const csvStrings = z.preprocess((v) => {
  if (v == null) return undefined;
  const arr = Array.isArray(v)
    ? v.flatMap((s) => String(s).split(","))
    : typeof v === "string"
    ? v.split(",")
    : [String(v)];
  const filtered = arr.map((s) => s.trim()).filter(Boolean);
  return filtered.length ? filtered : undefined;
}, z.array(z.string()).optional());

// Comma-separated list of positive integers
const csvIntIds = z.preprocess((v) => {
  if (v == null) return undefined;
  const arr = Array.isArray(v)
    ? v.flatMap((s) => String(s).split(","))
    : typeof v === "string"
    ? v.split(",")
    : [String(v)];
  const ids = arr.map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : undefined;
}, z.array(z.number().int().positive()).optional());

// Comma-separated list of team IDs OR the literal "none" (each entry can be either)
const csvTeamIds = z.preprocess((v) => {
  if (v == null) return undefined;
  const arr = Array.isArray(v)
    ? v.flatMap((s) => String(s).split(","))
    : typeof v === "string"
    ? v.split(",")
    : [String(v)];
  const out: (number | "none")[] = [];
  for (const raw of arr) {
    const t = raw.trim();
    if (!t) continue;
    if (t === "none") out.push("none");
    else {
      const n = Number(t);
      if (Number.isInteger(n) && n > 0) out.push(n);
    }
  }
  return out.length ? out : undefined;
}, z.array(z.union([z.number().int().positive(), z.literal("none")])).optional());

export const ticketListQuerySchema = z.object({
  sortBy: z.enum(sortableColumns).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  /** Multi-value: built-in agent statuses */
  status: csvEnum(agentTicketStatuses),
  /** Multi-value: built-in ticket types */
  ticketType: csvEnum(ticketTypes),
  category: csvEnum(ticketCategories),
  priority: csvEnum(ticketPriorities),
  severity: csvEnum(ticketSeverities),
  search: z.string().optional(),
  /** true = only escalated tickets */
  escalated: boolParam,
  /** true = only tickets assigned to the authenticated user */
  assignedToMe: boolParam,
  /** Multi-value: team IDs; "none" matches tickets with no team */
  teamId: csvTeamIds,
  /** Multi-value: custom status IDs */
  customStatusId: csvIntIds,
  /** Multi-value: custom ticket type IDs */
  customTicketTypeId: csvIntIds,
  /** Filter by impact level */
  impact: csvEnum(ticketImpacts),
  /** Filter by urgency level */
  urgency: csvEnum(ticketUrgencies),
  /** Filter by intake channel */
  source: csvEnum(["email", "portal", "agent"] as const),
  /** Multi-value: filter by specific assigned agents (user IDs) */
  assignedToId: csvStrings,
  /** true = only tickets with no agent assigned */
  unassigned: boolParam,
  /** true = only SLA-breached tickets; false = only non-breached */
  slaBreached: boolParam,
  /** Predefined compound views — overrides some individual filters */
  view: z.enum(ticketViews).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
