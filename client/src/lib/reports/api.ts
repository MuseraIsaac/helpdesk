/**
 * Typed API layer for the /api/reports/* endpoints.
 *
 * Each function corresponds to one server route and returns the data payload
 * directly (unwrapping the Axios response envelope). Callers can pass the
 * function reference directly to TanStack Query's `queryFn`.
 */
import axios from "axios";
import { periodToRange, rangeQS } from "./utils";
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
} from "./types";

// ── Overview ──────────────────────────────────────────────────────────────────

/** Accept either a period string ("30") or a pre-built QS fragment ("from=X&to=Y"). */
export async function fetchOverview(periodOrQs: PeriodOption | string): Promise<ReportOverview> {
  const qs = periodOrQs.includes("=")
    ? periodOrQs
    : rangeQS(periodToRange(periodOrQs));
  const { data } = await axios.get<ReportOverview>(`/api/reports/overview?${qs}`);
  return data;
}

export async function fetchBreakdownsQs(qs: string): Promise<BreakdownReport> {
  const { data } = await axios.get<BreakdownReport>(`/api/reports/breakdowns?${qs}`);
  return data;
}

export async function fetchAging(): Promise<AgingBucket[]> {
  const { data } = await axios.get<{ aging: AgingBucket[] }>("/api/reports/aging");
  return data.aging;
}

export async function fetchTopOpenTickets(): Promise<TopOpenTicket[]> {
  const { data } = await axios.get<{ tickets: TopOpenTicket[] }>("/api/reports/top-open-tickets");
  return data.tickets;
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export async function fetchVolume(period: PeriodOption | string): Promise<VolumePoint[]> {
  const qs = rangeQS(periodToRange(period));
  const { data } = await axios.get<{ data: VolumePoint[] }>(`/api/reports/volume?${qs}`);
  return data.data;
}

export async function fetchBacklogTrend(period: PeriodOption | string): Promise<BacklogPoint[]> {
  const { data } = await axios.get<{ data: BacklogPoint[] }>(
    `/api/reports/backlog-trend?period=${period}`,
  );
  return data.data;
}

export async function fetchBreakdowns(periodOrQs: PeriodOption | string): Promise<BreakdownReport> {
  const qs = periodOrQs.includes("=")
    ? periodOrQs
    : rangeQS(periodToRange(periodOrQs));
  const { data } = await axios.get<BreakdownReport>(`/api/reports/breakdowns?${qs}`);
  return data;
}

export async function fetchResolutionDistribution(
  period: PeriodOption | string,
): Promise<ResolutionBucket[]> {
  const { data } = await axios.get<{ buckets: ResolutionBucket[] }>(
    `/api/reports/resolution-distribution?period=${period}`,
  );
  return data.buckets;
}

export async function fetchFcr(period: PeriodOption | string): Promise<FcrReport> {
  const { data } = await axios.get<FcrReport>(`/api/reports/fcr?period=${period}`);
  return data;
}

// ── SLA & Agents ──────────────────────────────────────────────────────────────

export async function fetchSlaByDimension(
  period: PeriodOption | string,
): Promise<SlaByDimensionReport> {
  const qs = rangeQS(periodToRange(period));
  const { data } = await axios.get<SlaByDimensionReport>(`/api/reports/sla-by-dimension?${qs}`);
  return data;
}

export async function fetchAgentLeaderboard(
  period: PeriodOption | string,
): Promise<AgentLeaderboardEntry[]> {
  const { data } = await axios.get<{ agents: AgentLeaderboardEntry[] }>(
    `/api/reports/agent-leaderboard?period=${period}`,
  );
  return data.agents;
}

// ── Incidents ─────────────────────────────────────────────────────────────────

export async function fetchIncidentReport(period: PeriodOption | string): Promise<IncidentReport> {
  const { data } = await axios.get<IncidentReport>(`/api/reports/incidents?period=${period}`);
  return data;
}

// ── CSAT ──────────────────────────────────────────────────────────────────────

export async function fetchCsatTrend(period: PeriodOption | string): Promise<CsatPoint[]> {
  const { data } = await axios.get<{ data: CsatPoint[] }>(
    `/api/reports/csat-trend?period=${period}`,
  );
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

export async function fetchRequestReport(period: PeriodOption | string): Promise<RequestReport> {
  const { data } = await axios.get<RequestReport>(`/api/reports/requests?period=${period}`);
  return data;
}

export async function fetchProblemReport(period: PeriodOption | string): Promise<ProblemReport> {
  const { data } = await axios.get<ProblemReport>(`/api/reports/problems?period=${period}`);
  return data;
}

export async function fetchApprovalReport(period: PeriodOption | string): Promise<ApprovalReport> {
  const { data } = await axios.get<ApprovalReport>(`/api/reports/approvals?period=${period}`);
  return data;
}

export async function fetchChangeReport(period: PeriodOption | string): Promise<ChangeReport> {
  const { data } = await axios.get<ChangeReport>(`/api/reports/changes?period=${period}`);
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
