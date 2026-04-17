import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { type Incident } from "core/constants/incident.ts";
import { incidentStatusLabel, incidentStatusTransitions } from "core/constants/incident-status.ts";
import type { IncidentStatus } from "core/constants/incident-status.ts";
import { incidentPriorityLabel, incidentPriorityShortLabel } from "core/constants/incident-priority.ts";
import type { IncidentPriority } from "core/constants/incident-priority.ts";
import {
  incidentUpdateTypes,
  incidentUpdateTypeLabel,
} from "core/constants/incident-update-type.ts";
import {
  createIncidentUpdateSchema,
  type CreateIncidentUpdateInput,
} from "core/schemas/incidents.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  IncidentPriorityBadge,
  IncidentStatusBadge,
  SlaBadgeInline,
} from "./IncidentsPage";
import NewProblemDialog from "@/components/NewProblemDialog";
import CiLinksPanel from "@/components/CiLinksPanel";
import {
  Flame,
  Users,
  Clock,
  UserCog,
  Shield,
  Server,
  MessageSquare,
  CheckCircle2,
  Pencil,
  Save,
  X,
  GitMerge,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(iso);
}

const UPDATE_TYPE_STYLES: Record<string, string> = {
  update:     "bg-muted text-muted-foreground",
  workaround: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  resolution: "bg-green-500/15 text-green-700 dark:text-green-400",
  escalation: "bg-red-500/15 text-destructive",
  all_clear:  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

const EVENT_LABELS: Record<string, (meta: Record<string, unknown>) => string> = {
  "incident.created":        ()    => "Incident declared",
  "incident.major_declared": ()    => "Flagged as major incident",
  "incident.major_cleared":  ()    => "Major incident flag removed",
  "incident.status_changed": (m)   => `Status: ${incidentStatusLabel[m.from as IncidentStatus] ?? m.from} → ${incidentStatusLabel[m.to as IncidentStatus] ?? m.to}`,
  "incident.priority_changed": (m) => `Priority: ${incidentPriorityShortLabel[m.from as IncidentPriority] ?? m.from} → ${incidentPriorityShortLabel[m.to as IncidentPriority] ?? m.to}`,
  "incident.commander_changed": (m) => m.to ? `Commander assigned` : `Commander removed`,
  "incident.assigned":       (m)   => m.to ? `Assignee changed` : `Assignee removed`,
  "incident.update_added":   (m)   => `Update added (${incidentUpdateTypeLabel[m.updateType as string] ?? m.updateType})`,
  "incident.promoted_to_problem": (m) => `Promoted to problem ${m.problemNumber ?? ""}`,
};

// ── Update timeline ───────────────────────────────────────────────────────────

interface UpdateTimelineProps {
  updates: Incident["updates"];
  incidentId: number;
  status: string;
}

function UpdateTimeline({ updates = [], incidentId, status }: UpdateTimelineProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateIncidentUpdateInput>({
    resolver: zodResolver(createIncidentUpdateSchema),
    defaultValues: { updateType: "update" },
  });

  const addUpdate = useMutation({
    mutationFn: async (data: CreateIncidentUpdateInput) => {
      const { data: result } = await axios.post(
        `/api/incidents/${incidentId}/updates`,
        data
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident", String(incidentId)] });
      reset();
    },
  });

  const isClosed = status === "closed";

  return (
    <div className="space-y-4">
      {/* Existing updates */}
      {updates.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No updates posted yet. Be the first to add a status update.
        </p>
      ) : (
        <ol className="space-y-3">
          {updates.map((u) => {
            const cls = UPDATE_TYPE_STYLES[u.updateType] ?? UPDATE_TYPE_STYLES.update;
            return (
              <li key={u.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <span className={`h-2 w-2 rounded-full border ${cls.replace("bg-", "border-")}`} />
                  <div className="w-px flex-1 bg-border mt-1" />
                </div>
                <div className="flex-1 pb-3 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cls}`}>
                      {incidentUpdateTypeLabel[u.updateType] ?? u.updateType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {u.author?.name ?? "System"} · {formatRelative(u.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{u.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Add update form */}
      {!isClosed && (
        <form
          onSubmit={handleSubmit((d) => addUpdate.mutate(d))}
          className="space-y-2 pt-2 border-t"
        >
          <div className="flex gap-2 items-center">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Post update</span>
          </div>

          <Controller
            name="updateType"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {incidentUpdateTypes.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {incidentUpdateTypeLabel[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <Textarea
            placeholder="What's the current status? Any workarounds? Impact updates?"
            rows={3}
            {...register("body")}
            className="text-sm"
          />
          {errors.body && <ErrorMessage message={errors.body.message} />}
          {addUpdate.error && (
            <ErrorAlert error={addUpdate.error} fallback="Failed to post update" />
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={addUpdate.isPending}>
              {addUpdate.isPending ? "Posting…" : "Post Update"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Commander / Assignment panel ───────────────────────────────────────────────

interface AssignmentPanelProps {
  incident: Incident;
}

function AssignmentPanel({ incident }: AssignmentPanelProps) {
  const queryClient = useQueryClient();
  const [editingCommander, setEditingCommander] = useState(false);
  const [commanderValue, setCommanderValue] = useState(incident.commander?.id ?? "none");

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: { id: string; name: string }[] }>("/api/agents");
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/incidents/${incident.id}`, patch);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident", String(incident.id)] });
      setEditingCommander(false);
    },
  });

  const isClosed = incident.status === "closed";

  return (
    <div className="space-y-3">
      {/* Commander */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
          Incident Commander
        </p>
        {editingCommander ? (
          <div className="flex items-center gap-2">
            <Select value={commanderValue} onValueChange={setCommanderValue}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {agentsData?.agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => {
                updateMutation.mutate({
                  commanderId: commanderValue === "none" ? null : commanderValue,
                });
              }}
              disabled={updateMutation.isPending}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => setEditingCommander(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              {incident.commander ? (
                <span className="font-medium">{incident.commander.name}</span>
              ) : (
                <span className="text-muted-foreground italic">Unassigned</span>
              )}
            </div>
            {!isClosed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => setEditingCommander(true)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Assigned agent */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
          Assigned Agent
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
            {incident.assignedTo ? (
              <span>{incident.assignedTo.name}</span>
            ) : (
              <span className="text-muted-foreground italic">Unassigned</span>
            )}
          </div>
          {!isClosed && (
            <Select
              value={incident.assignedTo?.id ?? "none"}
              onValueChange={(val) =>
                updateMutation.mutate({ assignedToId: val === "none" ? null : val })
              }
            >
              <SelectTrigger className="h-6 w-auto text-xs border-0 shadow-none text-muted-foreground">
                <Pencil className="h-3 w-3" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {agentsData?.agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lifecycle action buttons ───────────────────────────────────────────────────

function LifecycleActions({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();

  const transitionMutation = useMutation({
    mutationFn: async (status: IncidentStatus) => {
      const { data } = await axios.patch(`/api/incidents/${incident.id}`, { status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident", String(incident.id)] });
    },
  });

  const validNext = incidentStatusTransitions[incident.status as IncidentStatus] ?? [];

  const LABELS: Partial<Record<IncidentStatus, string>> = {
    acknowledged: "Acknowledge",
    in_progress:  "Mark In Progress",
    resolved:     "Mark Resolved",
    closed:       "Close Incident",
  };

  if (validNext.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {validNext.map((next) => (
        <Button
          key={next}
          size="sm"
          variant={next === "closed" ? "outline" : "default"}
          disabled={transitionMutation.isPending}
          onClick={() => transitionMutation.mutate(next)}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          {LABELS[next] ?? next}
        </Button>
      ))}
    </div>
  );
}

// ── Major incident toggle ────────────────────────────────────────────────────

function MajorIncidentToggle({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (isMajor: boolean) => {
      const { data } = await axios.patch(`/api/incidents/${incident.id}`, { isMajor });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident", String(incident.id)] });
    },
  });

  if (incident.status === "closed") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Flame className="h-3.5 w-3.5" />
        {incident.isMajor ? "Was major incident" : "Not major"}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="major-toggle"
        checked={incident.isMajor}
        onCheckedChange={(v) => mutation.mutate(v)}
        disabled={mutation.isPending}
      />
      <Label htmlFor="major-toggle" className="cursor-pointer flex items-center gap-1.5 text-sm">
        <Flame className={`h-3.5 w-3.5 ${incident.isMajor ? "text-destructive" : "text-muted-foreground"}`} />
        Major incident
      </Label>
    </div>
  );
}

// ── Event audit trail ────────────────────────────────────────────────────────

function EventTrail({ events = [] }: { events: Incident["events"] }) {
  if (!events || events.length === 0) return null;

  return (
    <ol className="space-y-1.5">
      {events.map((ev) => {
        const labelFn = EVENT_LABELS[ev.action];
        const label = labelFn ? labelFn(ev.meta) : ev.action.replace("incident.", "").replace(/_/g, " ");
        return (
          <li key={ev.id} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
            <span>
              <span className="text-foreground capitalize">{label}</span>
              {ev.actor && <> by {ev.actor.name}</>}
              {" · "}
              {formatDate(ev.createdAt)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Inline editable field ────────────────────────────────────────────────────

function InlineField({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string | number | null | undefined;
  onSave: (val: string | number | null) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </p>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 text-sm"
            placeholder={placeholder}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") { onSave(draft || null); setEditing(false); }
              if (e.key === "Escape") { setDraft(String(value ?? "")); setEditing(false); }
            }}
          />
          <Button size="sm" variant="ghost" className="h-7 px-2"
            onClick={() => { onSave(draft || null); setEditing(false); }}>
            <Save className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2"
            onClick={() => { setDraft(String(value ?? "")); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <button
          className="text-sm text-left hover:text-foreground/70 transition-colors group flex items-center gap-1.5"
          onClick={() => setEditing(true)}
        >
          {value !== null && value !== undefined && value !== "" ? (
            <span>{value}</span>
          ) : (
            <span className="text-muted-foreground italic">{placeholder ?? "—"}</span>
          )}
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      )}
    </div>
  );
}

// ── IncidentDetailPage ────────────────────────────────────────────────────────

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: incident, isLoading, error } = useQuery({
    queryKey: ["incident", id],
    queryFn: async () => {
      const { data } = await axios.get<Incident>(`/api/incidents/${id}`);
      return data;
    },
    refetchInterval: 30_000, // refresh every 30s — incidents are live
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/incidents/${id}`, patch);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incident", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !incident) {
    return <ErrorAlert error={error} fallback="Incident not found" />;
  }

  return (
    <div className="space-y-6">
      <BackLink to="/incidents">Back to incidents</BackLink>

      {/* Header */}
      <div>
        <div className="flex items-start gap-3 flex-wrap mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs font-semibold text-muted-foreground mb-1">
              {incident.incidentNumber}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight leading-snug">
              {incident.isMajor && (
                <Flame className="inline-block h-5 w-5 text-destructive mr-1.5 -mt-0.5" />
              )}
              {incident.title}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <IncidentPriorityBadge priority={incident.priority} />
            <IncidentStatusBadge status={incident.status} />
            {incident.slaStatus !== "completed" && (
              <SlaBadgeInline
                slaStatus={incident.slaStatus}
                minutesUntilBreach={incident.minutesUntilBreach}
              />
            )}
          </div>
        </div>

        {/* Description */}
        {incident.description && (
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
            {incident.description}
          </p>
        )}
      </div>

      {/* Lifecycle actions */}
      <LifecycleActions incident={incident} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main: update timeline */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Incident Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateTimeline
                updates={incident.updates}
                incidentId={incident.id}
                status={incident.status}
              />
            </CardContent>
          </Card>

          {/* Event audit trail (collapsed by default) */}
          {incident.events && incident.events.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <EventTrail events={incident.events} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Commander + assignment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Ownership</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentPanel incident={incident} />
            </CardContent>
          </Card>

          {/* Incident metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Major toggle */}
              <MajorIncidentToggle incident={incident} />

              {/* Priority */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Priority
                </p>
                <Select
                  value={incident.priority}
                  onValueChange={(val) =>
                    updateMutation.mutate({ priority: val as IncidentPriority })
                  }
                  disabled={incident.status === "closed"}
                >
                  <SelectTrigger className="h-8 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["p1", "p2", "p3", "p4"] as const).map((p) => (
                      <SelectItem key={p} value={p}>
                        {incidentPriorityLabel[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Affected system */}
              <InlineField
                label="Affected System"
                value={incident.affectedSystem}
                placeholder="e.g. Payment gateway"
                onSave={(val) => updateMutation.mutate({ affectedSystem: val })}
              />

              {/* Affected user count */}
              <InlineField
                label="Affected Users"
                value={incident.affectedUserCount}
                placeholder="0"
                onSave={(val) =>
                  updateMutation.mutate({
                    affectedUserCount: val !== null ? Number(val) : null,
                  })
                }
              />

              {/* Team */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Team
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {incident.team ? (
                    <span>{incident.team.name}</span>
                  ) : (
                    <span className="text-muted-foreground italic">No team</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SLA timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                SLA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Response deadline</span>
                <span className="text-foreground font-medium">
                  {incident.responseDeadline ? formatDate(incident.responseDeadline) : "—"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Resolution deadline</span>
                <span className="text-foreground font-medium">
                  {incident.resolutionDeadline ? formatDate(incident.resolutionDeadline) : "—"}
                </span>
              </div>
              {incident.acknowledgedAt && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Acknowledged</span>
                  <span className="text-foreground">{formatDate(incident.acknowledgedAt)}</span>
                </div>
              )}
              {incident.resolvedAt && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Resolved</span>
                  <span className="text-foreground">{formatDate(incident.resolvedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Affected CIs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Affected CIs</CardTitle>
            </CardHeader>
            <CardContent>
              <CiLinksPanel
                entityType="incidents"
                entityId={incident.id}
                linkedCis={incident.ciLinks ?? []}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ["incident", id] })}
              />
            </CardContent>
          </Card>

          {/* Problem Management */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <GitMerge className="h-3.5 w-3.5" />
                Problem Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                If this incident has a recurring root cause, promote it to a problem record for investigation.
              </p>
              <NewProblemDialog
                initialIncidentId={incident.id}
                initialTitle={incident.title}
                trigger={
                  <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full justify-center">
                    <GitMerge className="h-3.5 w-3.5" />
                    Promote to Problem
                  </button>
                }
              />
            </CardContent>
          </Card>

          {/* Created info */}
          <div className="text-xs text-muted-foreground space-y-1 px-1">
            <p>Created by {incident.createdBy?.name ?? "System"}</p>
            <p>{formatDate(incident.createdAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
