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
  subject: z.string().trim().min(1, "Subject is required").max(255, "Subject is too long"),
  body: z.string().min(1, "Body is required").max(1000, "Body is too long"),
  bodyHtml: z.string().max(2000, "HTML body is too long").optional(),
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

export const ticketListQuerySchema = z.object({
  sortBy: z.enum(sortableColumns).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(agentTicketStatuses).optional(),
  ticketType: z.enum(ticketTypes).optional(),
  category: z.enum(ticketCategories).optional(),
  priority: z.enum(ticketPriorities).optional(),
  severity: z.enum(ticketSeverities).optional(),
  search: z.string().optional(),
  /** true = only escalated tickets */
  escalated: boolParam,
  /** true = only tickets assigned to the authenticated user */
  assignedToMe: boolParam,
  /** Filter by team ID; "none" matches tickets with no team */
  teamId: z.union([z.coerce.number().int().positive(), z.literal("none")]).optional(),
  /** Filter by custom status ID */
  customStatusId: z.coerce.number().int().positive().optional(),
  /** Filter by custom ticket type ID */
  customTicketTypeId: z.coerce.number().int().positive().optional(),
  /** Predefined compound views — overrides some individual filters */
  view: z.enum(ticketViews).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
