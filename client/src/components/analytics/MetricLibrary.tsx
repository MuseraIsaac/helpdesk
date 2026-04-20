/**
 * MetricLibrary — searchable, domain-grouped metric browser.
 * Shown as a left sidebar panel in edit mode.
 * Clicking a metric adds it to the canvas with default size.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, BarChart2, TrendingUp, Activity, Users, BookOpen, Star, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
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
};

const DOMAIN_ORDER = [
  "tickets", "incidents", "requests", "problems", "changes",
  "agents", "teams", "csat", "kb", "realtime", "approvals",
];

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

                {/* Metric rows */}
                {isOpen && (
                  <div>
                    {items.map(metric => {
                      const alreadyAdded = existingIds.some(id => {
                        // id is the widget instance id, not metricId — so we check differently
                        return false; // always allow adding duplicates
                      });
                      return (
                        <MetricRow
                          key={metric.id}
                          metric={metric}
                          onAdd={() => onAddMetric(metric)}
                        />
                      );
                    })}
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
