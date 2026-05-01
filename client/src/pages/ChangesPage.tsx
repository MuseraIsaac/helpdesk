import { useState, useEffect, useMemo, useCallback } from "react";
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
  GitMerge,
  ChevronRight,
  Shield,
  AlertTriangle,
  Plus,
  Search,
  X,
  Filter,
  Activity,
  CheckCircle2,
} from "lucide-react";

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
  low:      "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-500/30",
  medium:   "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400 dark:border-yellow-500/30",
  high:     "bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-500/30",
  critical: "bg-red-500/15 text-red-700 border-red-200 dark:text-red-400 dark:border-red-500/30",
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

// ── Stat chip ────────────────────────────────────────────────────────────────
//
// Shared visual grammar with IncidentsPage — coloured icon badge + label +
// tabular number, optionally clickable to drive a filter.

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

// ── ChangesPage ───────────────────────────────────────────────────────────────

export default function ChangesPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const navigate = useNavigate();

  const [searchInput,  setSearchInput]  = useState("");
  const [search,       setSearch]       = useState(""); // debounced
  const [stateFilter,  setStateFilter]  = useState<string>("all");
  const [typeFilter,   setTypeFilter]   = useState<string>("all");
  const [riskFilter,   setRiskFilter]   = useState<string>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<number[]>([]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // Debounce search keystrokes by 300ms — long enough to avoid a request
  // per character, short enough that paste-resolves feel instant.
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

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["changes", { search, stateFilter, typeFilter, riskFilter, assignedToMe }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (search)                       params.set("search",     search);
      if (stateFilter !== "all")        params.set("state",      stateFilter);
      if (typeFilter  !== "all")        params.set("changeType", typeFilter);
      if (riskFilter  !== "all")        params.set("risk",       riskFilter);
      if (assignedToMe && currentUserId) params.set("assignedToMe", "true");
      const { data } = await axios.get<{
        changes: Change[];
        meta: { total: number };
      }>(`/api/changes?${params}`);
      return data;
    },
    // Keep showing previous results while the next page loads — avoids the
    // table flashing to skeleton on every keystroke.
    placeholderData: (prev) => prev,
  });

  const changes = data?.changes ?? [];
  const total   = data?.meta.total ?? 0;

  // Counts are computed from the currently loaded result set, so they
  // always match the rows the user can see. Each chip's count should
  // equal what the user gets if they click that chip as a filter —
  // that's why emergency counts every emergency change (not just open
  // ones); previously the chip read 1 even when 3 emergency rows were
  // visible because it was filtering out closed/cancelled.
  const stats = useMemo(() => {
    const emergency = changes.filter((c) => c.changeType === "emergency").length;
    const inFlight  = changes.filter((c) => ["assess", "authorize", "scheduled", "implement", "review"].includes(c.state)).length;
    const completed = changes.filter((c) => c.state === "closed").length;
    return { emergency, inFlight, completed };
  }, [changes]);

  const hasFilter =
    search !== "" ||
    stateFilter !== "all" ||
    typeFilter !== "all" ||
    riskFilter !== "all" ||
    assignedToMe;

  function clearAllFilters() {
    setSearchInput(""); setSearch("");
    setStateFilter("all"); setTypeFilter("all"); setRiskFilter("all");
    setAssignedToMe(false);
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/40 bg-gradient-to-br from-violet-500/15 to-indigo-500/10 shadow-sm">
            <GitMerge className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Change Requests</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total} change{total !== 1 ? "s" : ""}
              {hasFilter && <span className="text-muted-foreground/60"> · filtered</span>}
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5 shadow-sm" onClick={() => navigate("/changes/new")}>
          <Plus className="h-3.5 w-3.5" />
          New Change
        </Button>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <StatChip
          icon={GitMerge}
          label="Total"
          value={total}
          tone="neutral"
        />
        <StatChip
          icon={AlertTriangle}
          label="Emergency"
          value={stats.emergency}
          tone="danger"
          active={typeFilter === "emergency"}
          onClick={() => setTypeFilter((v) => v === "emergency" ? "all" : "emergency")}
        />
        <StatChip
          icon={Activity}
          label="In Flight"
          value={stats.inFlight}
          tone="warning"
        />
        <StatChip
          icon={CheckCircle2}
          label="Closed"
          value={stats.completed}
          tone="success"
        />
      </div>

      {/* ── Toolbar: search + filters ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by number, title, service, or category…"
            className="h-9 pl-9 pr-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchInput) {
                e.preventDefault();
                setSearchInput("");
              }
            }}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-44 h-9 text-xs">
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
          <SelectTrigger className="w-40 h-9 text-xs">
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
          <SelectTrigger className="w-36 h-9 text-xs">
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
          className="h-9 text-xs"
          onClick={() => setAssignedToMe((v) => !v)}
          disabled={!currentUserId}
        >
          <Shield className="h-3.5 w-3.5 mr-1.5" />
          Assigned to me
        </Button>

        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={clearAllFilters}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        {isFetching && !isLoading && (
          <span className="ml-auto text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Updating…
          </span>
        )}
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load change requests" />}

      {isLoading ? (
        <div className="rounded-md border border-border/60 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none" />
          ))}
        </div>
      ) : changes.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-card flex flex-col items-center justify-center py-16 text-center gap-3 px-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 border">
            {hasFilter
              ? <Filter className="h-5 w-5 text-muted-foreground" />
              : <GitMerge className="h-5 w-5 text-muted-foreground" />}
          </span>
          <div>
            <p className="text-sm font-medium">
              {hasFilter ? "No changes match your filters" : "No change requests yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasFilter
                ? "Try a different search term or clear filters to see all changes."
                : "Submit your first change request to get started."}
            </p>
          </div>
          {hasFilter && (
            <Button variant="outline" size="sm" className="mt-1" onClick={clearAllFilters}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
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
                  className={`group cursor-pointer transition-colors ${selectedIds.includes(change.id) ? "bg-primary/5" : "hover:bg-muted/40"}`}
                  onClick={() => navigate(`/changes/${change.id}`)}
                >
                  <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      checked={selectedIds.includes(change.id)}
                      onChange={() => toggleRow(change.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    <Link
                      to={`/changes/${change.changeNumber}`}
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
