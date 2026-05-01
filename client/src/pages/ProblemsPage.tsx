import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import axios from "axios";
import type { Problem } from "core/constants/problem.ts";
import { problemStatuses, problemStatusLabel } from "core/constants/problem-status.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ErrorAlert from "@/components/ErrorAlert";
import ModuleBulkActionsBar from "@/components/ModuleBulkActionsBar";
import {
  AlertCircle, ChevronRight, BookMarked, User, Plus,
  Bug, Activity, CheckCircle2, Search, X, Filter,
} from "lucide-react";

// ── Badges ────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  new:                   "bg-muted text-muted-foreground",
  under_investigation:   "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  root_cause_identified: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  known_error:           "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  change_required:       "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  resolved:              "bg-green-500/15 text-green-700 dark:text-green-400",
  closed:                "bg-muted text-muted-foreground",
};

export function ProblemStatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.new;
  return (
    <Badge variant="outline" className={`text-[11px] ${cls}`}>
      {problemStatusLabel[status as keyof typeof problemStatusLabel] ?? status}
    </Badge>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 border-red-300/60 dark:text-red-400 dark:border-red-500/30",
  high:   "bg-orange-500/15 text-orange-700 border-orange-300/60 dark:text-orange-400 dark:border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-300/60 dark:text-yellow-400 dark:border-yellow-500/30",
  low:    "bg-muted text-muted-foreground border-border",
};

