/**
 * Insights Report — relationship-based cross-module analytics.
 *
 * Five drill-down tabs, each backed by a dedicated insights endpoint:
 *
 *   Overview       — fleet-wide cross-module KPI summary
 *   Asset Impact   — leaderboard: assets driving the most incidents/problems/changes
 *   Problem Chains — root-cause chains: incident recurrence per problem
 *   Change Risk    — change risk & failure correlation by scope / risk level
 *   Service Health — catalog-item health via linked assets & requests
 *
 * Visualizations used:
 *   KPI strip cards, stacked horizontal bars, donut/pie charts, impact-matrix
 *   heatmap (CSS grid), leaderboard tables, drill-down tables with nav links.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, PieChart, Pie,
  Tooltip as RTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import ErrorAlert from "@/components/ErrorAlert";
import {
  fetchInsightsOverview,
  fetchInsightsAssetImpact,
  fetchInsightsProblemChains,
  fetchInsightsChangeRisk,
  fetchInsightsServiceHealth,
  fetchInsightsTickets,
} from "@/lib/reports/api";
import { periodToRange, rangeQS } from "@/lib/reports/utils";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, Server, Bug, GitBranch, Package, ArrowRight,
  CheckCircle2, XCircle, Clock, Zap, ShieldAlert, Network,
  TrendingUp, ExternalLink, Ticket as TicketIcon, Users, Moon, Sun,
  Calendar, User, Link2, Hash,
} from "lucide-react";

// ── Palette ────────────────────────────────────────────────────────────────────

const C = {
  incident: "#F43F5E",  // rose-500
  problem:  "#F97316",  // orange-500
  change:   "#F59E0B",  // amber-500
  request:  "#0EA5E9",  // sky-500
  ticket:   "#8B5CF6",  // violet-500
  asset:    "#10B981",  // emerald-500
  service:  "#14B8A6",  // teal-500
  success:  "#22C55E",  // green-500
  fail:     "#EF4444",  // red-500
  muted:    "#94A3B8",  // slate-400
};

const RISK_COLOR: Record<string, string> = {
  low:      "#22C55E",
  medium:   "#F59E0B",
  high:     "#F97316",
  critical: "#EF4444",
  unset:    "#94A3B8",
};

const STATUS_COLOR: Record<string, string> = {
  open:        "#F43F5E",
  investigating: "#F97316",
  identified:  "#F59E0B",
  known_error: "#EF4444",
  resolved:    "#22C55E",
  closed:      "#94A3B8",
  draft:       "#94A3B8",
  submitted:   "#60A5FA",
  scheduled:   "#8B5CF6",
  implement:   "#3B82F6",
  failed:      "#EF4444",
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

function pct(n: number, total: number) {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize border"
      style={{ color, borderColor: `${color}40`, background: `${color}15` }}
    >
      {label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const color = RISK_COLOR[risk] ?? C.muted;
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize border"
      style={{ color, borderColor: `${color}40`, background: `${color}15` }}
    >
      {risk}
    </span>
  );
}

/** Rank badge: 1st = gold, 2nd = silver, 3rd = bronze */
function RankBadge({ rank }: { rank: number }) {
  const colors = ["#F59E0B", "#94A3B8", "#CD7F32"];
  const bg = colors[rank - 1] ?? undefined;
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
      style={{ background: bg ?? "#E2E8F0", color: bg ? "white" : "#64748B" }}
    >
      {rank}
    </span>
  );
}

/** Compact impact pill strip — shows N metric colored dots */
function ImpactStrip({
  items,
}: {
  items: { count: number; color: string; title: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.filter(i => i.count > 0).map(i => (
        <span
          key={i.title}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
          style={{ color: i.color, borderColor: `${i.color}40`, background: `${i.color}12` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.color }} />
          {i.count.toLocaleString()} {i.title}
        </span>
      ))}
    </div>
  );
}

