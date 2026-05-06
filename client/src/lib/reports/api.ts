/**
 * Typed API layer for the /api/reports/* endpoints.
 *
 * Each function corresponds to one server route and returns the data payload
 * directly (unwrapping the Axios response envelope). Callers can pass the
 * function reference directly to TanStack Query's `queryFn`.
 *
 * Ticket-domain dimension filters
 * ───────────────────────────────
 * Most ticket-aggregation endpoints accept the same dimension filters
 * (priority, category, status, teamId, assigneeId). Callers pass a
 * `ReportFilters` object; helpers below append it to the query string.
 * Filter values must also appear in the React Query cache key so the
 * cache invalidates when the user changes a filter.
 */
import axios from "axios";
import { periodToRange, rangeQS } from "./utils";

// ── Ticket-domain dimension filters ──────────────────────────────────────────

export interface ReportFilters {
  priority?:       string;
  category?:       string;
  status?:         string;
  teamId?:         string | number;
  assigneeId?:     string;
  ticketType?:     string;
  source?:         string;
  organizationId?: string | number;
}

/** Append non-empty filter values to an existing query string fragment. */
export function appendFiltersToQs(qs: string, filters?: ReportFilters): string {
  if (!filters) return qs;
  const p = new URLSearchParams(qs);
  if (filters.priority)       p.set("priority",       filters.priority);
  if (filters.category)       p.set("category",       filters.category);
  if (filters.status)         p.set("status",         filters.status);
  if (filters.teamId)         p.set("teamId",         String(filters.teamId));
  if (filters.assigneeId)     p.set("assigneeId",     filters.assigneeId);
  if (filters.ticketType)     p.set("ticketType",     filters.ticketType);
  if (filters.source)         p.set("source",         filters.source);
  if (filters.organizationId) p.set("organizationId", String(filters.organizationId));
  return p.toString();
}

/**
 * Stable cache-key fragment derived from filters. Returned as an array so it
 * can spread into a queryKey: `["reports", "volume", period, ...filterKey(f)]`.
 */
export function filterKey(f?: ReportFilters): unknown[] {
  if (!f) return [];
  return [
    f.priority       ?? "",
    f.category       ?? "",
    f.status         ?? "",
    f.teamId         ?? "",
    f.assigneeId     ?? "",
    f.ticketType     ?? "",
    f.source         ?? "",
    f.organizationId ?? "",
  ];
}
import type {
  PeriodOption,
  ReportOverview,
  AgingBucket,
  TopOpenTicket,
  VolumePoint,
  BacklogPoint,
  BreakdownReport,
  ResolutionBucket,
  FcrReport,
  SlaByDimensionReport,
  AgentLeaderboardEntry,
  IncidentReport,
  CsatPoint,
  CsatBreakdown,
  OperationalHealth,
  RequestReport,
  ProblemReport,
  ApprovalReport,
  ChangeReport,
  KbSearchStatsReport,
  AssetReport,
  InsightsOverview,
  InsightsAssetImpact,
  InsightsProblemChains,
  InsightsChangeRisk,
  InsightsServiceHealth,
  InsightsTickets,
  InsightsCiImpact,
} from "./types";

// ── Overview ──────────────────────────────────────────────────────────────────

/** Accept either a period string ("30") or a pre-built QS fragment ("from=X&to=Y"). */
export async function fetchOverview(
  periodOrQs: PeriodOption | string,
  filters?: ReportFilters,
): Promise<ReportOverview> {
  const baseQs = periodOrQs.includes("=") ? periodOrQs : rangeQS(periodToRange(periodOrQs));
  const qs = appendFiltersToQs(baseQs, filters);
  const { data } = await axios.get<ReportOverview>(`/api/reports/overview?${qs}`);
  return data;
}

export async function fetchBreakdownsQs(qs: string, filters?: ReportFilters): Promise<BreakdownReport> {
  const { data } = await axios.get<BreakdownReport>(
    `/api/reports/breakdowns?${appendFiltersToQs(qs, filters)}`,
  );
  return data;
}

export async function fetchAging(filters?: ReportFilters): Promise<AgingBucket[]> {
  const qs = appendFiltersToQs("", filters);
  const url = qs ? `/api/reports/aging?${qs}` : "/api/reports/aging";
  const { data } = await axios.get<{ aging: AgingBucket[] }>(url);
  return data.aging;
}

