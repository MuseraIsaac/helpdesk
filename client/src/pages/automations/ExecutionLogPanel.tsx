/**
 * ExecutionLogPanel — Per-rule execution history viewer.
 *
 * Renders execution records from GET /api/automations/:id/executions.
 * Each row is expandable to show per-step action results.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, SkipForward, Loader2, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExecutionStep {
  id: number;
  actionType: string;
  applied: boolean;
  skippedReason: string | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
}

interface Execution {
  id: number;
  entityType: string;
  entityId: number;
  trigger: string;
  status: "running" | "completed" | "failed" | "skipped";
  startedAt: string;
  completedAt: string | null;
  steps: ExecutionStep[];
}

interface ExecutionLogResponse {
  rule: { id: number; name: string };
  executions: Execution[];
  total: number;
  limit: number;
  offset: number;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Execution["status"] }) {
  const map: Record<Execution["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    completed: { label: "Completed", variant: "default" },
    failed:    { label: "Failed",    variant: "destructive" },
    skipped:   { label: "Skipped",   variant: "secondary" },
    running:   { label: "Running",   variant: "outline" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({ step }: { step: ExecutionStep }) {
  const Icon = step.applied
    ? CheckCircle2
    : step.errorMessage
    ? XCircle
    : SkipForward;

  const iconClass = step.applied
    ? "text-green-500"
    : step.errorMessage
    ? "text-destructive"
    : "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 py-1 text-xs">
      <Icon className={`size-3.5 mt-0.5 shrink-0 ${iconClass}`} />
      <div className="min-w-0">
        <span className="font-mono text-muted-foreground">{step.actionType}</span>
        {step.skippedReason && (
          <span className="ml-2 text-muted-foreground">({step.skippedReason})</span>
        )}
        {step.errorMessage && (
          <span className="ml-2 text-destructive">{step.errorMessage}</span>
        )}
        {step.applied && step.meta && Object.keys(step.meta).length > 0 && (
          <span className="ml-2 text-muted-foreground">
            {Object.entries(step.meta)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Execution row ─────────────────────────────────────────────────────────────

function ExecutionRow({ execution }: { execution: Execution }) {
  const [expanded, setExpanded] = useState(false);

  const durationMs = execution.completedAt
    ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
    : null;

  const appliedCount = execution.steps.filter((s) => s.applied).length;
  const errorCount   = execution.steps.filter((s) => s.errorMessage).length;

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {expanded
          ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}

        <StatusBadge status={execution.status} />

        <span className="text-xs font-mono text-muted-foreground shrink-0">
          {execution.entityType}#{execution.entityId}
        </span>

        <span className="text-xs text-muted-foreground truncate flex-1">
          {execution.trigger}
        </span>

        {execution.steps.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {appliedCount}/{execution.steps.length} applied
            {errorCount > 0 && <span className="text-destructive ml-1">· {errorCount} err</span>}
          </span>
        )}

        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
          <Clock className="size-3" />
          {new Date(execution.startedAt).toLocaleString(undefined, {
            month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit",
          })}
          {durationMs !== null && ` (${durationMs}ms)`}
        </span>
      </button>

      {expanded && execution.steps.length > 0 && (
        <div className="px-8 pb-3 bg-muted/20 space-y-0.5">
          {execution.steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}

      {expanded && execution.steps.length === 0 && (
        <p className="px-8 pb-3 text-xs text-muted-foreground italic">
          {execution.status === "skipped" ? "Conditions did not match — no actions ran." : "No action steps recorded."}
        </p>
      )}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface ExecutionLogPanelProps {
  ruleId: number;
}

export default function ExecutionLogPanel({ ruleId }: ExecutionLogPanelProps) {
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading, error, refetch, isFetching } = useQuery<ExecutionLogResponse>({
    queryKey: ["automation-executions", ruleId, offset],
    queryFn: async () => {
      const { data } = await axios.get(
        `/api/automations/${ruleId}/executions?limit=${limit}&offset=${offset}`
      );
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
      </div>
    );
  }

  if (error) {
    return <ErrorAlert error={error} fallback="Failed to load execution history" />;
  }

  const executions = data?.executions ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString()} total execution{total !== 1 ? "s" : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="size-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="size-3 mr-1" />
          )}
          Refresh
        </Button>
      </div>

      {executions.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No executions yet — this rule has not fired.
        </p>
      ) : (
        <div className="divide-y-0">
          {executions.map((ex) => (
            <ExecutionRow key={ex.id} execution={ex} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
