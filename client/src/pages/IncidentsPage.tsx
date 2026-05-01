import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import axios from "axios";
import { type Incident } from "core/constants/incident.ts";
import {
  incidentPriorities,
  incidentPriorityLabel,
  incidentPriorityShortLabel,
} from "core/constants/incident-priority.ts";
import { incidentStatuses, incidentStatusLabel } from "core/constants/incident-status.ts";
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
  AlertTriangle,
  Flame,
  ChevronRight,
  Clock,
  Shield,
  Search,
  Siren,
  X,
  Activity,
  CheckCircle2,
  Filter,
} from "lucide-react";

// ── Badges ────────────────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  p1: "bg-red-500/15 text-red-700 border-red-300/60 dark:text-red-400 dark:border-red-500/30",
  p2: "bg-orange-500/15 text-orange-700 border-orange-300/60 dark:text-orange-400 dark:border-orange-500/30",
  p3: "bg-yellow-500/15 text-yellow-700 border-yellow-300/60 dark:text-yellow-400 dark:border-yellow-500/30",
  p4: "bg-muted text-muted-foreground border-border",
};

export function IncidentPriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority as keyof typeof PRIORITY_STYLES] ?? PRIORITY_STYLES.p4;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${cls}`}
    >
      {incidentPriorityShortLabel[priority as keyof typeof incidentPriorityShortLabel] ?? priority.toUpperCase()}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new:          "bg-muted text-muted-foreground",
  acknowledged: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  in_progress:  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  resolved:     "bg-green-500/15 text-green-700 dark:text-green-400",
  closed:       "bg-muted text-muted-foreground",
};

export function IncidentStatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.new;
  return (
    <Badge variant="outline" className={`text-[11px] ${cls}`}>
      {incidentStatusLabel[status as keyof typeof incidentStatusLabel] ?? status}
    </Badge>
  );
}

export function SlaBadgeInline({
  slaStatus,
  minutesUntilBreach,
}: {
  slaStatus: string;
  minutesUntilBreach: number | null;
}) {
  if (slaStatus === "completed") return null;

  const abs = minutesUntilBreach !== null ? Math.abs(minutesUntilBreach) : null;
  const label =
    abs === null
      ? ""
      : abs < 60
      ? `${abs}m`
      : `${Math.round(abs / 60)}h`;

  if (slaStatus === "breached") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
        <Clock className="h-3 w-3" />
        {label} overdue
      </span>
    );
  }
  if (slaStatus === "at_risk") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        {label} left
      </span>
    );
  }
  return null;
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
// Compact summary card row. Colour echoes the meaning (rose for major,
// amber for in-flight, emerald for resolved). Click to apply the matching
// filter — turns the strip into a one-tap filter affordance instead of a
// passive readout.

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
  tone: "neutral" | "danger" | "warning" | "success";
}) {
  const tones = {
    neutral: "border-border bg-card hover:border-foreground/20",
    danger:  "border-red-300/60 bg-red-500/[0.06] hover:border-red-400 dark:border-red-500/30",
    warning: "border-amber-300/60 bg-amber-500/[0.06] hover:border-amber-400 dark:border-amber-500/30",
    success: "border-emerald-300/60 bg-emerald-500/[0.06] hover:border-emerald-400 dark:border-emerald-500/30",
  };
  const iconTones = {
    neutral: "text-muted-foreground",
    danger:  "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
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

// ── IncidentsPage ─────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";

  const [searchInput,    setSearchInput]    = useState("");
  const [search,         setSearch]         = useState(""); // debounced
  const [statusFilter,   setStatusFilter]   = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [majorOnly,      setMajorOnly]      = useState(false);
  const [assignedToMe,   setAssignedToMe]   = useState(false);
  const [selectedIds,    setSelectedIds]    = useState<number[]>([]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // Debounce the search input by 300ms so we don't fire a request on every
  // keystroke. Long enough to feel snappy on type-pause, short enough that
  // pasting an incident number resolves nearly instantly.
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
    queryKey: ["incidents", { search, statusFilter, priorityFilter, majorOnly, assignedToMe }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (search)                   params.set("search",   search);
      if (statusFilter   !== "all") params.set("status",   statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (majorOnly)                params.set("isMajor",  "true");
      if (assignedToMe)             params.set("assignedToMe", "true");
      const { data } = await axios.get<{
        incidents: Incident[];
        meta: { total: number };
      }>(`/api/incidents?${params}`);
      return data;
    },
    // Keep showing previous results while the next page loads — avoids the
    // table flashing to skeleton on every keystroke.
    placeholderData: (prev) => prev,
  });

  const incidents = data?.incidents ?? [];
  const total = data?.meta.total ?? 0;
  // Counts are computed from the currently loaded result set so each
  // chip's number matches what the user gets if they click it as a
  // filter. The "Major" chip's click toggles `majorOnly` regardless of
  // status, so the count must mirror that — counting every isMajor
  // row, not just open ones.
  const stats = useMemo(() => {
    const major    = incidents.filter((i) => i.isMajor).length;
    const active   = incidents.filter((i) => i.status === "in_progress" || i.status === "acknowledged" || i.status === "new").length;
    const resolved = incidents.filter((i) => i.status === "resolved" || i.status === "closed").length;
    return { major, active, resolved };
  }, [incidents]);

  const hasFilter = search !== "" || statusFilter !== "all" || priorityFilter !== "all" || majorOnly || assignedToMe;
  function clearAllFilters() {
    setSearchInput(""); setSearch("");
    setStatusFilter("all"); setPriorityFilter("all");
    setMajorOnly(false); setAssignedToMe(false);
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-300/40 bg-gradient-to-br from-red-500/15 to-orange-500/10 shadow-sm">
            <Siren className="h-5 w-5 text-red-600 dark:text-red-400" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total} incident{total !== 1 ? "s" : ""}
              {hasFilter && <span className="text-muted-foreground/60"> · filtered</span>}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5 shadow-sm bg-red-600 hover:bg-red-700 text-white border-0"
          onClick={() => navigate("/incidents/new")}
        >
          <Siren className="h-3.5 w-3.5" />
          Declare Incident
        </Button>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <StatChip
          icon={AlertTriangle}
          label="Total"
          value={total}
          tone="neutral"
        />
        <StatChip
          icon={Flame}
          label="Major"
          value={stats.major}
          tone="danger"
          active={majorOnly}
          onClick={() => setMajorOnly((v) => !v)}
        />
        <StatChip
          icon={Activity}
          label="Active"
          value={stats.active}
          tone="warning"
        />
        <StatChip
          icon={CheckCircle2}
          label="Resolved"
          value={stats.resolved}
          tone="success"
        />
      </div>

      {/* ── Toolbar: search + filters ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by number, title, or affected system…"
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {incidentStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {incidentStatusLabel[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-44 h-9 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {incidentPriorities.map((p) => (
              <SelectItem key={p} value={p}>
                {incidentPriorityLabel[p]}
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

      {error && <ErrorAlert error={error} fallback="Failed to load incidents" />}

      {isLoading ? (
        <div className="rounded-md border border-border/60 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-card flex flex-col items-center justify-center py-16 text-center gap-3 px-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 border">
            {hasFilter
              ? <Filter className="h-5 w-5 text-muted-foreground" />
              : <AlertTriangle className="h-5 w-5 text-muted-foreground" />}
          </span>
          <div>
            <p className="text-sm font-medium">
              {hasFilter ? "No incidents match your filters" : "No incidents yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasFilter
                ? "Try a different search term or clear filters to see all incidents."
                : "Declare your first incident to get started."}
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
                    checked={incidents.length > 0 && selectedIds.length === incidents.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < incidents.length; }}
                    onChange={() => toggleAll(incidents.map((i) => i.id))} />
                </TableHead>
                <TableHead className="w-28">Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-36">Commander</TableHead>
                <TableHead className="w-28">SLA</TableHead>
                <TableHead className="w-24">Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((incident) => (
                <TableRow
                  key={incident.id}
                  className={`group transition-colors ${selectedIds.includes(incident.id) ? "bg-primary/5" : "hover:bg-muted/40"}`}
                >
                  <TableCell className="pl-3">
                    <input type="checkbox" className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      checked={selectedIds.includes(incident.id)}
                      onChange={() => toggleRow(incident.id)}
                      onClick={(e) => e.stopPropagation()} />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    <Link
                      to={`/incidents/${incident.incidentNumber}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {incident.incidentNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/incidents/${incident.incidentNumber}`}
                      className="flex items-center gap-2 hover:text-foreground/80 transition-colors"
                    >
                      {incident.isMajor && (
                        <Flame className="h-3.5 w-3.5 shrink-0 text-destructive" title="Major incident" />
                      )}
                      <span className="font-medium truncate max-w-xs">{incident.title}</span>
                      {incident.affectedSystem && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          · {incident.affectedSystem}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <IncidentPriorityBadge priority={incident.priority} />
                  </TableCell>
                  <TableCell>
                    <IncidentStatusBadge status={incident.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {incident.commander?.name ?? (
                      <span className="italic text-xs">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <SlaBadgeInline
                      slaStatus={incident.slaStatus}
                      minutesUntilBreach={incident.minutesUntilBreach}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(incident.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Link to={`/incidents/${incident.incidentNumber}`}>
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
        endpoint="/api/incidents"
        queryKey={["incidents"]}
        entityLabel="incident"
        statusOptions={[
          { value: "new",          label: incidentStatusLabel.new },
          { value: "acknowledged", label: incidentStatusLabel.acknowledged },
          { value: "in_progress",  label: incidentStatusLabel.in_progress },
          { value: "resolved",     label: incidentStatusLabel.resolved },
          { value: "closed",       label: incidentStatusLabel.closed },
        ]}
      />
    </div>
  );
}
