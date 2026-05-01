import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  CI_TYPE_LABEL, CI_ENVIRONMENT_LABEL, CI_CRITICALITY_LABEL, CI_STATUS_LABEL,
  CI_TYPES, CI_ENVIRONMENTS, CI_CRITICALITIES, CI_STATUSES,
  CI_CRITICALITY_COLOR,
  type CiSummary,
} from "core/constants/cmdb.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import NewCiDialog from "@/components/NewCiDialog";
import {
  Database, Search, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon,
  Server, Cpu, Wifi, Cloud, HardDrive, Box, Package,
  Smartphone, Printer, Wrench, AppWindow, Settings,
  ShieldAlert, CheckCircle2, X, Filter,
} from "lucide-react";

// ── Type → icon map ──────────────────────────────────────────────────────────

const CI_TYPE_ICON: Record<string, React.ElementType> = {
  server:          Server,
  workstation:     Cpu,
  network_device:  Wifi,
  application:     AppWindow,
  service:         Settings,
  database:        Database,
  storage:         HardDrive,
  virtual_machine: Cloud,
  container:       Box,
  printer:         Printer,
  mobile_device:   Smartphone,
  other:           Wrench,
};

// Each type gets a soft tinted background for its icon chip — gives the table
// quick visual differentiation without being noisy.
const CI_TYPE_TONE: Record<string, { bg: string; fg: string }> = {
  server:          { bg: "bg-sky-500/10",     fg: "text-sky-600 dark:text-sky-400" },
  workstation:     { bg: "bg-violet-500/10",  fg: "text-violet-600 dark:text-violet-400" },
  network_device:  { bg: "bg-emerald-500/10", fg: "text-emerald-600 dark:text-emerald-400" },
  application:     { bg: "bg-indigo-500/10",  fg: "text-indigo-600 dark:text-indigo-400" },
  service:         { bg: "bg-zinc-500/10",    fg: "text-zinc-600 dark:text-zinc-400" },
  database:        { bg: "bg-amber-500/10",   fg: "text-amber-600 dark:text-amber-400" },
  storage:         { bg: "bg-rose-500/10",    fg: "text-rose-600 dark:text-rose-400" },
  virtual_machine: { bg: "bg-cyan-500/10",    fg: "text-cyan-600 dark:text-cyan-400" },
  container:       { bg: "bg-teal-500/10",    fg: "text-teal-600 dark:text-teal-400" },
  printer:         { bg: "bg-zinc-500/10",    fg: "text-zinc-600 dark:text-zinc-400" },
  mobile_device:   { bg: "bg-purple-500/10",  fg: "text-purple-600 dark:text-purple-400" },
  other:           { bg: "bg-muted",          fg: "text-muted-foreground" },
};

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:         "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  maintenance:    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  planned:        "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  retired:        "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400 border-zinc-500/30",
  decommissioned: "bg-muted text-muted-foreground border-border",
};

function CiStatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.planned;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {CI_STATUS_LABEL[status as keyof typeof CI_STATUS_LABEL] ?? status}
    </span>
  );
}

// ── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  value,
  active,
  onClick,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  active?: boolean;
  onClick?: () => void;
  tone: "neutral" | "danger" | "warning" | "success" | "info";
}) {
  const tones = {
    neutral: "border-border bg-card hover:border-foreground/20",
    danger:  "border-red-300/60 bg-red-500/[0.06] hover:border-red-400 dark:border-red-500/30",
    warning: "border-amber-300/60 bg-amber-500/[0.06] hover:border-amber-400 dark:border-amber-500/30",
    success: "border-emerald-300/60 bg-emerald-500/[0.06] hover:border-emerald-400 dark:border-emerald-500/30",
    info:    "border-cyan-300/60 bg-cyan-500/[0.06] hover:border-cyan-400 dark:border-cyan-500/30",
  };
  const iconTones = {
    neutral: "text-muted-foreground",
    danger:  "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
    info:    "text-cyan-600 dark:text-cyan-400",
  };
  const ringActive = active ? "ring-2 ring-primary/40" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex-1 min-w-[120px] flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${tones[tone]} ${ringActive} ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-md border bg-background/60 ${iconTones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          {label}
        </p>
        <p className="text-xl font-bold tabular-nums leading-tight mt-0.5">{value}</p>
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CmdbPage() {
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState<string>("");
  const [envFilter, setEnvFilter]     = useState<string>("");
  const [critFilter, setCritFilter]   = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [page, setPage]               = useState(1);

  // Debounced search — 300ms after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string | number> = { page, pageSize: 25 };
  if (search)       params.search      = search;
  if (typeFilter)   params.type        = typeFilter;
  if (envFilter)    params.environment = envFilter;
  if (critFilter)   params.criticality = critFilter;
  if (statusFilter) params.status      = statusFilter;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cmdb", params],
    queryFn: async () => {
      const { data } = await axios.get<{
        items: CiSummary[];
        meta: { total: number; page: number; pageSize: number; pages: number };
      }>("/api/cmdb", { params });
      return data;
    },
  });

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  // ── Derived stats from the current page ────────────────────────────────────
  // Note: stats reflect the current page only (server pagination), but they're
  // still useful for quick visual orientation. For all-time numbers the user
  // can clear filters — `total` is the unfiltered count for the current query.
  const stats = useMemo(() => {
    let critical = 0;
    let active = 0;
    let production = 0;
    for (const ci of items) {
      if (ci.criticality === "critical") critical++;
      if (ci.status === "active") active++;
      if (ci.environment === "production") production++;
    }
    return { critical, active, production };
  }, [items]);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setTypeFilter("");
    setEnvFilter("");
    setCritFilter("");
    setStatusFilter("active");
    setPage(1);
  }

  const hasFilters = !!(search || typeFilter || envFilter || critFilter || statusFilter !== "active");

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 shrink-0">
            <Database className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight leading-tight">
              Configuration Management Database
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Servers, services, network gear, and applications under change control.
            </p>
          </div>
        </div>
        <NewCiDialog onCreated={() => refetch()} />
      </div>

      {/* ── Stat strip ── */}
      <div className="flex flex-wrap gap-2.5">
        <StatChip icon={Database}     label="Total"       value={total}             tone="neutral" />
        <StatChip
          icon={CheckCircle2}
          label="Active"
          value={stats.active}
          tone="success"
          active={statusFilter === "active"}
          onClick={() => { setStatusFilter((s) => s === "active" ? "" : "active"); setPage(1); }}
        />
        <StatChip
          icon={ShieldAlert}
          label="Critical"
          value={stats.critical}
          tone="danger"
          active={critFilter === "critical"}
          onClick={() => { setCritFilter((c) => c === "critical" ? "" : "critical"); setPage(1); }}
        />
        <StatChip
          icon={Cloud}
          label="Production"
          value={stats.production}
          tone="info"
          active={envFilter === "production"}
          onClick={() => { setEnvFilter((e) => e === "production" ? "" : "production"); setPage(1); }}
        />
        <StatChip
          icon={Server}
          label="On this page"
          value={items.length}
          tone="neutral"
        />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
          <Input
            placeholder="Search by name, number, or tag…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 text-xs pl-8 pr-8 border-0 shadow-none focus-visible:ring-1"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="h-5 w-px bg-border" />

        <Select value={typeFilter || "_all"} onValueChange={(v) => { setTypeFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All types</SelectItem>
            {CI_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{CI_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={envFilter || "_all"} onValueChange={(v) => { setEnvFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="All environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All environments</SelectItem>
            {CI_ENVIRONMENTS.map((e) => (
              <SelectItem key={e} value={e}>{CI_ENVIRONMENT_LABEL[e]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={critFilter || "_all"} onValueChange={(v) => { setCritFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="All criticalities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All criticalities</SelectItem>
            {CI_CRITICALITIES.map((c) => (
              <SelectItem key={c} value={c}>{CI_CRITICALITY_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter || "_all"} onValueChange={(v) => { setStatusFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            {CI_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{CI_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <>
            <div className="h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={clearFilters}
            >
              <Filter className="h-3 w-3" />
              Clear filters
            </Button>
          </>
        )}
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load CIs" />}

      {/* ── Table ── */}
      {isLoading ? (
        <div className="rounded-xl border bg-card p-3 space-y-2 shadow-sm">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 rounded-xl border border-dashed bg-muted/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background">
            <Database className="h-5 w-5 text-muted-foreground/60" />
          </span>
          <div>
            <p className="text-sm font-semibold">No configuration items found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasFilters ? "Try adjusting filters to see more results." : "Create your first CI to start tracking infrastructure under change control."}
            </p>
          </div>
          {hasFilters ? (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={clearFilters}>
              <Filter className="h-3 w-3" />
              Clear filters
            </Button>
          ) : (
            <NewCiDialog onCreated={() => refetch()} />
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">CI</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Type</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 w-28">Env</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 w-32">Criticality</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 w-28">Status</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 w-44">Owner / Team</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Tags</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((ci) => {
                const TypeIcon = CI_TYPE_ICON[ci.type] ?? Wrench;
                const tone = CI_TYPE_TONE[ci.type] ?? CI_TYPE_TONE.other;
                return (
                  <tr
                    key={ci.id}
                    className="group cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/cmdb/${ci.ciNumber}`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/cmdb/${ci.ciNumber}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block hover:text-foreground"
                      >
                        <p className="font-medium text-foreground/90 truncate group-hover:text-foreground">{ci.name}</p>
                        <p className="text-[11px] font-mono text-muted-foreground tabular-nums mt-0.5">{ci.ciNumber}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone.bg} ${tone.fg} shrink-0`}>
                          <TypeIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs text-foreground/80">{CI_TYPE_LABEL[ci.type]}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[11px] font-normal capitalize">
                        {CI_ENVIRONMENT_LABEL[ci.environment]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold uppercase tracking-wide ${CI_CRITICALITY_COLOR[ci.criticality]}`}>
                        {CI_CRITICALITY_LABEL[ci.criticality]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CiStatusBadge status={ci.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {ci.owner?.name ?? ci.team?.name ?? (
                        <span className="italic text-muted-foreground/60">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ci.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                            {tag}
                          </Badge>
                        ))}
                        {ci.tags.length > 3 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                            +{ci.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRightIcon className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.meta.pages > 1 && (
        <div className="flex items-center justify-between text-sm rounded-lg border bg-card px-4 py-2.5 shadow-sm">
          <p className="text-muted-foreground text-xs">
            Page <span className="font-semibold tabular-nums text-foreground">{data.meta.page}</span> of{" "}
            <span className="tabular-nums">{data.meta.pages}</span> ·{" "}
            <span className="tabular-nums">{data.meta.total}</span> items
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={page >= data.meta.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
