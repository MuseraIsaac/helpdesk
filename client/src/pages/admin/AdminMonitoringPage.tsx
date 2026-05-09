/**
 * AdminMonitoringPage — live system-health dashboard.
 *
 * Polls /api/admin/health every 30s while the tab is visible. Designed to be
 * resource-cheap even when many admins have it open simultaneously: the
 * server caches the snapshot for 10s with single-flight dedup, and the
 * browser respects the Cache-Control header set by the route.
 *
 * Also pauses polling when the tab is hidden (Page Visibility API) so an
 * idle admin doesn't keep the engine warm.
 */

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router";
import {
  Activity, Database, Server, Cpu, Mail, Sparkles, Workflow,
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, RefreshCw, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";

// ── Types (mirror server/src/routes/admin-health.ts) ─────────────────────────

type Status = "healthy" | "degraded" | "down" | "unknown" | "not_configured";

interface HealthSnapshot {
  generatedAt: string;
  overall: Status;
  server: {
    status: Status;
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
    eventLoopLagMs: number;
    loadAvg: { one: number; five: number; fifteen: number } | null;
    cpuCount: number;
  };
  database: {
    status: Status;
    pingMs: number | null;
    serverVersion: string | null;
    activeConnections: number | null;
    maxConnections: number | null;
  };
  replica: {
    configured: boolean;
    status: Status;
    reachable: number;
    expected: number;
    replicas: Array<{
      port: number;
      status: Status;
      pingMs: number | null;
      pid: number | null;
      uptimeSeconds: number | null;
      rssMb: number | null;
      heapUsedMb: number | null;
      eventLoopLagMs: number | null;
      current: boolean;
      error: string | null;
    }>;
  };
  queue: {
    status: Status;
    totalActive: number;
    totalCreated: number;
    totalFailedLast24h: number;
    queues: Array<{
      name: string;
      created: number;
      active: number;
      completed: number;
      failed: number;
    }>;
  };
  cron: {
    status: Status;
    jobs: Array<{
      name: string;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      avgDurationMs: number | null;
      jobStatus: Status;
      maxAgeMinutes: number;
    }>;
  };
  providers: {
    mail: { status: Status; configured: boolean; detail: string };
    ai:   { status: Status; configured: boolean; detail: string };
  };
}

// ── Status presentation ──────────────────────────────────────────────────────

const STATUS_TONE: Record<Status, {
  label: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
  icon: typeof CheckCircle2;
}> = {
  healthy:        { label: "Healthy",        text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10",      border: "border-emerald-500/30",      dot: "bg-emerald-500",      icon: CheckCircle2 },
  degraded:       { label: "Degraded",       text: "text-amber-700 dark:text-amber-400",     bg: "bg-amber-500/10",        border: "border-amber-500/30",        dot: "bg-amber-500",        icon: AlertTriangle },
  down:           { label: "Down",           text: "text-rose-700 dark:text-rose-400",       bg: "bg-rose-500/10",         border: "border-rose-500/30",         dot: "bg-rose-500",         icon: XCircle },
  unknown:        { label: "Unknown",        text: "text-muted-foreground",                  bg: "bg-muted/40",            border: "border-border/60",           dot: "bg-muted-foreground", icon: MinusCircle },
  not_configured: { label: "Not configured", text: "text-muted-foreground",                  bg: "bg-muted/30",            border: "border-border/50",           dot: "bg-muted-foreground/40", icon: MinusCircle },
};

function StatusPill({ status, size = "md" }: { status: Status; size?: "sm" | "md" }) {
  const t = STATUS_TONE[status];
  const Icon = t.icon;
  const dotPulse = status === "healthy" ? "animate-pulse" : "";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${t.border} ${t.bg} ${t.text} ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"} font-medium`}
    >
      <span className={`relative inline-block ${size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"} rounded-full ${t.dot}`}>
        {status === "healthy" && (
          <span className={`absolute inset-0 rounded-full ${t.dot} opacity-60 ${dotPulse}`} />
        )}
      </span>
      {size === "md" && <Icon className="h-3 w-3 -mr-0.5" />}
      {t.label}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60)    return `${seconds}s`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function MetricRow({ label, value, hint, bar }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Optional 0–1 fill (e.g. heap pct) — renders a slim bar under the value. */
  bar?: { pct: number; tone?: "ok" | "warn" | "danger" };
}) {
  return (
    <div className="py-1.5 border-b border-border/30 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-mono">{label}</span>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sm font-medium tabular-nums font-mono truncate">{value}</span>
          {hint && <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">{hint}</span>}
        </div>
      </div>
      {bar && <ProgressBar pct={bar.pct} tone={bar.tone} />}
    </div>
  );
}

function ProgressBar({ pct, tone = "ok" }: { pct: number; tone?: "ok" | "warn" | "danger" }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const fillTone =
    tone === "danger" ? "bg-rose-500"
    : tone === "warn"  ? "bg-amber-500"
    : "bg-emerald-500";
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-muted/60 overflow-hidden">
      <div
        className={`h-full ${fillTone} transition-all duration-500`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

function Card({
  icon: Icon, title, status, children,
}: {
  icon: typeof Activity;
  title: string;
  status?: Status;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden transition-colors hover:border-border">
      {/* Top accent line tinted by card status — keeps the page feeling like a NOC strip. */}
      {status && (
        <div className={`absolute inset-x-0 top-0 h-px ${STATUS_TONE[status].dot} opacity-60`} aria-hidden="true" />
      )}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80 flex-1 font-mono">{title}</span>
        {status && <StatusPill status={status} size="sm" />}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

function ServerCard({ data }: { data: HealthSnapshot["server"] }) {
  const heapPctRaw = data.memory.heapUsedMb / Math.max(1, data.memory.heapTotalMb);
  const heapPctDisplay = Math.round(heapPctRaw * 100);
  const heapTone: "ok" | "warn" | "danger" =
    heapPctRaw > 0.9 ? "danger" : heapPctRaw > 0.75 ? "warn" : "ok";
  const lagTone: "ok" | "warn" | "danger" =
    data.eventLoopLagMs > 1000 ? "danger" : data.eventLoopLagMs > 200 ? "warn" : "ok";

  return (
    <Card icon={Server} title="Server (Node.js)" status={data.status}>
      <div className="space-y-0">
        <MetricRow label="Uptime"           value={formatUptime(data.uptimeSeconds)} />
        <MetricRow label="Node"             value={data.nodeVersion} hint={data.platform} />
        <MetricRow label="CPU cores"        value={data.cpuCount} />
        {data.loadAvg ? (
          <MetricRow
            label="Load avg"
            value={`${data.loadAvg.one.toFixed(2)} / ${data.loadAvg.five.toFixed(2)} / ${data.loadAvg.fifteen.toFixed(2)}`}
            hint="1m / 5m / 15m"
          />
        ) : (
          <MetricRow label="Load avg" value="n/a" hint="not exposed by Windows" />
        )}
        <MetricRow label="RSS memory"       value={`${data.memory.rssMb} MB`} />
        <MetricRow
          label="Heap"
          value={`${data.memory.heapUsedMb} / ${data.memory.heapTotalMb} MB`}
          hint={`${heapPctDisplay}%`}
          bar={{ pct: Math.min(1, heapPctRaw), tone: heapTone }}
        />
        <MetricRow
          label="Event-loop lag"
          value={`${data.eventLoopLagMs} ms`}
          bar={{ pct: Math.min(1, data.eventLoopLagMs / 500), tone: lagTone }}
        />
      </div>
    </Card>
  );
}

function DatabaseCard({ data }: { data: HealthSnapshot["database"] }) {
  const connRaw = data.maxConnections ? (data.activeConnections ?? 0) / data.maxConnections : 0;
  const connPctDisplay = data.maxConnections ? Math.round(connRaw * 100) : null;
  const connTone: "ok" | "warn" | "danger" =
    connRaw > 0.85 ? "danger" : connRaw > 0.6 ? "warn" : "ok";
  const pingTone: "ok" | "warn" | "danger" =
    (data.pingMs ?? 0) > 500 ? "danger" : (data.pingMs ?? 0) > 100 ? "warn" : "ok";
  return (
    <Card icon={Database} title="Database (Postgres)" status={data.status}>
      <div className="space-y-0">
        <MetricRow
          label="Ping"
          value={data.pingMs != null ? `${data.pingMs} ms` : "—"}
          bar={data.pingMs != null ? { pct: Math.min(1, data.pingMs / 500), tone: pingTone } : undefined}
        />
        <MetricRow label="Server" value={data.serverVersion ?? "—"} />
        <MetricRow
          label="Connections"
          value={`${data.activeConnections ?? "?"} / ${data.maxConnections ?? "?"}`}
          hint={connPctDisplay != null ? `${connPctDisplay}%` : undefined}
          bar={data.maxConnections ? { pct: Math.min(1, connRaw), tone: connTone } : undefined}
        />
      </div>
    </Card>
  );
}

function ReplicaCard({ data }: { data: HealthSnapshot["replica"] }) {
  return (
    <Card icon={Server} title="API server replicas" status={data.status}>
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border/30">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
          Reachable
        </span>
        <span className="text-sm font-medium tabular-nums">
          <span className={data.reachable < data.expected ? "text-rose-600 dark:text-rose-400" : ""}>{data.reachable}</span>
          <span className="text-muted-foreground/60"> / {data.expected}</span>
        </span>
      </div>

      {!data.configured && (
        <p className="text-[11px] text-muted-foreground/70 mb-2 italic">
          <code className="font-mono">REPLICAS</code> / <code className="font-mono">APP_BASE_PORT</code> env hints not set — showing the local replica only.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {data.replicas.map((r) => {
          const t = STATUS_TONE[r.status];
          return (
            <div
              key={r.port}
              className={`relative rounded-lg border ${t.border} ${t.bg} px-3 py-2.5`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`relative inline-block h-2 w-2 rounded-full ${t.dot}`}>
                    {r.status === "healthy" && (
                      <span className={`absolute inset-0 rounded-full ${t.dot} opacity-60 animate-pulse`} />
                    )}
                  </span>
                  <span className="font-mono text-[12px] font-semibold">:{r.port}</span>
                  {r.current && (
                    <span className="text-[9px] uppercase tracking-wider rounded-sm px-1 py-px bg-primary/10 text-primary border border-primary/20">
                      this
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${t.text}`}>
                  {STATUS_TONE[r.status].label}
                </span>
              </div>

              {r.error ? (
                <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate" title={r.error}>
                  {r.error}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground">
                  <span>pid <span className="text-foreground tabular-nums">{r.pid ?? "—"}</span></span>
                  <span>up <span className="text-foreground tabular-nums">{r.uptimeSeconds != null ? formatUptime(r.uptimeSeconds) : "—"}</span></span>
                  <span>rss <span className="text-foreground tabular-nums">{r.rssMb != null ? `${r.rssMb}M` : "—"}</span></span>
                  <span>heap <span className="text-foreground tabular-nums">{r.heapUsedMb != null ? `${r.heapUsedMb}M` : "—"}</span></span>
                  <span>lag <span className="text-foreground tabular-nums">{r.eventLoopLagMs != null ? `${r.eventLoopLagMs}ms` : "—"}</span></span>
                  <span>ping <span className="text-foreground tabular-nums">{r.pingMs != null ? `${r.pingMs}ms` : "—"}</span></span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function QueueCard({ data }: { data: HealthSnapshot["queue"] }) {
  return (
    <Card icon={Workflow} title="Job queue (pg-boss)" status={data.status}>
      <div className="space-y-0 mb-3">
        <MetricRow label="Active"            value={data.totalActive} />
        <MetricRow label="Waiting"           value={data.totalCreated} />
        <MetricRow label="Failed (24h)"      value={data.totalFailedLast24h} />
      </div>
      {data.queues.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
            Per-queue breakdown ({data.queues.length})
          </summary>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border/40">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 text-muted-foreground/70">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-medium">Queue</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Wait</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Active</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Done</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.queues.map((q) => (
                  <tr key={q.name} className="hover:bg-muted/20">
                    <td className="px-2.5 py-1.5 font-mono">{q.name}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{q.created}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{q.active}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{q.completed}</td>
                    <td className={`px-2.5 py-1.5 text-right tabular-nums ${q.failed > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{q.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}

function formatCadence(minutes: number): string {
  if (!minutes)            return "—";
  if (minutes < 60)        return `≤${minutes}m`;
  if (minutes < 60 * 24)   return `≤${Math.round(minutes / 60)}h`;
  return `≤${Math.round(minutes / 60 / 24)}d`;
}

function CronCard({ data }: { data: HealthSnapshot["cron"] }) {
  return (
    <Card icon={Clock} title="Background jobs (cron)" status={data.status}>
      {data.jobs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No cron-style jobs have run yet.</p>
      ) : (
        <div className="rounded-md border border-border/40 overflow-hidden">
          <table className="w-full text-[11px] font-mono">
            <thead className="bg-muted/40 text-muted-foreground/70">
              <tr>
                <th className="w-5 px-1.5 py-1.5"></th>
                <th className="px-2.5 py-1.5 text-left font-medium tracking-wider uppercase text-[10px]">Job</th>
                <th className="px-2.5 py-1.5 text-right font-medium tracking-wider uppercase text-[10px]">Cadence</th>
                <th className="px-2.5 py-1.5 text-right font-medium tracking-wider uppercase text-[10px]">Last ok</th>
                <th className="px-2.5 py-1.5 text-right font-medium tracking-wider uppercase text-[10px]">Last fail</th>
                <th className="px-2.5 py-1.5 text-right font-medium tracking-wider uppercase text-[10px]">Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {data.jobs.map((j) => {
                const t = STATUS_TONE[j.jobStatus];
                return (
                  <tr key={j.name} className="hover:bg-muted/20">
                    <td className="px-1.5 py-1.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${t.dot} ${j.jobStatus === "healthy" ? "shadow-[0_0_6px_currentColor] text-emerald-500" : ""}`} title={t.label} />
                    </td>
                    <td className="px-2.5 py-1.5">{j.name}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground/70">{formatCadence(j.maxAgeMinutes)}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground">{formatRelative(j.lastSuccessAt)}</td>
                    <td className={`px-2.5 py-1.5 text-right ${j.lastFailureAt ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground/60"}`}>
                      {j.lastFailureAt ? formatRelative(j.lastFailureAt) : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{j.avgDurationMs != null ? `${j.avgDurationMs}ms` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ProviderCard({
  icon, title, data,
}: {
  icon: typeof Mail;
  title: string;
  data: HealthSnapshot["providers"]["mail"];
}) {
  return (
    <Card icon={icon} title={title} status={data.status}>
      <p className="text-xs text-muted-foreground">{data.detail}</p>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMonitoringPage() {
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery<HealthSnapshot>({
    queryKey: ["admin-health"],
    queryFn: async () => {
      const res = await axios.get<HealthSnapshot>("/api/admin/health");
      return res.data;
    },
    // Server caches for 10s; we refresh every 30s while visible so the page
    // always shows recent data without hammering anything.
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,  // pause when the tab is backgrounded
    refetchOnWindowFocus: true,
  });

  const overall = data?.overall ?? "unknown";
  const tone = STATUS_TONE[overall];

  return (
    <div className="space-y-5">
      {/* Hero — NOC-style with subtle grid backdrop ─────────────────────── */}
      <div className={`relative overflow-hidden rounded-2xl border ${tone.border} ${tone.bg}`}>
        {/* Tech grid backdrop — pure CSS, no images. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:22px_22px]"
          aria-hidden="true"
        />
        {/* Diagonal sheen */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/0 via-white/10 to-white/0 dark:via-white/[0.03]"
          aria-hidden="true"
        />
        {/* Top accent bar — colour-coded to overall status */}
        <div className={`absolute inset-x-0 top-0 h-[2px] ${tone.dot} ${overall === "healthy" ? "animate-pulse" : ""}`} aria-hidden="true" />

        <div className="relative px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${tone.border} ${tone.bg} backdrop-blur-sm`}>
              <Activity className={`h-5 w-5 ${tone.text}`} />
              {overall === "healthy" && (
                <span className={`absolute -inset-1 rounded-lg ${tone.dot} opacity-20 blur-md animate-pulse`} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight font-mono">System Monitoring</h2>
                <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70 font-mono px-1.5 py-0.5 rounded-sm border border-border/50 bg-background/60">
                  live
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Server · database · replicas · background workers · upstream providers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatusPill status={overall} />
            <span className="text-[11px] text-muted-foreground tabular-nums font-mono">
              {data ? formatRelative(new Date(dataUpdatedAt).toISOString()) : "—"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-8 font-mono text-[11px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              REFRESH
            </Button>
          </div>
        </div>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load monitoring data" />}

      {/* Cards ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* API replicas — full-width strip so up to 16 replicas line up cleanly. */}
          <ReplicaCard data={data.replica} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ServerCard data={data.server} />
            <DatabaseCard data={data.database} />
            <QueueCard data={data.queue} />
            <CronCard data={data.cron} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ProviderCard icon={Mail}     title="Mail (SendGrid)" data={data.providers.mail} />
            <ProviderCard icon={Sparkles} title="AI (OpenAI)"     data={data.providers.ai} />
            <Card icon={Cpu} title="Quick links">
              <div className="flex flex-col gap-1.5 text-sm">
                <Link to="/admin/audit-log"  className="text-primary hover:underline">→ Audit log</Link>
                <Link to="/admin/updates"    className="text-primary hover:underline">→ Platform releases</Link>
                <Link to="/automations?section=executions" className="text-primary hover:underline">→ Automation execution log</Link>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