/** Health score bar (0–100, lower = riskier) */
function HealthBar({ score }: { score: number }) {
  const color = score >= 80 ? C.success : score >= 50 ? C.change : C.fail;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

/** Stacked horizontal bar used for the asset leaderboard */
function StackedBar({
  incidents, problems, changes, requests, tickets, max,
}: {
  incidents: number; problems: number; changes: number;
  requests: number; tickets: number; max: number;
}) {
  if (max === 0) return <div className="h-2 w-full bg-muted/30 rounded-full" />;
  const total = incidents + problems + changes + requests + tickets;
  const w = (n: number) => `${(n / max) * 100}%`;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden gap-px" title={`Total: ${total}`}>
      {incidents > 0 && <div style={{ width: w(incidents), background: C.incident }} />}
      {problems  > 0 && <div style={{ width: w(problems),  background: C.problem  }} />}
      {changes   > 0 && <div style={{ width: w(changes),   background: C.change   }} />}
      {requests  > 0 && <div style={{ width: w(requests),  background: C.request  }} />}
      {tickets   > 0 && <div style={{ width: w(tickets),   background: C.ticket   }} />}
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ qs }: { qs: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", "overview", qs],
    queryFn:  () => fetchInsightsOverview(qs),
    staleTime: 60_000,
  });

  if (isLoading) return <ReportLoading kpiCount={6} chartCount={2} />;
  if (error || !data) return <ErrorAlert error={error as Error} fallback="Failed to load insights overview" />;

  const donutData = data.linksByType.filter(l => l.count > 0);
  const donutColors = [C.incident, C.problem, C.change, C.request, C.ticket];
  const totalLinks = data.totalCrossModuleLinks;
  const linkedPct = data.problems.withIncidents > 0 && data.problems.total > 0
    ? Math.round((data.problems.withIncidents / data.problems.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Cross-Module Links"
          value={totalLinks.toLocaleString()}
          sub="active relationships in system"
          icon={<Network className="h-4 w-4" />}
          variant="info"
        />
        <KpiCard
          title="Assets — Open Incidents"
          value={data.assets.withOpenIncidents}
          sub="assets affected right now"
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={data.assets.withOpenIncidents > 0 ? "danger" : "success"}
        />
        <KpiCard
          title="Assets — Open Problems"
          value={data.assets.withOpenProblems}
          sub="assets with known root cause"
          icon={<Bug className="h-4 w-4" />}
          variant={data.assets.withOpenProblems > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="Assets — Active Changes"
          value={data.assets.inActiveChanges}
          sub="assets currently in scope"
          icon={<GitBranch className="h-4 w-4" />}
          variant="default"
        />
        <KpiCard
          title="Recurring Problems"
          value={data.problems.recurring}
          sub={`${linkedPct}% of problems have incidents`}
          icon={<Zap className="h-4 w-4" />}
          variant={data.problems.recurring > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="Standalone Incidents"
          value={data.standaloneIncidents}
          sub="not linked to any problem"
          icon={<ShieldAlert className="h-4 w-4" />}
          variant={data.standaloneIncidents > 5 ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Relationship distribution donut */}
        <ChartCard
          title="Cross-Module Link Distribution"
          description="Breakdown of all asset-to-ITIL-entity links in the system."
          accentColor="bg-fuchsia-500"
        >
          {donutData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No cross-module links found.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={donutData} dataKey="count" nameKey="label"
                    cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={donutColors[i % donutColors.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <RTooltip formatter={(v: number) => [v.toLocaleString(), ""]} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-2">
                {donutData.map((l, i) => (
                  <li key={l.type} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: donutColors[i % donutColors.length] }} />
                    <span className="flex-1 text-muted-foreground">{l.label}</span>
                    <span className="font-semibold tabular-nums">{l.count.toLocaleString()}</span>
                    <span className="text-muted-foreground/60">{pct(l.count, totalLinks)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        {/* Asset incident distribution */}
        <ChartCard
          title="Assets by Incident Exposure"
          description="How many open incidents does each asset carry?"
          accentColor="bg-rose-500"
        >
          <ChartContainer
            config={{ count: { label: "Assets", color: C.incident } }}
            className="h-44"
          >
            <BarChart data={data.incidentDistribution} barSize={36}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.incidentDistribution.map((e) => (
                  <Cell key={e.bucket} fill={e.bucket === "0" ? C.muted : C.incident} fillOpacity={e.bucket === "0" ? 0.3 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Top impacted assets table */}
      <ChartCard
        title="Top Impacted Assets"
        description="Assets with the highest number of cross-module links — likely root-cause candidates."
        accentColor="bg-emerald-500"
      >
        {data.topImpactedAssets.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4">No linked assets found for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6">#</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-center" style={{ color: C.incident }}>Incidents</TableHead>
                <TableHead className="text-center" style={{ color: C.problem  }}>Problems</TableHead>
                <TableHead className="text-center" style={{ color: C.change   }}>Changes</TableHead>
                <TableHead className="text-center" style={{ color: C.request  }}>Requests</TableHead>
                <TableHead className="text-center" style={{ color: C.ticket   }}>Tickets</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topImpactedAssets.map((a, i) => (
                <TableRow key={a.id} className="group">
                  <TableCell><RankBadge rank={i + 1} /></TableCell>
                  <TableCell>
                    <Link to={`/assets/${a.id}`} className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                      <Server className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold leading-tight">{a.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{a.assetNumber} · {a.type.replace(/_/g, " ")}</p>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold tabular-nums" style={{ color: a.incidents > 0 ? C.incident : undefined }}>{a.incidents}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold tabular-nums" style={{ color: a.problems > 0 ? C.problem : undefined }}>{a.problems}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold tabular-nums" style={{ color: a.changes > 0 ? C.change : undefined }}>{a.changes}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="tabular-nums text-muted-foreground">{a.requests}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="tabular-nums text-muted-foreground">{a.tickets}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-bold tabular-nums">{a.total}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ChartCard>
    </div>
  );
}

// ── Asset Impact tab ───────────────────────────────────────────────────────────

function AssetImpactTab({ qs }: { qs: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", "asset-impact", qs],
    queryFn:  () => fetchInsightsAssetImpact(qs),
    staleTime: 60_000,
  });

  if (isLoading) return <ReportLoading kpiCount={3} chartCount={2} />;
  if (error || !data) return <ErrorAlert error={error as Error} fallback="Failed to load asset impact" />;

  const maxTotal = Math.max(...data.topAssets.map(a => a.total), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Concurrent Risk Assets"
          value={data.concurrentRisk.length}
          sub="open incident + active change at same time"
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={data.concurrentRisk.length > 0 ? "danger" : "success"}
        />
        <KpiCard
          title="Most Impacted Asset"
          value={data.topAssets[0]?.name ?? "—"}
          sub={data.topAssets[0] ? `${data.topAssets[0].total} total cross-module links` : "No linked assets"}
          icon={<Server className="h-4 w-4" />}
          variant="warning"
        />
        <KpiCard
          title="Unique Asset Types with Issues"
          value={data.byAssetType.length}
          sub="asset categories carrying incidents or problems"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stacked bar: by asset type */}
        <ChartCard
          title="Issues by Asset Type"
          description="Incidents, problems, and changes stacked per asset category."
          accentColor="bg-orange-500"
        >
          {data.byAssetType.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data.</p>
          ) : (
            <ChartContainer
              config={{
                incidents: { label: "Incidents", color: C.incident },
                problems:  { label: "Problems",  color: C.problem  },
                changes:   { label: "Changes",   color: C.change   },
                requests:  { label: "Requests",  color: C.request  },
              }}
              className="h-52"
            >
              <BarChart data={data.byAssetType} layout="vertical" barCategoryGap="20%">
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="type" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={90}
                  tickFormatter={v => v.replace(/_/g, " ")} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="incidents" stackId="a" fill={C.incident} radius={[0, 0, 0, 0]} />
                <Bar dataKey="problems"  stackId="a" fill={C.problem}  />
                <Bar dataKey="changes"   stackId="a" fill={C.change}   />
                <Bar dataKey="requests"  stackId="a" fill={C.request}  radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ChartContainer>
          )}
        </ChartCard>

        {/* Concurrent risk assets */}
        <ChartCard
          title="Concurrent Risk — Open Incident + Active Change"
          description="Assets undergoing a change while already experiencing an open incident. Highest deployment risk."
          accentColor="bg-red-500"
        >
          {data.concurrentRisk.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm text-muted-foreground">No assets in concurrent risk state.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.concurrentRisk.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-rose-200/50 bg-rose-50/40 dark:border-rose-800/30 dark:bg-rose-950/20">
                  <div className="flex-1 min-w-0">
                    <Link to={`/assets/${a.id}`} className="text-sm font-semibold hover:text-primary transition-colors truncate block">
                      {a.name}
                    </Link>
                    <p className="font-mono text-[10px] text-muted-foreground">{a.assetNumber} · {a.type.replace(/_/g, " ")}</p>
                  </div>
                  <ImpactStrip items={[
                    { count: a.openIncidents, color: C.incident, title: "open inc." },
                    { count: a.activeChanges, color: C.change,   title: "active chg." },
                  ]} />
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Full asset leaderboard with stacked bars */}
      <ChartCard
        title="Asset Impact Leaderboard"
        description="All assets ranked by total cross-module links. Bar shows breakdown by entity type."
        accentColor="bg-emerald-500"
        contentClassName="p-0"
      >
        <div className="divide-y divide-border/40">
          <div className="grid grid-cols-[2rem_1fr_6rem_3.5rem_3.5rem_3.5rem_3.5rem_3.5rem_4.5rem] gap-x-3 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            <span>#</span>
            <span>Asset</span>
            <span>Impact bar</span>
            <span className="text-center" style={{ color: C.incident }}>Inc.</span>
            <span className="text-center" style={{ color: C.problem  }}>Prob.</span>
            <span className="text-center" style={{ color: C.change   }}>Chg.</span>
            <span className="text-center" style={{ color: C.request  }}>Req.</span>
            <span className="text-center" style={{ color: C.ticket   }}>Tix.</span>
            <span className="text-right">Total</span>
          </div>
          {data.topAssets.map((a, i) => (
            <div key={a.id} className="grid grid-cols-[2rem_1fr_6rem_3.5rem_3.5rem_3.5rem_3.5rem_3.5rem_4.5rem] gap-x-3 items-center px-5 py-2.5 hover:bg-muted/30 transition-colors">
              <RankBadge rank={i + 1} />
              <div className="min-w-0">
                <Link to={`/assets/${a.id}`} className="text-sm font-semibold hover:text-primary transition-colors truncate block leading-tight">
                  {a.name}
                </Link>
                <p className="font-mono text-[10px] text-muted-foreground truncate">{a.assetNumber}</p>
              </div>
              <StackedBar
                incidents={a.incidents} problems={a.problems} changes={a.changes}
                requests={a.requests} tickets={a.tickets} max={maxTotal}
              />
              <span className="text-center text-sm font-semibold tabular-nums" style={{ color: a.incidents > 0 ? C.incident : undefined }}>{a.incidents}</span>
              <span className="text-center text-sm font-semibold tabular-nums" style={{ color: a.problems  > 0 ? C.problem  : undefined }}>{a.problems}</span>
              <span className="text-center text-sm font-semibold tabular-nums" style={{ color: a.changes   > 0 ? C.change   : undefined }}>{a.changes}</span>
              <span className="text-center text-sm text-muted-foreground tabular-nums">{a.requests}</span>
              <span className="text-center text-sm text-muted-foreground tabular-nums">{a.tickets}</span>
              <span className="text-right font-bold tabular-nums">{a.total}</span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-border/40 bg-muted/20">
          {[
            { label: "Incidents", color: C.incident },
            { label: "Problems",  color: C.problem  },
            { label: "Changes",   color: C.change   },
            { label: "Requests",  color: C.request  },
            { label: "Tickets",   color: C.ticket   },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />{l.label}
            </span>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

// ── Problem Chains tab ─────────────────────────────────────────────────────────

function ProblemChainsTab({ qs }: { qs: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", "problem-chains", qs],
    queryFn:  () => fetchInsightsProblemChains(qs),
    staleTime: 60_000,
  });

  if (isLoading) return <ReportLoading kpiCount={3} chartCount={2} />;
  if (error || !data) return <ErrorAlert error={error as Error} fallback="Failed to load problem chains" />;

  const r = data.resolutionBreakdown;
  const resDonutData = [
    { name: "No change linked",     value: r.noChange,         fill: C.muted    },
    { name: "Change in progress",   value: r.changeInProgress, fill: C.change   },
    { name: "Change resolved",      value: r.changeResolved,   fill: C.success  },
    { name: "Change failed",        value: r.changeFailed,     fill: C.fail     },
    { name: "Change terminal",      value: r.changeTerminal,   fill: C.muted    },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Avg Incidents / Problem"
          value={data.avgIncidentsPerProblem.toFixed(1)}
          sub="mean recurrence rate"
          icon={<Bug className="h-4 w-4" />}
          variant={data.avgIncidentsPerProblem > 2 ? "danger" : data.avgIncidentsPerProblem > 1 ? "warning" : "success"}
        />
        <KpiCard
          title="Problems with No Change"
          value={data.resolutionBreakdown.noChange}
          sub="no linked change request — unresolved"
          icon={<XCircle className="h-4 w-4" />}
          variant={data.resolutionBreakdown.noChange > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="Problems Resolved via Change"
          value={data.resolutionBreakdown.changeResolved}
          sub="change deployed and closed"
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant="success"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recurrence distribution bar */}
        <ChartCard
          title="Incident Recurrence Distribution"
          description="How many incidents has each problem spawned? High bars on the right signal chronic issues."
          accentColor="bg-orange-500"
        >
          <ChartContainer
            config={{ count: { label: "Problems", color: C.problem } }}
            className="h-44"
          >
            <BarChart data={data.recurrenceDistribution} barSize={40}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.recurrenceDistribution.map((e) => (
                  <Cell key={e.bucket}
                    fill={e.bucket === "0" ? C.muted : e.bucket === "1" ? C.change : e.bucket === "2–5" ? C.problem : C.fail}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Resolution via change donut */}
        <ChartCard
          title="Problem Resolution via Change Request"
          description="Are problems being resolved through the change management process?"
          accentColor="bg-purple-500"
        >
          {resDonutData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No problems in period.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={resDonutData} dataKey="value" cx="50%" cy="50%"
                    innerRadius={38} outerRadius={64} paddingAngle={2}>
                    {resDonutData.map((d, i) => <Cell key={i} fill={d.fill} stroke="transparent" />)}
                  </Pie>
                  <RTooltip formatter={(v: number) => [v, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-1.5">
                {resDonutData.map(d => (
                  <li key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.fill }} />
                    <span className="flex-1 text-muted-foreground leading-tight">{d.name}</span>
                    <span className="font-semibold tabular-nums">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Top problems table */}
      <ChartCard
        title="Top Problems by Incident Count"
        description="Problems ranked by how many incidents they have generated. Drill into each to find the root asset."
        accentColor="bg-orange-500"
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6">#</TableHead>
              <TableHead>Problem</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Incidents</TableHead>
              <TableHead className="text-center">Assets</TableHead>
              <TableHead>Linked Change</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.topProblems.map((p, i) => (
              <TableRow key={p.id} className="group">
                <TableCell><RankBadge rank={i + 1} /></TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{p.title}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{p.problemNumber}</p>
                  </div>
                </TableCell>
                <TableCell className="text-center"><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-center">
                  <span className="font-bold tabular-nums" style={{ color: p.incidentCount > 1 ? C.fail : p.incidentCount === 1 ? C.change : undefined }}>
                    {p.incidentCount}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="tabular-nums text-muted-foreground">{p.assetCount}</span>
                </TableCell>
                <TableCell>
                  {p.linkedChange ? (
                    <Link to={`/changes/${p.linkedChange.id}`} className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors">
                      <GitBranch className="h-3 w-3 shrink-0" />
                      <span className="font-mono">{p.linkedChange.changeNumber}</span>
                      <StatusBadge status={p.linkedChange.state} />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground/50 italic">No change linked</span>
                  )}
                </TableCell>
                <TableCell>
                  <Link to={`/problems/${p.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {data.topProblems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No problems found for this period.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ChartCard>

      {/* Top problem-causing assets */}
      {data.topProblemAssets.length > 0 && (
        <ChartCard
          title="Top Problem-Causing Assets"
          description="Assets with the most linked problems — likely chronic failure points."
          accentColor="bg-red-500"
        >
          <div className="space-y-2">
            {data.topProblemAssets.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3">
                <RankBadge rank={i + 1} />
                <Link to={`/assets/${a.id}`} className="flex-1 min-w-0 hover:text-primary transition-colors">
                  <p className="text-sm font-semibold truncate">{a.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{a.assetNumber} · {a.type.replace(/_/g, " ")}</p>
                </Link>
                <ImpactStrip items={[
                  { count: a.openProblemCount, color: C.fail,    title: "open" },
                  { count: a.problemCount - a.openProblemCount, color: C.muted, title: "resolved" },
                ]} />
                <span className="font-bold tabular-nums text-sm w-8 text-right">{a.problemCount}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ── Change Risk tab ────────────────────────────────────────────────────────────

function ChangeRiskTab({ qs }: { qs: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", "change-risk", qs],
    queryFn:  () => fetchInsightsChangeRisk(qs),
    staleTime: 60_000,
  });

  if (isLoading) return <ReportLoading kpiCount={3} chartCount={2} />;
  if (error || !data) return <ErrorAlert error={error as Error} fallback="Failed to load change risk" />;

  const totalChanges = data.successByRisk.reduce((s, r) => s + r.total, 0);
  const totalFailed  = data.successByRisk.reduce((s, r) => s + r.failed, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Overall Change Success Rate"
          value={totalChanges > 0 ? `${(((totalChanges - totalFailed) / totalChanges) * 100).toFixed(1)}%` : "—"}
          sub={`${totalFailed} failures of ${totalChanges} total`}
          icon={<GitBranch className="h-4 w-4" />}
          variant={totalFailed / totalChanges > 0.1 ? "danger" : "success"}
        />
        <KpiCard
          title="Changes Fixing Open Problems"
          value={data.changesLinkedToOpenProblems.length}
          sub="active changes addressing known issues"
          icon={<ArrowRight className="h-4 w-4" />}
          variant="info"
        />
        <KpiCard
          title="Recent Failed Changes"
          value={data.recentFailedChanges.length}
          sub="in the selected period"
          icon={<XCircle className="h-4 w-4" />}
          variant={data.recentFailedChanges.length > 0 ? "danger" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Success rate by risk level */}
        <ChartCard
          title="Change Success Rate by Risk Level"
          description="Higher-risk changes failing more often signals a process or testing gap."
          accentColor="bg-amber-500"
        >
          <div className="space-y-3">
            {data.successByRisk.map(r => (
              <div key={r.risk} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <RiskBadge risk={r.risk} />
                    <span className="text-muted-foreground">{r.total} changes</span>
                  </div>
                  <span className="font-semibold tabular-nums"
                    style={{ color: (r.successRate ?? 0) >= 90 ? C.success : (r.successRate ?? 0) >= 70 ? C.change : C.fail }}>
                    {r.successRate != null ? `${r.successRate}% success` : "—"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${r.successRate ?? 0}%`,
                      background: (r.successRate ?? 0) >= 90 ? C.success : (r.successRate ?? 0) >= 70 ? C.change : C.fail,
                    }} />
                </div>
                <p className="text-[10px] text-muted-foreground/60">avg {r.avgAssets} assets per change</p>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Asset scope vs failure rate */}
        <ChartCard
          title="Asset Scope vs Failure Rate"
          description="Do changes touching more assets fail more often? Higher bars = higher failure rate."
          accentColor="bg-red-500"
        >
          <ChartContainer
            config={{
              changeCount: { label: "Changes",     color: C.change },
              failedCount: { label: "Failed",       color: C.fail   },
            }}
            className="h-44"
          >
            <BarChart data={data.assetScopeDistribution} barCategoryGap="25%">
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                formatter={(v, name, props) => [
                  `${v} (${props.payload.failureRate}% failure rate)`,
                  name,
                ]}
              />
              <Bar dataKey="changeCount" fill={C.change} radius={[2, 2, 0, 0]} name="Changes" />
              <Bar dataKey="failedCount" fill={C.fail}   radius={[2, 2, 0, 0]} name="Failed"  />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Changes linked to open problems */}
      {data.changesLinkedToOpenProblems.length > 0 && (
        <ChartCard
          title="Changes Addressing Open Problems"
          description="These changes are planned fixes for still-active problems. Monitor closely — failure means the problem persists."
          accentColor="bg-violet-500"
          contentClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Change</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Assets in scope</TableHead>
                <TableHead>Linked Problem</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.changesLinkedToOpenProblems.map(c => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{c.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{c.changeNumber}</p>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={c.state} /></TableCell>
                  <TableCell><RiskBadge risk={c.risk} /></TableCell>
                  <TableCell>
                    <span className="tabular-nums font-medium">{c.assetCount}</span>
                    <span className="text-muted-foreground text-xs ml-1">assets</span>
                  </TableCell>
                  <TableCell>
                    <Link to={`/problems/${c.problem.id}`} className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors">
                      <Bug className="h-3 w-3 shrink-0" />
                      <span className="font-mono">{c.problem.number}</span>
                      <StatusBadge status={c.problem.status} />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to={`/changes/${c.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
      )}

      {/* Recent failed changes */}
      {data.recentFailedChanges.length > 0 && (
        <ChartCard
          title="Recent Failed Changes"
          description="Changes that ended in a failed state — check if they caused follow-on incidents."
          accentColor="bg-red-500"
        >
          <div className="space-y-2">
            {data.recentFailedChanges.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-red-200/50 bg-red-50/30 dark:border-red-800/30 dark:bg-red-950/20">
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link to={`/changes/${c.id}`} className="text-sm font-semibold hover:text-primary transition-colors truncate block">
                    {c.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{c.changeNumber}</span>
                    <RiskBadge risk={c.risk} />
                    {c.linkedProblem && (
                      <span className="text-[10px] text-muted-foreground">→ problem {c.linkedProblem}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{c.assetCount} assets</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {new Date(c.failedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ── Service Health tab ─────────────────────────────────────────────────────────

function ServiceHealthTab({ qs }: { qs: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", "service-health", qs],
    queryFn:  () => fetchInsightsServiceHealth(qs),
    staleTime: 60_000,
  });

  if (isLoading) return <ReportLoading kpiCount={3} chartCount={2} />;
  if (error || !data) return <ErrorAlert error={error as Error} fallback="Failed to load service health" />;

  const imp = data.requestImpact;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Services with Failing Assets"
          value={data.servicesWithFailingAssets.length}
          sub="catalog items whose assets have open incidents"
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={data.servicesWithFailingAssets.length > 0 ? "danger" : "success"}
        />
        <KpiCard
          title="Requests Affected by Assets"
          value={`${imp.impactRate}%`}
          sub={`${imp.requestsAffectedByIncidents} of ${imp.requestsWithAssetLinks} linked requests`}
          icon={<Package className="h-4 w-4" />}
          variant={imp.impactRate > 20 ? "danger" : imp.impactRate > 5 ? "warning" : "success"}
        />
        <KpiCard
          title="Tracked Open Requests"
          value={imp.totalOpenRequests.toLocaleString()}
          sub={`${imp.requestsWithAssetLinks} have linked assets`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Services with failing assets — highest priority */}
      {data.servicesWithFailingAssets.length > 0 && (
        <ChartCard
          title="Services with Failing Assets"
          description="Catalog services whose supporting assets currently have open incidents — direct service risk."
          accentColor="bg-red-500"
        >
          <div className="space-y-2">
            {data.servicesWithFailingAssets.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-rose-200/50 bg-rose-50/30 dark:border-rose-800/30 dark:bg-rose-950/20">
                <RankBadge rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {s.linkedAssets} linked asset{s.linkedAssets !== 1 ? "s" : ""}
                  </p>
                </div>
                <ImpactStrip items={[
                  { count: s.assetsWithIncidents, color: C.incident, title: "assets w/ incidents" },
                  { count: s.openIncidentCount,   color: C.fail,     title: "open incidents"       },
                ]} />
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Top services by request volume + health */}
      <ChartCard
        title="Service Health Dashboard"
        description="All active catalog services ranked by request volume. Health score reflects the % of supporting assets without open incidents."
        accentColor="bg-teal-500"
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6">#</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="text-center">Requests</TableHead>
              <TableHead className="text-center">Open Req.</TableHead>
              <TableHead className="text-center">Linked Assets</TableHead>
              <TableHead className="text-center">Assets w/ Incidents</TableHead>
              <TableHead className="w-32">Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.topServices.map((s, i) => (
              <TableRow key={s.id} className="group">
                <TableCell><RankBadge rank={i + 1} /></TableCell>
                <TableCell>
                  <Link to={`/catalog/${s.id}`} className="text-sm font-semibold hover:text-primary transition-colors">
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell className="text-center font-semibold tabular-nums">{s.requestCount}</TableCell>
                <TableCell className="text-center">
                  <span className="tabular-nums" style={{ color: s.openRequests > 0 ? C.change : undefined }}>
                    {s.openRequests}
                  </span>
                </TableCell>
                <TableCell className="text-center text-muted-foreground tabular-nums">{s.assetCount}</TableCell>
                <TableCell className="text-center">
                  {s.assetsWithIncidents > 0 ? (
                    <span className="font-semibold tabular-nums" style={{ color: C.fail }}>
                      {s.assetsWithIncidents}
                    </span>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <HealthBar score={s.healthScore} />
                </TableCell>
              </TableRow>
            ))}
            {data.topServices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No services found. Link assets to catalog items to enable service health tracking.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ChartCard>

      {/* Services by change activity */}
      {data.servicesByChange.length > 0 && (
        <ChartCard
          title="Services Most Frequently Changed"
          description="Services with the most change requests in the period — high change velocity can indicate instability."
          accentColor="bg-amber-500"
        >
          <ChartContainer
            config={{
              changeCount: { label: "Changes", color: C.change },
              failedCount: { label: "Failed",  color: C.fail   },
            }}
            className="h-48"
          >
            <BarChart data={data.servicesByChange.slice(0, 10)} layout="vertical" barCategoryGap="20%">
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={120} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="changeCount" fill={C.change} radius={[0, 2, 2, 0]} name="Changes" />
              <Bar dataKey="failedCount" fill={C.fail}   radius={[0, 2, 2, 0]} name="Failed"  />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      )}
    </div>
  );
}

// ── Tickets Insights tab ───────────────────────────────────────────────────────

const PRIORITY_ORDER  = ["urgent","high","medium","low","unset"];
const STATUS_ORDER    = ["open","in_progress","resolved","closed","new"];
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#F43F5E", high: "#F97316", medium: "#F59E0B", low: "#60A5FA", unset: C.muted,
};
const SOURCE_LABEL: Record<string, string> = {
  email: "Email", portal: "Portal", agent: "Agent-Created",
  api: "API", unknown: "Unknown", chat: "Chat",
  whatsapp: "WhatsApp", slack_teams: "Slack/Teams", voice: "Voice", social: "Social",
};
const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/** Tiny heat-cell used in the hour-of-day and priority×status grids */
function HeatCell({ count, max, label, sublabel }: { count: number; max: number; label: string; sublabel?: string }) {
  const intensity = max > 0 ? count / max : 0;
  const bg = intensity === 0
    ? "bg-muted/20"
    : `rgba(139,92,246,${0.12 + intensity * 0.82})`;   // violet gradient
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md p-1 text-center transition-all hover:ring-1 hover:ring-primary/30 cursor-default"
      style={{ background: bg, minHeight: 44 }}
      title={`${label}: ${count.toLocaleString()} tickets`}
    >
      <span className="text-[10px] font-semibold tabular-nums leading-tight" style={{ color: intensity > 0.5 ? "white" : undefined }}>
        {count > 0 ? count : ""}
      </span>
      {sublabel && (
        <span className="text-[9px] leading-none mt-0.5" style={{ color: intensity > 0.5 ? "rgba(255,255,255,0.75)" : undefined, opacity: intensity > 0 ? 1 : 0.5 }}>
          {sublabel}
        </span>
      )}
    </div>
  );
}

function TicketsTab({ qs }: { qs: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", "tickets", qs],
    queryFn:  () => fetchInsightsTickets(qs),
    staleTime: 60_000,
  });

  if (isLoading) return <ReportLoading kpiCount={6} chartCount={4} />;
  if (error || !data) return <ErrorAlert error={error as Error} fallback="Failed to load ticket insights" />;

  const r   = data.relationships;
  const maxHour = Math.max(...data.byHourOfDay.map(h => h.count), 1);
  const maxDom  = Math.max(...data.byDayOfMonth.map(d => d.count), 1);

  // Priority × status matrix
  const statuses   = STATUS_ORDER.filter(s => data.priorityStatusMatrix.some(r2 => r2.status === s));
  const priorities = PRIORITY_ORDER.filter(p => data.priorityStatusMatrix.some(r2 => r2.priority === p));
  const matrixMap  = new Map(data.priorityStatusMatrix.map(r2 => [`${r2.priority}|${r2.status}`, r2.count]));
  const matrixMax  = Math.max(...data.priorityStatusMatrix.map(r2 => r2.count), 1);

  // Relationship donut data
  const relDonut = [
    { name: "Linked to Incident",  value: r.withIncident, fill: C.incident },
    { name: "Linked to Request",   value: r.withRequest,  fill: C.request  },
    { name: "Linked to Problem",   value: r.withProblem,  fill: C.problem  },
    { name: "Linked to Asset",     value: r.withAsset,    fill: C.asset    },
    { name: "Linked to CI",        value: r.withCi,       fill: "#A855F7"  },
    { name: "No relationship",     value: r.standalone,   fill: C.muted    },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard title="Total Tickets" value={r.total.toLocaleString()} icon={<TicketIcon className="h-4 w-4" />}
          sub="in selected period" variant="info" />
        <KpiCard title="Spawned Incidents" value={r.withIncident}
          sub={`${r.total > 0 ? Math.round(r.withIncident/r.total*100) : 0}% conversion rate`}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={r.withIncident > 0 ? "warning" : "default"} />
        <KpiCard title="Linked to Problem" value={r.withProblem}
          sub="tickets with known root cause" icon={<Bug className="h-4 w-4" />}
          variant={r.withProblem > 0 ? "warning" : "default"} />
        <KpiCard title="Linked to Asset"  value={r.withAsset}
          sub="tickets with asset context" icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Linked to CI"     value={r.withCi}
          sub="tickets with CI context"    icon={<Hash className="h-4 w-4" />} />
        <KpiCard title="No Relationship"  value={r.standalone}
          sub={`${r.total > 0 ? Math.round(r.standalone/r.total*100) : 0}% fully standalone`}
          icon={<Link2 className="h-4 w-4" />}
          variant={r.standalone / Math.max(r.total, 1) > 0.7 ? "warning" : "default"} />
      </div>

      {/* ── Relationship profile + Category breakdown ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Relationship breakdown donut */}
        <ChartCard title="Cross-Module Relationship Profile"
          description="What proportion of tickets are connected to other ITSM records? Standalone tickets represent a gap in traceability."
          accentColor="bg-violet-500">
          {relDonut.length === 0
            ? <p className="text-sm text-muted-foreground text-center py-8">No relationship data.</p>
            : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie data={relDonut} dataKey="value" cx="50%" cy="50%"
                      innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {relDonut.map((d, i) => <Cell key={i} fill={d.fill} stroke="transparent" />)}
                    </Pie>
                    <RTooltip formatter={(v: number) => [v.toLocaleString(), ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-2">
                  {relDonut.map(d => (
                    <li key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.fill }} />
                      <span className="flex-1 text-muted-foreground">{d.name}</span>
                      <span className="font-semibold tabular-nums">{d.value.toLocaleString()}</span>
                      <span className="text-muted-foreground/60 w-8 text-right">{pct(d.value, r.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </ChartCard>

        {/* Volume by category */}
        <ChartCard title="Tickets by Category"
          description="Which support categories generate the most volume? Focus improvement on the top categories."
          accentColor="bg-blue-500">
          {data.byCategory.length === 0
            ? <p className="text-sm text-muted-foreground text-center py-8">No data.</p>
            : (
              <ChartContainer config={{ count: { label: "Tickets", color: C.ticket }, open: { label: "Open", color: C.incident } }} className="h-52">
                <BarChart data={data.byCategory} layout="vertical" barCategoryGap="20%">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="category" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10 }} width={100}
                    tickFormatter={v => v.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill={C.ticket}   radius={[0, 3, 3, 0]} name="Total" />
                  <Bar dataKey="open"  fill={C.incident} radius={[0, 3, 3, 0]} name="Open"  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ChartContainer>
            )}
        </ChartCard>
      </div>

      {/* ── Team breakdown + Priority distribution ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* By team with SLA breach */}
        <ChartCard title="Volume & SLA Breach by Team"
          description="Teams with high SLA breach counts relative to volume need process or capacity attention."
          accentColor="bg-indigo-500">
          <div className="space-y-2">
            {data.byTeam.slice(0, 10).map((t, i) => {
              const breachRate = t.count > 0 ? Math.round((t.slaBreached / t.count) * 100) : 0;
              return (
                <div key={t.teamId ?? i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <RankBadge rank={i + 1} />
                      <span className="font-medium truncate max-w-[140px]">{t.teamName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground tabular-nums">{t.count.toLocaleString()}</span>
                      {t.slaBreached > 0 && (
                        <span className="font-semibold tabular-nums" style={{ color: C.fail }}>
                          {breachRate}% SLA breach
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${100 - breachRate}%`, background: C.ticket }} />
                    {breachRate > 0 && (
                      <div className="h-full rounded-full" style={{ width: `${breachRate}%`, background: C.fail }} />
                    )}
                  </div>
                </div>
              );
            })}
            {data.byTeam.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No team data.</p>
            )}
          </div>
        </ChartCard>

        {/* Priority × Status heatmap matrix */}
        <ChartCard title="Priority × Status Impact Matrix"
          description="Color intensity shows ticket concentration. Dark cells highlight critical backlogs."
          accentColor="bg-purple-500">
          {priorities.length === 0
            ? <p className="text-sm text-muted-foreground text-center py-8">No data.</p>
            : (
              <div className="space-y-2">
                {/* Column headers */}
                <div className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${statuses.length}, 1fr)` }}>
                  <div />
                  {statuses.map(s => (
                    <div key={s} className="text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 pb-1 truncate capitalize">
                      {s.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
                {/* Matrix rows */}
                {priorities.map(p => (
                  <div key={p} className="grid gap-1 items-center" style={{ gridTemplateColumns: `80px repeat(${statuses.length}, 1fr)` }}>
                    <div className="text-[10px] font-semibold capitalize truncate" style={{ color: PRIORITY_COLOR[p] }}>
                      {p}
                    </div>
                    {statuses.map(s => {
                      const count = matrixMap.get(`${p}|${s}`) ?? 0;
                      return <HeatCell key={s} count={count} max={matrixMax} label={`${p} / ${s}`} />;
                    })}
                  </div>
                ))}
                {/* Legend */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[9px] text-muted-foreground/60">Low</span>
                  <div className="flex gap-0.5 flex-1">
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                      <div key={v} className="flex-1 h-2 rounded-sm" style={{ background: `rgba(139,92,246,${0.12 + v * 0.82})` }} />
                    ))}
                  </div>
                  <span className="text-[9px] text-muted-foreground/60">High</span>
                </div>
              </div>
            )}
        </ChartCard>
      </div>

      {/* ── Hour-of-day heatmap ─────────────────────────────────────────── */}
      <ChartCard title="Ticket Volume by Hour of Day"
        description="Darker cells = more tickets created in that hour. Identify peak support windows to optimise staffing."
        accentColor="bg-sky-500">
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-1">
            {data.byHourOfDay.slice(0, 12).map(h => (
              <HeatCell key={h.hour} count={h.count} max={maxHour} label={h.label} sublabel={h.label} />
            ))}
          </div>
          <div className="grid grid-cols-12 gap-1">
            {data.byHourOfDay.slice(12).map(h => (
              <HeatCell key={h.hour} count={h.count} max={maxHour} label={h.label} sublabel={h.label} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground/60 pt-1">
            <span className="flex items-center gap-1"><Moon className="h-3 w-3" /> Midnight</span>
            <span>Noon</span>
            <span className="flex items-center gap-1">Midnight <Moon className="h-3 w-3" /></span>
          </div>
        </div>
      </ChartCard>

      {/* ── Day of week + Day of month ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Day of week */}
        <ChartCard title="Volume by Day of Week"
          description="Which days see the highest ticket creation? Use this to plan coverage and capacity."
          accentColor="bg-teal-500">
          <ChartContainer config={{ count: { label: "Tickets", color: C.ticket } }} className="h-44">
            <BarChart data={data.byDayOfWeek} barSize={32}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.byDayOfWeek.map(d => (
                  <Cell key={d.dow} fill={d.dow === 0 || d.dow === 6 ? C.muted : C.ticket} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Day of month */}
        <ChartCard title="Volume by Day of Month"
          description="Spikes on specific calendar days may indicate recurring billing cycles, renewals, or scheduled events."
          accentColor="bg-cyan-500">
          <div className="grid grid-cols-[repeat(7,1fr)] gap-0.5">
            {data.byDayOfMonth.map(d => (
              <HeatCell key={d.day} count={d.count} max={maxDom} label={`Day ${d.day}`} sublabel={String(d.day)} />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">
            Each cell = a calendar day (1–31)
          </p>
        </ChartCard>
      </div>

      {/* ── SLA Breach by Category ──────────────────────────────────────── */}
      {data.slaByCategory.some(c => c.total > 0) && (
        <ChartCard title="SLA Breach Rate by Category"
          description="Which categories are consistently breaching SLA? High rates indicate misconfigured SLA targets or understaffed areas."
          accentColor="bg-rose-500">
          <div className="space-y-2.5">
            {data.slaByCategory.filter(c => c.total > 0).map(c => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium capitalize">{c.category.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                    <span className="tabular-nums">{c.breached} of {c.total} with SLA</span>
                    <span className="font-bold tabular-nums w-10 text-right"
                      style={{ color: c.breachRate > 30 ? C.fail : c.breachRate > 10 ? C.change : C.success }}>
                      {c.breachRate}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${c.breachRate}%`, background: c.breachRate > 30 ? C.fail : c.breachRate > 10 ? C.change : C.success }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* ── Intake channel + Linked Problems ────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Source/channel breakdown */}
        <ChartCard title="Ticket Intake by Channel"
          description="Where are tickets coming from? Shift demand toward lower-cost channels (portal, self-service) over time."
          accentColor="bg-emerald-500">
          <div className="space-y-2.5">
            {data.bySource.map((s, i) => {
              const total2 = data.bySource.reduce((acc, x) => acc + x.count, 0);
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <RankBadge rank={i + 1} />
                  <span className="flex-1 text-sm font-medium capitalize">{SOURCE_LABEL[s.source] ?? s.source}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(s.count/total2)*100}%`, background: C.asset }} />
                    </div>
                    <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">{s.count.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground/60 w-8 text-right">{pct(s.count, total2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* Problems with most ticket links */}
        {data.topLinkedProblems.length > 0 && (
          <ChartCard title="Problems Driving the Most Tickets"
            description="Problems with many linked tickets indicate widespread end-user impact from a single root cause."
            accentColor="bg-orange-500">
            <div className="space-y-2">
              {data.topLinkedProblems.map((p, i) => (
                <div key={p.problemId} className="flex items-center gap-2.5 group">
                  <RankBadge rank={i + 1} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/problems/${p.problemId}`}
                      className="text-xs font-semibold hover:text-primary transition-colors truncate block">
                      {p.title}
                    </Link>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">{p.problemNumber}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums" style={{ color: C.problem }}>{p.ticketCount}</p>
                    <p className="text-[10px] text-muted-foreground/60">tickets</p>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        )}
      </div>

      {/* ── Top customers ────────────────────────────────────────────────── */}
      {data.topCustomers.length > 0 && (
        <ChartCard title="Top Customers by Ticket Volume"
          description="High-volume customers may need dedicated SLAs, account management review, or self-service enablement."
          accentColor="bg-blue-500"
          contentClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6">#</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Open</TableHead>
                <TableHead className="text-center">SLA Breached</TableHead>
                <TableHead className="w-28">Breach rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topCustomers.map((c, i) => {
                const rate = c.ticketCount > 0 ? Math.round((c.slaBreachedCount / c.ticketCount) * 100) : 0;
                return (
                  <TableRow key={c.customerId} className="group">
                    <TableCell><RankBadge rank={i + 1} /></TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-semibold tabular-nums">{c.ticketCount}</TableCell>
                    <TableCell className="text-center">
                      <span className="tabular-nums" style={{ color: c.openCount > 0 ? C.incident : undefined }}>{c.openCount}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="tabular-nums" style={{ color: c.slaBreachedCount > 0 ? C.fail : undefined }}>{c.slaBreachedCount}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rate > 30 ? C.fail : rate > 10 ? C.change : C.success }} />
                        </div>
                        <span className="text-[10px] font-semibold tabular-nums w-7 text-right"
                          style={{ color: rate > 30 ? C.fail : rate > 10 ? C.change : undefined }}>
                          {rate}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ChartCard>
      )}

      {/* ── Custom fields ────────────────────────────────────────────────── */}
      {data.customFields.length > 0 && (
        <ChartCard title="Custom Field Value Distributions"
          description="Breakdown of values across all populated custom fields on tickets. Identifies common patterns and data quality gaps."
          accentColor="bg-fuchsia-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.customFields.map(field => {
              const maxVal = Math.max(...field.values.map(v => v.count), 1);
              return (
                <div key={field.fieldName} className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground truncate">{field.fieldName}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{field.totalResponses} resp.</span>
                  </div>
                  <div className="space-y-1.5">
                    {field.values.map(v => (
                      <div key={v.value} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground truncate max-w-[70%]">{v.value || "(empty)"}</span>
                          <span className="font-semibold tabular-nums shrink-0">{v.count}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${(v.count / maxVal) * 100}%`, background: "#A855F7" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      )}

    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS = [
  { value: "overview",            label: "Overview",             icon: Network      },
  { value: "asset-impact",        label: "Asset Impact",         icon: Server       },
  { value: "problem-chains",      label: "Problem Chains",       icon: Bug          },
  { value: "change-risk",         label: "Change Risk",          icon: GitBranch    },
  { value: "service-health",      label: "Service Health",       icon: Package      },
  { value: "ticket-relationships",label: "Ticket Relationships", icon: TicketIcon   },
] as const;

export default function InsightsReport() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>("overview");

  const period     = searchParams.get("period")  ?? "30";
  const customFrom = searchParams.get("from")    ?? undefined;
  const customTo   = searchParams.get("to")      ?? undefined;

  const customReady = period !== "custom" || (!!customFrom && !!customTo);
  const qs = customReady
    ? rangeQS(periodToRange(period, customFrom, customTo))
    : rangeQS(periodToRange("30"));

  if (!customReady) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <Network className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Select a date range to load Insights</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="report-print-area">
      {/* Hero header */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 via-purple-500/5 to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center shrink-0">
            <Network className="h-5 w-5 text-fuchsia-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Relationship Insights</h2>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
              Cross-module analytics showing how tickets, assets, incidents, problems, changes, and services are interconnected.
              Use these reports to identify root causes, assess change risk, pinpoint high-volume ticket drivers, and measure service impact.
            </p>
          </div>
        </div>

        {/* How-to-use pill */}
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          {[
            { icon: "1", text: "Start in Overview for a fleet-wide summary" },
            { icon: "2", text: "Asset Impact shows which assets drive the most issues" },
            { icon: "3", text: "Problem Chains reveals chronic root causes" },
            { icon: "4", text: "Change Risk correlates deployment scope with failure" },
            { icon: "5", text: "Service Health shows catalog items at operational risk" },
            { icon: "6", text: "Ticket Relationships reveals what drives the most tickets" },
          ].map(s => (
            <span key={s.icon} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/60 border border-border/60 text-muted-foreground">
              <span className="h-4 w-4 rounded-full bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 font-bold flex items-center justify-center text-[10px]">{s.icon}</span>
              {s.text}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 gap-1 w-full justify-start overflow-x-auto bg-muted/40">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "h-7 px-3 text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"             className="mt-5"><OverviewTab       qs={qs} /></TabsContent>
        <TabsContent value="asset-impact"         className="mt-5"><AssetImpactTab   qs={qs} /></TabsContent>
        <TabsContent value="problem-chains"       className="mt-5"><ProblemChainsTab qs={qs} /></TabsContent>
        <TabsContent value="change-risk"          className="mt-5"><ChangeRiskTab    qs={qs} /></TabsContent>
        <TabsContent value="service-health"       className="mt-5"><ServiceHealthTab qs={qs} /></TabsContent>
        <TabsContent value="ticket-relationships" className="mt-5"><TicketsTab       qs={qs} /></TabsContent>
      </Tabs>
    </div>
  );
}
