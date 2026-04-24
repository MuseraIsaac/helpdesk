/**
 * AutomationExecutionsPage — Global Execution Log
 *
 * Displays all rule executions across every category.
 * Supports filtering by: rule, category, status, trigger.
 * Expandable rows show per-step detail (action applied / skipped / error).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import axios from "axios";
import {
  ArrowLeft, CheckCircle2, XCircle, Minus, ChevronDown,
  ChevronRight, RefreshCw, History, AlertTriangle, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import type { AutomationCategory } from "core/constants/automation";
import {
  AUTOMATION_CATEGORIES, AUTOMATION_ACTION_LABELS,
} from "core/constants/automation";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecutionStep {
  id: number;
  actionType: string;
  applied: boolean;
  skippedReason: string | null;
  errorMessage: string | null;
}

interface Execution {
  id: number;
  ruleId: number;
  entityType: string;
  entityId: number;
  trigger: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  rule: { id: number; name: string; category: AutomationCategory } | null;
  steps: ExecutionStep[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function durationMs(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ── Expanded step detail ─────────────────────────────────────────────────────

function StepDetail({ steps }: { steps: ExecutionStep[] }) {
  const applied = steps.filter((s) => s.applied).length;
  const skipped = steps.filter((s) => !s.applied && !s.errorMessage).length;
  const errors  = steps.filter((s) => !!s.errorMessage).length;

  return (
    <div className="px-8 pb-3 pt-1">
      <div className="rounded border bg-muted/20 overflow-hidden">
        {/* Summary bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="size-3" /> {applied} applied
          </span>
          <span className="flex items-center gap-1">
            <Minus className="size-3" /> {skipped} skipped
          </span>
          {errors > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" /> {errors} error{errors !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {/* Steps */}
        <table className="w-full text-xs">
          <tbody>
            {steps.map((step) => (
              <tr key={step.id} className={`border-b last:border-0 ${step.errorMessage ? "bg-destructive/5" : ""}`}>
                <td className="w-6 px-3 py-1.5">
                  {step.applied ? (
                    <CheckCircle2 className="size-3 text-emerald-500" />
                  ) : step.errorMessage ? (
                    <AlertTriangle className="size-3 text-destructive" />
                  ) : (
                    <Minus className="size-3 text-muted-foreground/40" />
                  )}
                </td>
                <td className="px-2 py-1.5 font-medium text-foreground">
                  {AUTOMATION_ACTION_LABELS[step.actionType as keyof typeof AUTOMATION_ACTION_LABELS] ?? step.actionType}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {step.applied ? (
                    <span className="text-emerald-600 text-[10px]">applied</span>
                  ) : step.errorMessage ? (
                    <span className="text-destructive text-[10px]">{step.errorMessage}</span>
                  ) : (
                    <span className="text-[10px]">{step.skippedReason ?? "skipped"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = Object.keys(AUTOMATION_CATEGORIES) as AutomationCategory[];

export default function AutomationExecutionsPage() {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [category, setCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["automation-executions-full", category, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (category !== "all")      params.set("category", category);
      if (statusFilter !== "all")  params.set("status", statusFilter);
      const { data } = await axios.get<{ executions: Execution[]; total: number }>(
        `/api/automations/executions?${params}`
      );
      return data;
    },
  });

  const executions = data?.executions ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / limit);

  return (
    <div className="max-w-screen-xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate("/automations")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <History className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-bold">Execution Log</h1>
            <p className="text-xs text-muted-foreground">
              All automation rule evaluations — {total.toLocaleString()} total
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load execution log" />}

      {/* Filters */}
      <div className="flex items-center gap-3 pb-1 border-b">
        <Filter className="size-3.5 text-muted-foreground shrink-0" />
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}>
          <SelectTrigger className="w-52 h-8 text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ALL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{AUTOMATION_CATEGORIES[c].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center border rounded-md overflow-hidden h-8">
          {([
            { value: "all",       label: "All" },
            { value: "completed", label: "Completed" },
            { value: "failed",    label: "Failed" },
          ]).map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setStatusFilter(f.value); setPage(0); }}
              className={`px-3 text-xs h-full transition-colors border-r last:border-r-0 ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {total.toLocaleString()} execution{total !== 1 ? "s" : ""}
          {pageCount > 1 && ` — page ${page + 1} of ${pageCount}`}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : executions.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <History className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No executions found</p>
          <p className="text-xs text-muted-foreground mt-1">Try clearing the filters.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2 text-left font-medium">Rule</th>
                <th className="w-36 px-3 py-2 text-left font-medium">Category</th>
                <th className="w-44 px-3 py-2 text-left font-medium">Trigger</th>
                <th className="w-28 px-3 py-2 text-left font-medium">Entity</th>
                <th className="w-20 px-3 py-2 text-center font-medium">Status</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Duration</th>
                <th className="w-24 px-3 py-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((ex) => {
                const isExpanded = expandedId === ex.id;
                const appliedCount = ex.steps.filter((s) => s.applied).length;
                const errorCount   = ex.steps.filter((s) => !!s.errorMessage).length;

                return (
                  <>
                    <tr
                      key={ex.id}
                      className={`group border-b cursor-pointer transition-colors ${isExpanded ? "bg-muted/30" : "hover:bg-muted/20"}`}
                      onClick={() => setExpandedId(isExpanded ? null : ex.id)}
                    >
                      {/* Expand toggle */}
                      <td className="px-3 py-2.5 w-8">
                        {isExpanded
                          ? <ChevronDown className="size-3.5 text-muted-foreground" />
                          : <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                        }
                      </td>

                      {/* Rule name */}
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="font-medium text-foreground hover:underline truncate block max-w-64 text-left"
                          onClick={(e) => { e.stopPropagation(); navigate(`/automations/rules/${ex.ruleId}`); }}
                        >
                          {ex.rule?.name ?? `Rule #${ex.ruleId}`}
                        </button>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground/60">
                            {appliedCount} applied
                            {errorCount > 0 && ` · `}
                            {errorCount > 0 && <span className="text-destructive">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {ex.rule?.category
                          ? AUTOMATION_CATEGORIES[ex.rule.category]?.label
                          : "—"}
                      </td>

                      {/* Trigger */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {ex.trigger}
                        </span>
                      </td>

                      {/* Entity */}
                      <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">
                        {ex.entityType}:{ex.entityId}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5 text-center">
                        {ex.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="size-3" />
                            OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <XCircle className="size-3" />
                            Fail
                          </span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-3 py-2.5 text-right text-xs font-mono text-muted-foreground">
                        {durationMs(ex.startedAt, ex.completedAt)}
                      </td>

                      {/* When */}
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                        {relativeTime(ex.startedAt)}
                      </td>
                    </tr>

                    {/* Expanded step detail */}
                    {isExpanded && (
                      <tr key={`${ex.id}-detail`} className="border-b bg-muted/10">
                        <td colSpan={8} className="p-0">
                          <StepDetail steps={ex.steps} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline" size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="outline" size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