export function ProblemPriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${cls}`}
    >
      {priority.toUpperCase()}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Stat chip ────────────────────────────────────────────────────────────────
//
// Compact summary card row with shared visual grammar across the ITSM list
// pages (Incidents, Changes, Problems). Coloured icon chip + label + tabular
// number; optional click drives a quick filter.

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
  value: number;
  active?: boolean;
  onClick?: () => void;
  tone: "neutral" | "danger" | "warning" | "success" | "info";
}) {
  const tones = {
    neutral: "border-border bg-card hover:border-foreground/20",
    danger:  "border-red-300/60 bg-red-500/[0.06] hover:border-red-400 dark:border-red-500/30",
    warning: "border-amber-300/60 bg-amber-500/[0.06] hover:border-amber-400 dark:border-amber-500/30",
    success: "border-emerald-300/60 bg-emerald-500/[0.06] hover:border-emerald-400 dark:border-emerald-500/30",
    info:    "border-blue-300/60 bg-blue-500/[0.06] hover:border-blue-400 dark:border-blue-500/30",
  };
  const iconTones = {
    neutral: "text-muted-foreground",
    danger:  "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
    info:    "text-blue-600 dark:text-blue-400",
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

// ── ProblemsPage ──────────────────────────────────────────────────────────────

export default function ProblemsPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  void currentUserId;

  const [searchInput,    setSearchInput]    = useState("");
  const [search,         setSearch]         = useState(""); // debounced
  const [statusFilter,   setStatusFilter]   = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [knownErrorOnly, setKnownErrorOnly] = useState(false);
  const [assignedToMe,   setAssignedToMe]   = useState(false);
  const [selectedIds,    setSelectedIds]    = useState<number[]>([]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // Debounce the search input by 300ms — see IncidentsPage for rationale.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function toggleRow(id: number) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleAll(ids: number[]) {
    setSelectedIds((prev) => prev.length === ids.length && ids.every((id) => prev.includes(id)) ? [] : ids);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["problems", { statusFilter, priorityFilter, knownErrorOnly, assignedToMe, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (knownErrorOnly) params.set("isKnownError", "true");
      if (assignedToMe) params.set("assignedToMe", "true");
      if (search.trim()) params.set("search", search.trim());
      const { data } = await axios.get<{
        problems: (Problem & { _count: { linkedIncidents: number } })[];
        meta: { total: number };
      }>(`/api/problems?${params}`);
      return data;
    },
  });

  const problems = data?.problems ?? [];
  const total = data?.meta.total ?? 0;

  // ── Derived stats ──────────────────────────────────────────────────────────
  // "Known Errors" counts records *currently in the Known Error workflow
  // status* — distinct from the `isKnownError` flag (KEDB membership), which
  // marks records that have been formally added to the Known Error Database
  // and is shown as the orange book icon next to titles in the table.
  const stats = useMemo(() => {
    let openCount = 0;
    let knownErrorCount = 0;
    let rootCauseCount = 0;
    let resolvedCount = 0;
    for (const p of problems) {
      const isOpen = p.status !== "resolved" && p.status !== "closed";
      if (isOpen) openCount++;
      if (p.status === "known_error") knownErrorCount++;
      if (p.status === "root_cause_identified") rootCauseCount++;
      if (p.status === "resolved" || p.status === "closed") resolvedCount++;
    }
    return { openCount, knownErrorCount, rootCauseCount, resolvedCount };
  }, [problems]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    knownErrorOnly ||
    assignedToMe ||
    search.trim().length > 0;

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setKnownErrorOnly(false);
    setAssignedToMe(false);
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 shrink-0">
            <Bug className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight leading-tight">Problems</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Root-cause investigations, known errors, and recurrence tracking.
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5 shadow-sm" onClick={() => navigate("/problems/new")}>
          <Plus className="h-4 w-4" />
          New Problem
        </Button>
      </div>

      {/* ── Stat strip ── */}
      <div className="flex flex-wrap gap-2.5">
        <StatChip
          icon={Bug}
          label="Total"
          value={total}
          tone="neutral"
        />
        <StatChip
          icon={Activity}
          label="Open"
          value={stats.openCount}
          tone="info"
          active={statusFilter === "all" && !knownErrorOnly && !assignedToMe && search.trim() === ""}
        />
        <StatChip
          icon={BookMarked}
          label="Known Errors"
          value={stats.knownErrorCount}
          tone="warning"
          active={statusFilter === "known_error"}
          onClick={() =>
            setStatusFilter((s) => (s === "known_error" ? "all" : "known_error"))
          }
        />
        <StatChip
          icon={AlertCircle}
          label="Root Cause Identified"
          value={stats.rootCauseCount}
          tone="warning"
          active={statusFilter === "root_cause_identified"}
          onClick={() =>
            setStatusFilter((s) => (s === "root_cause_identified" ? "all" : "root_cause_identified"))
          }
        />
        <StatChip
          icon={CheckCircle2}
          label="Resolved / Closed"
          value={stats.resolvedCount}
          tone="success"
        />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
          <Input
            placeholder="Search problems by title or number…"
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {problemStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {problemStatusLabel[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {["urgent", "high", "medium", "low"].map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={assignedToMe ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setAssignedToMe((v) => !v)}
        >
          <User className="h-3.5 w-3.5" />
          Assigned to me
        </Button>

        {hasActiveFilters && (
          <>
            <div className="h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
            >
              <Filter className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          </>
        )}
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load problems" />}

      {/* ── Table ── */}
      {isLoading ? (
        <div className="rounded-xl border bg-card p-3 space-y-2 shadow-sm">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : problems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 rounded-xl border border-dashed bg-muted/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background">
            <Bug className="h-5 w-5 text-muted-foreground/60" />
          </span>
          <div>
            <p className="text-sm font-semibold">No problems found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasActiveFilters
                ? "Try clearing some filters to see more results."
                : "When recurring incidents surface, log them here for root-cause analysis."}
            </p>
          </div>
          {hasActiveFilters ? (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={resetFilters}>
              <Filter className="h-3 w-3" />
              Clear filters
            </Button>
          ) : (
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => navigate("/problems/new")}>
              <Plus className="h-3.5 w-3.5" />
              New Problem
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-9 pl-3">
                  <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                    checked={problems.length > 0 && selectedIds.length === problems.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < problems.length; }}
                    onChange={() => toggleAll(problems.map((p) => p.id))} />
                </TableHead>
                <TableHead className="w-32 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Number</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Problem</TableHead>
                <TableHead className="w-20 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Priority</TableHead>
                <TableHead className="w-44 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Status</TableHead>
                <TableHead className="w-24 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Incidents</TableHead>
                <TableHead className="w-36 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Owner</TableHead>
                <TableHead className="w-24 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {problems.map((problem) => (
                <TableRow
                  key={problem.id}
                  className={`group cursor-pointer transition-colors ${selectedIds.includes(problem.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}
                  onClick={() => navigate(`/problems/${problem.problemNumber}`)}
                >
                  <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      checked={selectedIds.includes(problem.id)}
                      onChange={() => toggleRow(problem.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    <Link
                      to={`/problems/${problem.problemNumber}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-foreground transition-colors"
                    >
                      {problem.problemNumber}
                    </Link>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      {problem.isKnownError && (
                        <BookMarked
                          className="h-3.5 w-3.5 shrink-0 text-orange-500"
                          aria-label="Known Error"
                        />
                      )}
                      <span className="font-medium truncate group-hover:text-foreground">
                        {problem.title}
                      </span>
                    </div>
                    {problem.affectedService && (
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        {problem.affectedService}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <ProblemPriorityBadge priority={problem.priority} />
                  </TableCell>

                  <TableCell>
                    <ProblemStatusBadge status={problem.status} />
                  </TableCell>

                  <TableCell className="text-sm">
                    {(problem._count as any)?.linkedIncidents > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        {(problem._count as any).linkedIncidents}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {problem.owner?.name ?? (
                      <span className="italic text-xs text-muted-foreground/60">Unowned</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatRelative(problem.createdAt)}
                  </TableCell>

                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ModuleBulkActionsBar
        selectedIds={selectedIds}
        onClearSelection={clearSelection}
        endpoint="/api/problems"
        queryKey={["problems"]}
        entityLabel="problem"
        statusOptions={problemStatuses.map((s) => ({ value: s, label: problemStatusLabel[s] }))}
      />
    </div>
  );
}
