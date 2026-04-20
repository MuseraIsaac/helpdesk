import { useState, useCallback } from "react";
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
import { AlertCircle, ChevronRight, BookMarked, User, Plus } from "lucide-react";

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
  urgent: "bg-red-500/15 text-red-700 border-red-200 dark:text-red-400",
  high:   "bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-200 dark:text-yellow-400",
  low:    "bg-muted text-muted-foreground border-border",
};

export function ProblemPriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {priority}
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

// ── ProblemsPage ──────────────────────────────────────────────────────────────

export default function ProblemsPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [knownErrorOnly, setKnownErrorOnly] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

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
  const knownErrorCount = problems.filter(
    (p) => p.isKnownError && p.status !== "closed"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} problem{total !== 1 ? "s" : ""}
            {knownErrorCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium">
                <BookMarked className="h-3.5 w-3.5" />
                {knownErrorCount} known error{knownErrorCount !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate("/problems/new")}>
          <Plus className="h-4 w-4" />
          New Problem
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search problems…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs w-52 pl-3"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-8 text-xs">
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
          <SelectTrigger className="w-36 h-8 text-xs">
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
          variant={knownErrorOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setKnownErrorOnly((v) => !v)}
        >
          <BookMarked className="h-3.5 w-3.5 mr-1.5" />
          Known errors only
        </Button>

        <Button
          variant={assignedToMe ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAssignedToMe((v) => !v)}
        >
          <User className="h-3.5 w-3.5 mr-1.5" />
          Assigned to me
        </Button>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load problems" />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : problems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No problems found</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pl-3">
                  <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                    checked={problems.length > 0 && selectedIds.length === problems.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < problems.length; }}
                    onChange={() => toggleAll(problems.map((p) => p.id))} />
                </TableHead>
                <TableHead className="w-28">Number</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead className="w-44">Status</TableHead>
                <TableHead className="w-28">Incidents</TableHead>
                <TableHead className="w-36">Owner</TableHead>
                <TableHead className="w-24">Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {problems.map((problem) => (
                <TableRow key={problem.id} className={`group ${selectedIds.includes(problem.id) ? "bg-primary/5" : ""}`}>
                  <TableCell className="pl-3">
                    <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      checked={selectedIds.includes(problem.id)}
                      onChange={() => toggleRow(problem.id)}
                      onClick={(e) => e.stopPropagation()} />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    <Link
                      to={`/problems/${problem.id}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {problem.problemNumber}
                    </Link>
                  </TableCell>

                  <TableCell>
                    <Link
                      to={`/problems/${problem.id}`}
                      className="hover:text-foreground/80 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {problem.isKnownError && (
                          <BookMarked
                            className="h-3.5 w-3.5 shrink-0 text-orange-500"
                            title="Known Error (KEDB)"
                          />
                        )}
                        <span className="font-medium truncate max-w-xs">
                          {problem.title}
                        </span>
                      </div>
                      {problem.affectedService && (
                        <span className="text-xs text-muted-foreground">
                          {problem.affectedService}
                        </span>
                      )}
                    </Link>
                  </TableCell>

                  <TableCell>
                    <ProblemPriorityBadge priority={problem.priority} />
                  </TableCell>

                  <TableCell>
                    <ProblemStatusBadge status={problem.status} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {(problem._count as any)?.linkedIncidents > 0 ? (
                      <span className="text-xs">
                        {(problem._count as any).linkedIncidents} incident
                        {(problem._count as any).linkedIncidents !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {problem.owner?.name ?? (
                      <span className="italic text-xs">Unowned</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(problem.createdAt)}
                  </TableCell>

                  <TableCell>
                    <Link to={`/problems/${problem.id}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
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