export async function fetchTopOpenTickets(filters?: ReportFilters): Promise<TopOpenTicket[]> {
  const qs = appendFiltersToQs("", filters);
  const url = qs ? `/api/reports/top-open-tickets?${qs}` : "/api/reports/top-open-tickets";
  const { data } = await axios.get<{ tickets: TopOpenTicket[] }>(url);
  return data.tickets;
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export async function fetchVolume(
  period: PeriodOption | string,
  filters?: ReportFilters,
): Promise<VolumePoint[]> {
  const qs = appendFiltersToQs(rangeQS(periodToRange(period)), filters);
  const { data } = await axios.get<{ data: VolumePoint[] }>(`/api/reports/volume?${qs}`);
  return data.data;
}

export async function fetchBacklogTrend(
  period: PeriodOption | string,
  filters?: ReportFilters,
): Promise<BacklogPoint[]> {
  const qs = appendFiltersToQs(`period=${period}`, filters);
  const { data } = await axios.get<{ data: BacklogPoint[] }>(`/api/reports/backlog-trend?${qs}`);
  return data.data;
}

export async function fetchBreakdowns(
  periodOrQs: PeriodOption | string,
  filters?: ReportFilters,
): Promise<BreakdownReport> {
  const baseQs = periodOrQs.includes("=") ? periodOrQs : rangeQS(periodToRange(periodOrQs));
  const qs = appendFiltersToQs(baseQs, filters);
  const { data } = await axios.get<BreakdownReport>(`/api/reports/breakdowns?${qs}`);
  return data;
}

export async function fetchResolutionDistribution(
  period: PeriodOption | string,
  filters?: ReportFilters,
): Promise<ResolutionBucket[]> {
  const qs = appendFiltersToQs(`period=${period}`, filters);
  const { data } = await axios.get<{ buckets: ResolutionBucket[] }>(
    `/api/reports/resolution-distribution?${qs}`,
  );
  return data.buckets;
}

export async function fetchFcr(
  period: PeriodOption | string,
  filters?: ReportFilters,
): Promise<FcrReport> {
  const qs = appendFiltersToQs(`period=${period}`, filters);
  const { data } = await axios.get<FcrReport>(`/api/reports/fcr?${qs}`);
  return data;
}

// ── SLA & Agents ──────────────────────────────────────────────────────────────

export async function fetchSlaByDimension(
  period: PeriodOption | string,
  filters?: ReportFilters,
): Promise<SlaByDimensionReport> {
  const qs = appendFiltersToQs(rangeQS(periodToRange(period)), filters);
  const { data } = await axios.get<SlaByDimensionReport>(`/api/reports/sla-by-dimension?${qs}`);
  return data;
}

export async function fetchAgentLeaderboard(
  period: PeriodOption | string,
  filters?: ReportFilters,
): Promise<AgentLeaderboardEntry[]> {
  const qs = appendFiltersToQs(`period=${period}`, filters);
  const { data } = await axios.get<{ agents: AgentLeaderboardEntry[] }>(
    `/api/reports/agent-leaderboard?${qs}`,
  );
  return data.agents;
}

// ── Section-specific filters (incidents/changes/problems/etc) ────────────────
//
// These sections take a free-form bag of filter URL params (e.g.
// incidentPriority, changeType, csatRating). The bag mirrors the active URL
// search params so callers can pass `Object.fromEntries(searchParams)` and
// be done with it.

function appendBag(qs: string, bag?: Record<string, string | undefined>): string {
  if (!bag) return qs;
  const p = new URLSearchParams(qs);
  for (const [k, v] of Object.entries(bag)) {
    if (v) p.set(k, v);
  }
  return p.toString();
}

// ── Incidents ─────────────────────────────────────────────────────────────────

export async function fetchIncidentReport(
  period: PeriodOption | string,
  bag?: Record<string, string | undefined>,
): Promise<IncidentReport> {
  const qs = appendBag(`period=${period}`, bag);
  const { data } = await axios.get<IncidentReport>(`/api/reports/incidents?${qs}`);
  return data;
}

// ── CSAT ──────────────────────────────────────────────────────────────────────

export async function fetchCsatTrend(
  period: PeriodOption | string,
  bag?: Record<string, string | undefined>,
): Promise<CsatPoint[]> {
  const qs = appendBag(`period=${period}`, bag);
  const { data } = await axios.get<{ data: CsatPoint[] }>(`/api/reports/csat-trend?${qs}`);
  return data.data;
}

export async function fetchCsatBreakdown(period: PeriodOption | string): Promise<CsatBreakdown> {
  const { data } = await axios.get<CsatBreakdown>(`/api/reports/csat-breakdown?period=${period}`);
  return data;
}

// ── Operational health ────────────────────────────────────────────────────────

export async function fetchOperationalHealth(): Promise<OperationalHealth> {
  const { data } = await axios.get<OperationalHealth>("/api/reports/operational-health");
  return data;
}

// ── Phase 2-4 ─────────────────────────────────────────────────────────────────

export async function fetchRequestReport(
  period: PeriodOption | string,
  bag?: Record<string, string | undefined>,
): Promise<RequestReport> {
  const qs = appendBag(`period=${period}`, bag);
  const { data } = await axios.get<RequestReport>(`/api/reports/requests?${qs}`);
  return data;
}

export async function fetchProblemReport(
  period: PeriodOption | string,
  bag?: Record<string, string | undefined>,
): Promise<ProblemReport> {
  const qs = appendBag(`period=${period}`, bag);
  const { data } = await axios.get<ProblemReport>(`/api/reports/problems?${qs}`);
  return data;
}

export async function fetchApprovalReport(
  period: PeriodOption | string,
  bag?: Record<string, string | undefined>,
): Promise<ApprovalReport> {
  const qs = appendBag(`period=${period}`, bag);
  const { data } = await axios.get<ApprovalReport>(`/api/reports/approvals?${qs}`);
  return data;
}

export async function fetchChangeReport(
  period: PeriodOption | string,
  bag?: Record<string, string | undefined>,
): Promise<ChangeReport> {
  const qs = appendBag(`period=${period}`, bag);
  const { data } = await axios.get<ChangeReport>(`/api/reports/changes?${qs}`);
  return data;
}

export async function fetchKbSearchStats(period: PeriodOption | string): Promise<KbSearchStatsReport> {
  const { data } = await axios.get<KbSearchStatsReport>(
    `/api/reports/kb-search-stats?period=${period}`,
  );
  return data;
}

// ── Assets ────────────────────────────────────────────────────────────────────

export async function fetchAssetReport(periodOrQs: PeriodOption | string): Promise<AssetReport> {
  const qs = periodOrQs.includes("=") ? periodOrQs : `period=${periodOrQs}`;
  const { data } = await axios.get<AssetReport>(`/api/reports/assets?${qs}`);
  return data;
}

// ── Insights (cross-module relationship analytics) ────────────────────────────

function insightsQS(periodOrQs: string): string {
  return periodOrQs.includes("=") ? periodOrQs : `period=${periodOrQs}`;
}

export async function fetchInsightsOverview(periodOrQs: string): Promise<InsightsOverview> {
  const { data } = await axios.get<InsightsOverview>(`/api/reports/insights/overview?${insightsQS(periodOrQs)}`);
  return data;
}

export async function fetchInsightsAssetImpact(periodOrQs: string): Promise<InsightsAssetImpact> {
  const { data } = await axios.get<InsightsAssetImpact>(`/api/reports/insights/asset-impact?${insightsQS(periodOrQs)}`);
  return data;
}

export async function fetchInsightsProblemChains(periodOrQs: string): Promise<InsightsProblemChains> {
  const { data } = await axios.get<InsightsProblemChains>(`/api/reports/insights/problem-chains?${insightsQS(periodOrQs)}`);
  return data;
}

export async function fetchInsightsChangeRisk(periodOrQs: string): Promise<InsightsChangeRisk> {
  const { data } = await axios.get<InsightsChangeRisk>(`/api/reports/insights/change-risk?${insightsQS(periodOrQs)}`);
  return data;
}

export async function fetchInsightsServiceHealth(periodOrQs: string): Promise<InsightsServiceHealth> {
  const { data } = await axios.get<InsightsServiceHealth>(`/api/reports/insights/service-health?${insightsQS(periodOrQs)}`);
  return data;
}

export async function fetchInsightsTickets(periodOrQs: string): Promise<InsightsTickets> {
  const { data } = await axios.get<InsightsTickets>(`/api/reports/insights/tickets?${insightsQS(periodOrQs)}`);
  return data;
}

export async function fetchInsightsCiImpact(periodOrQs: string): Promise<InsightsCiImpact> {
  const { data } = await axios.get<InsightsCiImpact>(`/api/reports/insights/ci-impact?${insightsQS(periodOrQs)}`);
  return data;
}
