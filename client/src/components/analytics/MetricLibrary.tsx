/**
 * MetricLibrary — searchable, domain-grouped metric browser.
 * Shown as a left sidebar panel in edit mode.
 * Clicking a metric adds it to the canvas with default size.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, BarChart2, TrendingUp, Activity, Users, BookOpen, Star, AlertTriangle, ChevronDown, ChevronRight, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMetrics, type MetricMeta } from "@/lib/reports/analytics-api";
import { cn } from "@/lib/utils";

// ── Domain config ─────────────────────────────────────────────────────────────

const DOMAIN_META: Record<string, { label: string; icon: React.ElementType }> = {
  tickets:  { label: "Tickets",       icon: BarChart2 },
  agents:   { label: "Agents",        icon: Users },
  teams:    { label: "Teams",         icon: Users },
  incidents:{ label: "Incidents",     icon: AlertTriangle },
  requests: { label: "Requests",      icon: TrendingUp },
  problems: { label: "Problems",      icon: AlertTriangle },
  changes:  { label: "Changes",       icon: Activity },
  csat:     { label: "CSAT",          icon: Star },
  kb:       { label: "Knowledge Base",icon: BookOpen },
  realtime: { label: "Real-time",     icon: Activity },
  approvals:{ label: "Approvals",     icon: BarChart2 },
  assets:   { label: "Assets & CMDB", icon: Package },
};

const DOMAIN_ORDER = [
  "tickets", "incidents", "requests", "problems", "changes",
  "agents", "teams", "csat", "kb", "assets", "realtime", "approvals",
];

// ── Subcategories ─────────────────────────────────────────────────────────────
//
// Each domain is split into smaller, themed groups (mirrors the dashboard's
// WIDGET_CATEGORIES breakdown). Metric ids that don't appear in any group
// fall through to "Other" so nothing disappears if a new metric is added
// server-side.

interface SubGroup { label: string; ids: string[] }

const SUBCATEGORIES: Record<string, SubGroup[]> = {
  tickets: [
    { label: "Volume",       ids: ["tickets.volume", "tickets.backlog", "tickets.aging", "tickets.assigned_not_replied", "tickets.overdue"] },
    { label: "Performance",  ids: ["tickets.first_response_time", "tickets.resolution_time", "tickets.fcr", "tickets.ai_resolution_rate"] },
    { label: "Breakdowns",   ids: ["tickets.by_agent", "tickets.by_team", "tickets.priority_distribution", "tickets.status_distribution"] },
    { label: "SLA & Quality", ids: ["tickets.sla_compliance"] },
    { label: "Top Lists",    ids: ["tickets.top_open"] },
  ],
  agents: [
    { label: "Throughput",   ids: ["agent.tickets_resolved", "agent.volume_trend", "agent.workload"] },
    { label: "Performance",  ids: ["agent.first_response_time", "agent.avg_resolution_time", "agent.fcr_rate"] },
    { label: "Quality",      ids: ["agent.csat_score", "agent.sla_compliance"] },
  ],
  teams: [
    { label: "Throughput",   ids: ["team.tickets_resolved", "team.volume_trend", "team.queue_depth"] },
    { label: "Performance",  ids: ["team.first_response_time", "team.avg_resolution_time"] },
    { label: "Quality",      ids: ["team.csat_score", "team.sla_compliance"] },
  ],
  incidents: [
    { label: "Volume",       ids: ["incidents.volume", "incidents.major_count"] },
    { label: "Performance",  ids: ["incidents.mtta", "incidents.mttr", "incidents.sla_compliance"] },
  ],
  requests: [
    { label: "Volume",       ids: ["requests.volume", "requests.top_items"] },
    { label: "Performance",  ids: ["requests.fulfillment_time", "requests.sla_compliance"] },
  ],
  problems: [
    { label: "Volume",       ids: ["problems.volume", "problems.known_errors", "problems.recurring"] },
    { label: "Performance",  ids: ["problems.avg_resolution_days"] },
  ],
  changes: [
    { label: "Volume",       ids: ["changes.volume", "changes.by_type", "changes.by_risk"] },
    { label: "Performance",  ids: ["changes.approval_time", "changes.success_rate"] },
  ],
  approvals: [
    { label: "Queue",        ids: ["approvals.pending_queue", "approvals.volume"] },
    { label: "Performance",  ids: ["approvals.turnaround_time"] },
  ],
  kb: [
    { label: "Volume",       ids: ["kb.article_count", "kb.published_trend", "kb.view_count"] },
    { label: "Quality",      ids: ["kb.helpful_ratio", "kb.feedback_trend"] },
    { label: "Top Lists",    ids: ["kb.top_articles", "kb.most_helpful"] },
  ],
  realtime: [
    { label: "Tickets",      ids: ["realtime.open_tickets", "realtime.unassigned_tickets", "realtime.overdue_tickets", "realtime.assigned_not_replied"] },
    { label: "SLA",          ids: ["realtime.sla_at_risk", "realtime.sla_breached_open"] },
    { label: "Other Modules", ids: ["realtime.active_incidents", "realtime.open_problems", "realtime.open_requests", "realtime.changes_in_progress", "realtime.pending_approvals"] },
    { label: "Agents",       ids: ["realtime.agent_workload_snapshot"] },
  ],
  assets: [
    { label: "Inventory",    ids: ["assets.total", "assets.by_status", "assets.by_type", "assets.by_location", "assets.by_team"] },
    { label: "Lifecycle",    ids: ["assets.warranty_expiring", "assets.retirement_due", "assets.retirement_trend", "assets.stale"] },
    { label: "Discovery & Issues", ids: ["assets.discovery_trend", "assets.with_open_incidents"] },
  ],
};

// ── Default widget sizes per visualization ────────────────────────────────────

function defaultSize(viz: string): { w: number; h: number } {
  if (viz === "number" || viz === "number_change" || viz === "gauge") return { w: 2, h: 2 };
  if (viz === "leaderboard" || viz === "table") return { w: 4, h: 5 };
  if (viz === "donut") return { w: 3, h: 4 };
  if (viz === "bar_horizontal") return { w: 4, h: 4 };
  return { w: 4, h: 3 }; // line, area, bar, histogram
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onAddMetric: (metric: MetricMeta) => void;
  existingIds: string[];
}

export function MetricLibrary({ onAddMetric, existingIds }: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["analytics", "metrics"],
    queryFn: () => listMetrics(),
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    if (!query.trim()) return metrics;
    const q = query.toLowerCase();
    return metrics.filter(
      m => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.domain.includes(q),
    );
  }, [metrics, query]);

  // Group by domain
  const grouped = useMemo(() => {
    const map = new Map<string, MetricMeta[]>();
    for (const m of filtered) {
      if (!map.has(m.domain)) map.set(m.domain, []);
      map.get(m.domain)!.push(m);
    }
    return map;
  }, [filtered]);

  const domains = DOMAIN_ORDER.filter(d => grouped.has(d));

  function toggleCollapse(domain: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-border/60 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search metrics…"
            className="h-7 pl-8 text-[11px] bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      {/* ── Metric list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="space-y-2 px-3 py-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
          </div>
        ) : domains.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-8">No metrics found</p>
        ) : (
          domains.map(domain => {
            const items = grouped.get(domain) ?? [];
            const meta  = DOMAIN_META[domain] ?? { label: domain, icon: BarChart2 };
            const Icon  = meta.icon;
            const isOpen = !collapsed.has(domain);

            return (
              <div key={domain} className="mb-0.5">
                {/* Domain header */}
                <button
                  onClick={() => toggleCollapse(domain)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
                >
                  {isOpen
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  }
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {meta.label}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground/60">{items.length}</span>
                </button>

                {/* Metric rows — split into subcategories when configured */}
                {isOpen && (
                  <div>
                    {(() => {
                      const subs = SUBCATEGORIES[domain];
                      // No subcategory config OR a search is active → flat list
                      // (search results would be confusingly hidden under empty subgroups).
                      if (!subs || query.trim()) {
                        return items.map(metric => (
                          <MetricRow
                            key={metric.id}
                            metric={metric}
                            onAdd={() => onAddMetric(metric)}
                          />
                        ));
                      }

                      const seen = new Set<string>();
                      const groups: { label: string; metrics: MetricMeta[] }[] = [];
                      for (const sub of subs) {
                        const matched = items.filter(m => sub.ids.includes(m.id));
                        if (matched.length === 0) continue;
                        for (const m of matched) seen.add(m.id);
                        groups.push({ label: sub.label, metrics: matched });
                      }
                      const leftover = items.filter(m => !seen.has(m.id));
                      if (leftover.length > 0) {
                        groups.push({ label: "Other", metrics: leftover });
                      }

                      return groups.map(g => (
                        <div key={g.label} className="mb-1 last:mb-0">
                          <div className="flex items-center gap-1.5 px-3 pt-1 pb-0.5">
                            <span className="h-px flex-1 bg-border/40" />
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                              {g.label}
                            </span>
                            <span className="text-[9px] text-muted-foreground/40 tabular-nums">{g.metrics.length}</span>
                            <span className="h-px flex-1 bg-border/40" />
                          </div>
                          {g.metrics.map(metric => (
                            <MetricRow
                              key={metric.id}
                              metric={metric}
                              onAdd={() => onAddMetric(metric)}
                            />
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Metric row ────────────────────────────────────────────────────────────────

function MetricRow({ metric, onAdd }: { metric: MetricMeta; onAdd: () => void }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 group hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-foreground truncate leading-tight">{metric.label}</p>
        <p className="text-[10px] text-muted-foreground leading-snug truncate mt-0.5">{metric.description}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={onAdd}
        title={`Add ${metric.label}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// Re-export so callers can use defaultSize
export { defaultSize };
