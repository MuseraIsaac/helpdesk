import { useState } from "react";
import { Link } from "react-router";
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
import NewIncidentDialog from "@/components/NewIncidentDialog";
import {
  AlertTriangle,
  Flame,
  ChevronRight,
  Clock,
  Shield,
} from "lucide-react";

// ── Badges ────────────────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  p1: "bg-red-500/15 text-red-700 border-red-200 dark:text-red-400",
  p2: "bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400",
  p3: "bg-yellow-500/15 text-yellow-700 border-yellow-200 dark:text-yellow-400",
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

// ── IncidentsPage ─────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [majorOnly, setMajorOnly] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["incidents", { statusFilter, priorityFilter, majorOnly, assignedToMe }],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (majorOnly) params.set("isMajor", "true");
      if (assignedToMe) params.set("assignedToMe", "true");
      const { data } = await axios.get<{
        incidents: Incident[];
        meta: { total: number };
      }>(`/api/incidents?${params}`);
      return data;
    },
  });

  const incidents = data?.incidents ?? [];
  const total = data?.meta.total ?? 0;
  const majorCount = incidents.filter((i) => i.isMajor && i.status !== "closed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} incident{total !== 1 ? "s" : ""}
            {majorCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-destructive font-medium">
                <Flame className="h-3.5 w-3.5" />
                {majorCount} major
              </span>
            )}
          </p>
        </div>
        <NewIncidentDialog />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
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
          <SelectTrigger className="w-44 h-8 text-xs">
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
          variant={majorOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setMajorOnly((v) => !v)}
        >
          <Flame className="h-3.5 w-3.5 mr-1.5" />
          Major only
        </Button>

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

      {error && <ErrorAlert error={error} fallback="Failed to load incidents" />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No incidents found</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
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
                <TableRow key={incident.id} className="group">
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    <Link
                      to={`/incidents/${incident.id}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {incident.incidentNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/incidents/${incident.id}`}
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
                    <Link to={`/incidents/${incident.id}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
