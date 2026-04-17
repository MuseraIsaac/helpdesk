/**
 * ChangeConflictsTab — displays detected conflicts for a change request.
 *
 * Queries GET /api/changes/:changeId/conflicts and renders each conflicting
 * change with its severity, conflict types, and a link to the change detail.
 *
 * Conflict detection is query-derived at request time (V1).
 * See server/src/lib/change-conflicts.ts for the detection algorithm.
 */

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Shield,
} from "lucide-react";
import type {
  ConflictResult,
  ConflictType,
  ConflictSeverity,
} from "core/constants/change-conflict.ts";
import {
  conflictTypeLabel,
  conflictTypeDescription,
  conflictSeverityLabel,
} from "core/constants/change-conflict.ts";

// ── Severity styling ──────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<ConflictSeverity, string> = {
  high:   "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low:    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25",
};

const SEVERITY_ICON: Record<ConflictSeverity, React.ReactNode> = {
  high:   <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
  medium: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
  low:    <Shield        className="h-3.5 w-3.5 shrink-0" />,
};

// ── Type chip ─────────────────────────────────────────────────────────────────

function ConflictTypeChip({ type }: { type: ConflictType }) {
  return (
    <span
      title={conflictTypeDescription[type]}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {conflictTypeLabel[type]}
    </span>
  );
}

// ── Date formatter ────────────────────────────────────────────────────────────

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return "No window set";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start)        return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

// ── Conflict row ──────────────────────────────────────────────────────────────

function ConflictRow({ result }: { result: ConflictResult }) {
  const { change, types, severity } = result;

  return (
    <div className={`rounded-lg border p-3 ${SEVERITY_STYLE[severity]}`}>
      <div className="flex items-start justify-between gap-3">
        {/* Left: severity icon + change info */}
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5">{SEVERITY_ICON[severity]}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/changes/${change.id}`}
                className="font-mono text-xs font-semibold hover:underline inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {change.changeNumber}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Link>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 capitalize"
              >
                {change.state}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 capitalize"
              >
                {change.changeType}
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] font-medium leading-snug truncate">
              {change.title}
            </p>
            {/* Metadata row */}
            <div className="mt-1 flex items-center gap-3 text-[11px] opacity-80 flex-wrap">
              {change.plannedStart || change.plannedEnd ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatWindow(change.plannedStart, change.plannedEnd)}
                </span>
              ) : null}
              {change.assignedTo && (
                <span>{change.assignedTo.name}</span>
              )}
              {change.coordinatorGroup && (
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: change.coordinatorGroup.color }}
                  />
                  {change.coordinatorGroup.name}
                </span>
              )}
              {change.configurationItem && (
                <span>{change.configurationItem.ciNumber} · {change.configurationItem.name}</span>
              )}
              {change.service && (
                <span>{change.service.name}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: severity badge */}
        <div className="shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
            {conflictSeverityLabel[severity]}
          </span>
        </div>
      </div>

      {/* Conflict type chips */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {types.map((t) => (
          <ConflictTypeChip key={t} type={t} />
        ))}
      </div>
    </div>
  );
}

// ── ChangeConflictsTab ────────────────────────────────────────────────────────

interface ChangeConflictsTabProps {
  changeId: number;
}

export default function ChangeConflictsTab({ changeId }: ChangeConflictsTabProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["change-conflicts", changeId],
    queryFn: async () => {
      const { data } = await axios.get<{ conflicts: ConflictResult[] }>(
        `/api/changes/${changeId}/conflicts`
      );
      return data.conflicts;
    },
  });

  const conflicts = data ?? [];
  const highCount   = conflicts.filter((c) => c.severity === "high").length;
  const mediumCount = conflicts.filter((c) => c.severity === "medium").length;

  return (
    <div className="space-y-3">
      {/* Header summary */}
      {!isLoading && !error && conflicts.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span>
            {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} detected
            {highCount > 0   && ` · ${highCount} high`}
            {mediumCount > 0 && ` · ${mediumCount} medium`}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {error && <ErrorAlert error={error} fallback="Failed to load conflict data" />}

      {!isLoading && !error && conflicts.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <span>No conflicts detected. This change has no overlapping schedules, shared CIs, services, or teams with other active changes.</span>
        </div>
      )}

      {conflicts.map((result) => (
        <ConflictRow key={result.change.id} result={result} />
      ))}

      {!isLoading && conflicts.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Conflicts are computed at request time against all non-terminal changes. Only schedule, CI, service, and team overlaps are detected in this version.
        </p>
      )}
    </div>
  );
}
