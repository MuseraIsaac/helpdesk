import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  SYNC_RUN_STATUS_LABEL, SYNC_RUN_STATUS_COLOR, SYNC_TRIGGER_LABEL,
  type SyncRunDetail,
} from "core/constants/discovery.ts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ChevronLeft, CheckCircle2, PlusCircle, RefreshCw, SkipForward,
  XCircle, AlertTriangle, Clock, Loader2,
} from "lucide-react";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-2">
      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      <div>
        <p className={`text-xl font-semibold tabular-nums ${value > 0 ? color : "text-muted-foreground"}`}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function DiscoverySyncRunPage() {
  const { id } = useParams<{ id: string }>();

  const { data: run, isLoading, error } = useQuery<SyncRunDetail>({
    queryKey: ["discovery-run", id],
    queryFn:  () => axios.get(`/api/discovery/runs/${id}`).then(r => r.data),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "running" || status === "pending" ? 3000 : false;
    },
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (error || !run) return (
    <div className="p-6"><ErrorAlert error={error} fallback="Sync run not found" /></div>
  );

  const isActive = run.status === "running" || run.status === "pending";
  const duration = run.durationMs !== null
    ? run.durationMs < 1000
      ? `${run.durationMs}ms`
      : `${(run.durationMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/discovery" className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />Discovery
        </Link>
        <span>/</span>
        <span className="text-foreground">Run #{run.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            {isActive && <Loader2 className="w-5 h-5 animate-spin text-sky-500" />}
            Sync Run #{run.id}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {run.connectorLabel} · {run.source} · {SYNC_TRIGGER_LABEL[run.triggerType]}
            {run.triggeredByUser && ` by ${run.triggeredByUser.name}`}
          </p>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-xs border ${SYNC_RUN_STATUS_COLOR[run.status]}`}>
          {SYNC_RUN_STATUS_LABEL[run.status]}
        </span>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {[
          { label: "Started",   value: run.startedAt   ? new Date(run.startedAt).toLocaleString()   : "—" },
          { label: "Completed", value: run.completedAt ? new Date(run.completedAt).toLocaleString() : "—" },
          { label: "Duration",  value: duration ?? "—" },
          { label: "Discovered", value: String(run.assetsDiscovered) },
        ].map(m => (
          <div key={m.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="font-medium tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Created" value={run.assetsCreated} icon={PlusCircle}  color="text-emerald-600" />
        <StatCard label="Updated" value={run.assetsUpdated} icon={RefreshCw}   color="text-sky-600" />
        <StatCard label="Skipped" value={run.assetsSkipped} icon={SkipForward} color="text-muted-foreground" />
        <StatCard label="Failed"  value={run.assetsFailed}  icon={XCircle}     color="text-destructive" />
        <StatCard label="Stale"   value={run.assetsStale}   icon={AlertTriangle} color="text-amber-600" />
      </div>

      {/* Top-level error */}
      {run.errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium mb-1">Run failed</p>
          <p className="font-mono text-xs whitespace-pre-wrap">{run.errorMessage}</p>
        </div>
      )}

      {/* Stale detection note */}
      {run.assetsStale > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-300">
            <strong>{run.assetsStale}</strong> asset{run.assetsStale !== 1 ? "s were" : " was"} previously
            managed by <code className="text-xs">{run.source}</code> but absent from this sync run.
            Their <code className="text-xs">staleDetectedAt</code> timestamp has been set.
            Review these assets — they may have been decommissioned or removed from the source system.
          </span>
        </div>
      )}

      {/* Per-asset errors */}
      {run.errors.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-sm">
            Per-Asset Errors ({run.errorCount} total{run.errors.length < run.errorCount ? `, showing first ${run.errors.length}` : ""})
          </h3>
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["External ID", "Error", "Time"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.errors.map(e => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {e.externalId ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-destructive text-xs">{e.errorMessage}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isActive && (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Sync in progress — this page refreshes automatically.
        </p>
      )}
    </div>
  );
}
