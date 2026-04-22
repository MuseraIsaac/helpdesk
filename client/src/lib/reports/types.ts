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

// ── Assets ────────────────────────────────────────────────────────────────────

export interface AssetReport {
  // KPIs
  totalAssets:          number;
  activeAssets:         number;
  inStockAssets:        number;
  deployedAssets:       number;
  inUseAssets:          number;
  maintenanceAssets:    number;
  // Expiry alerts
  warrantyExpiring30:   number;
  warrantyExpiring90:   number;
  contractsExpiring30:  number;
  retirementDue90:      number;
  retirementOverdue:    number;
  // Discovery
  staleAssets:          number;
  recentlyDiscovered:   number;
  managedByDiscovery:   number;
  // Linked incidents
  assetsWithOpenIncidents: number;
  openIncidentCount:       number;
  // Distributions
  byStatus:   { status: string;   count: number }[];
  byType:     { type: string;     count: number }[];
  byTeam:     { teamName: string; count: number; active: number }[];
  byLocation: { location: string; count: number }[];
  // Trends
  createdTrend: { date: string; count: number }[];
  retiredTrend: { date: string; retired: number; disposed: number }[];
}

// ── Operational health ────────────────────────────────────────────────────────

export interface OperationalHealth {
  open: number;
  unassigned: number;
  overdue: number;
  atRisk: number;
  assignedNotReplied: number;
}

// ── Insights (cross-module relationship analytics) ────────────────────────────

export interface InsightAsset {
  id:          number;
  assetNumber: string;
  name:        string;
  type:        string;
  status:      string;
}

export interface InsightsOverview {
  totalCrossModuleLinks: number;
  linksByType: { type: string; label: string; count: number }[];
  assets: {
    withOpenIncidents: number;
    withOpenProblems:  number;
    inActiveChanges:   number;
  };
  problems: {
    total:         number;
    withIncidents: number;
    recurring:     number;
  };
  standaloneIncidents: number;
  changes: {
    linkedToProblems:     number;
    linkedToOpenProblems: number;
  };
  incidentDistribution: { bucket: string; count: number }[];
  topImpactedAssets: (InsightAsset & {
    incidents: number; problems: number; changes: number;
    requests:  number; tickets:  number; total:   number;
  })[];
}

export interface InsightsAssetImpact {
  topAssets: (InsightAsset & {
    incidents: number; openIncidents: number;
    problems:  number; openProblems:  number;
    changes:   number; activeChanges: number;
    requests:  number; tickets:       number;
    total:     number;
  })[];
  concurrentRisk: (InsightAsset & {
    openIncidents: number;
    activeChanges: number;
  })[];
  byAssetType: {
    type:      string;
    incidents: number;
    problems:  number;
    changes:   number;
    requests:  number;
  }[];
  requestsByAssetType: { type: string; requestCount: number }[];
}

export interface InsightsProblemChains {
  avgIncidentsPerProblem: number;
  recurrenceDistribution: { bucket: string; label: string; count: number }[];
  resolutionBreakdown: {
    noChange:         number;
    changeResolved:   number;
    changeFailed:     number;
    changeInProgress: number;
    changeTerminal:   number;
  };
  topProblems: {
    id:            number;
    problemNumber: string;
    title:         string;
    status:        string;
    incidentCount: number;
    ticketCount:   number;
    assetCount:    number;
    linkedChange:  { id: number; changeNumber: string; state: string } | null;
  }[];
  topProblemAssets: (InsightAsset & {
    problemCount:     number;
    openProblemCount: number;
  })[];
  byStatus: { status: string; count: number; totalIncidents: number; avgIncidents: number }[];
}

export interface InsightsChangeRisk {
  successByRisk: {
    risk: string; total: number; failed: number;
    successRate: number | null; avgAssets: number;
  }[];
  successByType: {
    changeType: string; total: number; failed: number;
    successRate: number | null; avgAssets: number;
  }[];
  assetScopeDistribution: {
    bucket: string; changeCount: number; failedCount: number; failureRate: number;
  }[];
  changesLinkedToOpenProblems: {
    id: number; changeNumber: string; title: string;
    state: string; risk: string; changeType: string; assetCount: number;
    problem: { id: number; number: string; title: string; status: string };
  }[];
  recentFailedChanges: {
    id: number; changeNumber: string; title: string;
    risk: string; failedAt: string; assetCount: number; linkedProblem: string | null;
  }[];
}

export interface InsightsTickets {
  relationships: {
    total:       number;
    withIncident: number;
    withRequest:  number;
    withProblem:  number;
    withAsset:    number;
    withCi:       number;
    standalone:   number;
  };
  byCategory: { category: string; count: number; open: number; slaBreached: number }[];
  byPriority: { priority: string; count: number; slaBreached: number }[];
  byTeam:     { teamId: number | null; teamName: string; count: number; open: number; slaBreached: number }[];
  bySource:   { source: string; count: number }[];
  byHourOfDay:  { hour: number; label: string; count: number }[];
  byDayOfWeek:  { dow: number; name: string; count: number }[];
  byDayOfMonth: { day: number; count: number }[];
  topCustomers: {
    customerId:       number;
    name:             string;
    email:            string;
    ticketCount:      number;
    openCount:        number;
    slaBreachedCount: number;
  }[];
  priorityStatusMatrix: { priority: string; status: string; count: number }[];
  slaByCategory: { category: string; total: number; breached: number; breachRate: number }[];
  topLinkedProblems: {
    problemId: number; problemNumber: string; title: string; status: string; ticketCount: number;
  }[];
  customFields: {
    fieldName:      string;
    totalResponses: number;
    values:         { value: string; count: number }[];
  }[];
}

export interface InsightsServiceHealth {
  topServices: {
    id: number; name: string;
    requestCount: number; openRequests: number;
    assetCount: number; assetsWithIncidents: number;
    openIncidentCount: number; healthScore: number;
  }[];
  servicesWithFailingAssets: {
    id: number; name: string;
    linkedAssets: number; assetsWithIncidents: number; openIncidentCount: number;
  }[];
  requestImpact: {
    totalOpenRequests:           number;
    requestsWithAssetLinks:      number;
    requestsAffectedByIncidents: number;
    impactRate:                  number;
  };
  servicesByChange: {
    id: number; name: string;
    changeCount: number; failedCount: number; failureRate: number;
  }[];
}
