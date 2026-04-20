import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import axios from "axios";
import {
  type Change,
  changeStates,
  changeStateLabel,
  changeTypes,
  changeTypeLabel,
  changeRisks,
  changeRiskLabel,
} from "core/constants/change.ts";
import { priorityLabel } from "core/constants/ticket-priority.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { GitMerge, ChevronRight, Shield, AlertTriangle, Plus } from "lucide-react";

// ── Badge components ──────────────────────────────────────────────────────────

const STATE_STYLES: Record<string, string> = {
  draft:      "bg-muted text-muted-foreground",
  submitted:  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  assess:     "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  authorize:  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  scheduled:  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  implement:  "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  review:     "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  closed:     "bg-green-500/15 text-green-700 dark:text-green-400",
  cancelled:  "bg-muted text-muted-foreground line-through",
  failed:     "bg-destructive/15 text-destructive",
};

function ChangeStateBadge({ state }: { state: string }) {
  const cls = STATE_STYLES[state] ?? STATE_STYLES.draft;
  return (
    <Badge variant="outline" className={`text-[11px] ${cls}`}>
      {changeStateLabel[state as keyof typeof changeStateLabel] ?? state}
    </Badge>
  );
}

const TYPE_STYLES: Record<string, string> = {
  standard:  "bg-muted text-muted-foreground",
  normal:    "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  emergency: "bg-destructive/15 text-destructive",
};

function ChangeTypeBadge({ type }: { type: string }) {
  const cls = TYPE_STYLES[type] ?? TYPE_STYLES.normal;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium border-transparent ${cls}`}>
      {changeTypeLabel[type as keyof typeof changeTypeLabel] ?? type}
    </span>
  );
}

const RISK_STYLES: Record<string, string> = {
  low:      "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400",
  medium:   "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400",
  high:     "bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400",
  critical: "bg-red-500/15 text-red-700 border-red-200 dark:text-red-400",
};

function ChangeRiskBadge({ risk }: { risk: string }) {
  const cls = RISK_STYLES[risk] ?? RISK_STYLES.medium;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ${cls}`}>
      {changeRiskLabel[risk as keyof typeof changeRiskLabel] ?? risk}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  low:    "bg-muted text-muted-foreground",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  high:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  urgent: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {priorityLabel[priority as keyof typeof priorityLabel] ?? priority}
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

function formatDate(iso: string | null | undefined) {
  if (!iso) return <span className="text-muted-foreground/50">—</span>;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── ChangesPage ───────────────────────────────────────────────────────────────

export default function ChangesPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const navigate = useNavigate();

  const [stateFilter, setStateFilter]  = useState<string>("all");
  const [typeFilter, setTypeFilter]    = useState<string>("all");
  const [riskFilter, setRiskFilter]    = useState<string>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  function toggleRow(id: number) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleAll(ids: number[]) {
    setSelectedIds((prev) => prev.length === ids.length && ids.every((id) => prev.includes(id)) ? [] : ids);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["changes", { stateFilter, typeFilter, riskFilter, assignedToMe }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (stateFilter  !== "all") params.set("state",      stateFilter);
      if (typeFilter   !== "all") params.set("changeType", typeFilter);
      if (riskFilter   !== "all") params.set("risk",       riskFilter);
      if (assignedToMe && currentUserId) params.set("assignedToMe", "true");
      const { data } = await axios.get<{
        changes: Change[];
        meta: { total: number };
      }>(`/api/changes?${params}`);
      return data;
    },
  });

  const changes = data?.changes ?? [];
  const total   = data?.meta.total ?? 0;

  const emergencyCount = changes.filter(
    (c) => c.changeType === "emergency" && c.state !== "closed" && c.state !== "cancelled"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Change Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} change{total !== 1 ? "s" : ""}
            {emergencyCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-destructive font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {emergencyCount} emergency
              </span>
            )}
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => navigate("/changes/new")}>
          <Plus className="h-3.5 w-3.5" />
          New Change
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {changeStates.map((s) => (
              <SelectItem key={s} value={s}>
                {changeStateLabel[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {changeTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {changeTypeLabel[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risks</SelectItem>
            {changeRisks.map((r) => (
              <SelectItem key={r} value={r}>
                {changeRiskLabel[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={assignedToMe ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAssignedToMe((v) => !v)}
        >
          <Shield className="h-3.5 w-3.5 mr-1.5" />
          Assigned to me
        </Button>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load change requests" />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : changes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <GitMerge className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No change requests found</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pl-3">
                  <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                    checked={changes.length > 0 && selectedIds.length === changes.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < changes.length; }}
                    onChange={() => toggleAll(changes.map((c) => c.id))} />
                </TableHead>
                <TableHead className="w-32">Number</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-32">State</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-24">Risk</TableHead>
                <TableHead className="w-24">Priority</TableHead>
                <TableHead className="w-36">Assigned To</TableHead>
                <TableHead className="w-36">Coordinator</TableHead>
                <TableHead className="w-28">Planned Start</TableHead>
                <TableHead className="w-24">Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map((change) => (
                <TableRow
                  key={change.id}
                  className={`group cursor-pointer ${selectedIds.includes(change.id) ? "bg-primary/5" : ""}`}
                  onClick={() => navigate(`/changes/${change.id}`)}
                >
                  <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      checked={selectedIds.includes(change.id)}
                      onChange={() => toggleRow(change.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    <Link
                      to={`/changes/${change.id}`}
                      className="hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {change.changeNumber}
                    </Link>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium truncate max-w-sm leading-snug">
                        {change.title}
                      </span>
                      {change.categorizationTier1 && (
                        <span className="text-[11px] text-muted-foreground">
                          {change.categorizationTier1}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <ChangeStateBadge state={change.state} />
                  </TableCell>

                  <TableCell>
                    <ChangeTypeBadge type={change.changeType} />
                  </TableCell>

                  <TableCell>
                    <ChangeRiskBadge risk={change.risk} />
                  </TableCell>

                  <TableCell>
                    <PriorityBadge priority={change.priority} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {change.assignedTo?.name ?? (
                      <span className="italic text-xs">Unassigned</span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {change.coordinatorGroup ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: change.coordinatorGroup.color }}
                        />
                        {change.coordinatorGroup.name}
                      </span>
                    ) : (
                      <span className="italic text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(change.plannedStart)}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(change.createdAt)}
                  </TableCell>

                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
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
        endpoint="/api/changes"
        queryKey={["changes"]}
        entityLabel="change"
        teamLabel="Assign Coordinator Group"
      />
    </div>
  );
}
