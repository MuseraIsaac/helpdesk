// ── Shared param types ────────────────────────────────────────────────────────

export type PeriodOption = "7" | "30" | "90" | "this_month" | "last_month";

export interface DateRangeParams {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

// ── Overview ──────────────────────────────────────────────────────────────────

export interface ReportOverview {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  resolvedByAI: number;
  aiResolutionRate: number;
  ticketsWithSlaTarget: number;
  breachedTickets: number;
  slaComplianceRate: number | null;
  escalatedTickets: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
}

export interface AgingBucket {
  bucket: string;
  count: number;
  sort: number;
}

export interface TopOpenTicket {
  id: number;
  ticketNumber: string;
  subject: string;
  priority: string | null;
  slaBreached: boolean;
  resolutionDueAt: string | null;
  createdAt: string;
  assigneeName: string;
  daysOpen: number;
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export interface VolumePoint {
  date: string;
  tickets: number;
}

export interface BacklogPoint {
  date: string;
  opened: number;
  closed: number;
}

export interface CategoryBreakdown {
  category: string | null;
  label: string;
  total: number;
  open: number;
}

export interface PriorityBreakdown {
  priority: string | null;
  label: string;
  total: number;
  open: number;
}

export interface AssigneeBreakdown {
  agentId: string;
  agentName: string;
  total: number;
  open: number;
  resolved: number;
}

export interface BreakdownReport {
  byCategory: CategoryBreakdown[];
  byPriority: PriorityBreakdown[];
  byAssignee: AssigneeBreakdown[];
}

export interface ResolutionBucket {
  label: string;
  count: number;
  sort: number;
}

export interface FcrReport {
  total: number;
  firstContact: number;
  multiContact: number;
  rate: number | null;
}

// ── SLA & Agents ──────────────────────────────────────────────────────────────

export interface SlaDimItem {
  key: string;
  label?: string;
  totalWithSla: number;
  breached: number;
  compliance: number | null;
}

export interface SlaByDimensionReport {
  byPriority: SlaDimItem[];
  byCategory: SlaDimItem[];
  byTeam: SlaDimItem[];
}

export interface AgentLeaderboardEntry {
  agentId: string;
  agentName: string;
  resolved: number;
  avgResolutionSeconds: number | null;
  slaCompliancePct: number | null;
}

// ── Incidents ─────────────────────────────────────────────────────────────────

export interface IncidentVolumePoint {
  date: string;
  count: number;
}

export interface IncidentStatusCount {
  status: string;
  count: number;
}

export interface IncidentPriorityCount {
  priority: string;
  count: number;
}

export interface IncidentReport {
  total: number;
  majorCount: number;
  slaBreached: number;
  mtta: number | null;
  mttr: number | null;
  byStatus: IncidentStatusCount[];
  byPriority: IncidentPriorityCount[];
  volume: IncidentVolumePoint[];
}

// ── Requests ──────────────────────────────────────────────────────────────────

export interface RequestTopItem {
  name: string;
  count: number;
  avgSeconds: number | null;
}

export interface RequestReport {
  total: number;
  slaBreached: number;
  avgFulfillmentSeconds: number | null;
  slaCompliance: number | null;
  byStatus: { status: string; count: number }[];
  topItems: RequestTopItem[];
}

// ── Problems ──────────────────────────────────────────────────────────────────

export interface ProblemReport {
  total: number;
  knownErrors: number;
  withIncidents: number;
  recurring: number;
  avgResolutionDays: number | null;
  byStatus: { status: string; count: number }[];
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export interface ApprovalOldestItem {
  id: number;
  title: string;
  subjectType: string;
  createdAt: string;
  daysOpen: number;
}

export interface ApprovalReport {
  total: number;
  avgTurnaroundSeconds: number | null;
  byStatus: { status: string; count: number }[];
  oldestPending: ApprovalOldestItem[];
}

// ── Changes ───────────────────────────────────────────────────────────────────

export interface ChangeVolumePoint {
  date: string;
  count: number;
}

export interface ChangeReport {
  total: number;
  failed: number;
  emergency: number;
  successRate: number | null;
  avgApprovalSec: number | null;
  byState: { state: string; count: number }[];
  byType:  { type:  string; count: number }[];
  byRisk:  { risk:  string; count: number }[];
  volume:  ChangeVolumePoint[];
}

// ── KB search ─────────────────────────────────────────────────────────────────

export interface KbSearchTerm {
  query: string;
  count: number;
  avgResultCount: number;
  zeroResultsCount: number;
}

export interface KbSearchStatsReport {
  totalSearches: number;
  uniqueQueries: number;
  zeroResultRate: number | null;
  topQueries: KbSearchTerm[];
}

// ── CSAT ──────────────────────────────────────────────────────────────────────

export interface CsatPoint {
  date: string;
  avgRating: number | null;
  count: number;
}

export interface CsatBreakdownEntry {
  rating: number;
  label: string;
  count: number;
  pct: number;
}

export interface CsatBreakdown {
  total: number;
  breakdown: CsatBreakdownEntry[];
}

// ── Operational health ────────────────────────────────────────────────────────

export interface OperationalHealth {
  open: number;
  unassigned: number;
  overdue: number;
  atRisk: number;
  assignedNotReplied: number;
}
