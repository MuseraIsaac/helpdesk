import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  CI_TYPE_LABEL, CI_ENVIRONMENT_LABEL, CI_CRITICALITY_LABEL, CI_STATUS_LABEL,
  CI_RELATIONSHIP_LABEL, CI_RELATIONSHIP_TYPES, CI_CRITICALITY_COLOR,
  CI_TYPES, CI_ENVIRONMENTS, CI_CRITICALITIES, CI_STATUSES,
  type CiDetail, type CiRelationship,
} from "core/constants/cmdb.ts";
import { updateCiSchema, addCiRelationshipSchema, type UpdateCiInput, type AddCiRelationshipInput } from "core/schemas/cmdb.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import AssetLinksPanel from "@/components/AssetLinksPanel";
import {
  Pencil, Save, X, Plus, Trash2, ArrowRight, ArrowLeft, Activity, Server
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active:         "default",
  maintenance:    "outline",
  planned:        "secondary",
  retired:        "secondary",
  decommissioned: "secondary",
};

const EVENT_LABELS: Record<string, (meta: Record<string, unknown>) => string> = {
  "ci.created":              (m) => `Created as ${m.type ?? "CI"}`,
  "ci.updated":              (m) => `Updated fields: ${(m.fields as string[] | undefined)?.join(", ") ?? ""}`,
  "ci.status_changed":       (m) => `Status: ${CI_STATUS_LABEL[m.from as string] ?? m.from} → ${CI_STATUS_LABEL[m.to as string] ?? m.to}`,
  "ci.criticality_changed":  (m) => `Criticality: ${CI_CRITICALITY_LABEL[m.from as string] ?? m.from} → ${CI_CRITICALITY_LABEL[m.to as string] ?? m.to}`,
  "ci.relationship_added":   (m) => `Relationship added: ${CI_RELATIONSHIP_LABEL[m.type as string] ?? m.type} → ${m.toCiName ?? m.toCiId}`,
  "ci.relationship_removed": (m) => `Relationship removed (rel #${m.relId})`,
  "ci.linked_to_incident":   (m) => `Linked to incident #${m.incidentId}`,
  "ci.linked_to_problem":    (m) => `Linked to problem #${m.problemId}`,
};

// ── Inline editable field ─────────────────────────────────────────────────────

function InlineField({
  label,
  value,
  placeholder,
  onSave,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  onSave: (val: string | null) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? "");

  function handleSave() {
    onSave(draft.trim() || null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        {multiline ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder={placeholder}
            autoFocus
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 text-sm"
            placeholder={placeholder}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          />
        )}
        <div className="flex gap-1 mt-1">
          <Button size="sm" className="h-6 text-xs px-2" onClick={handleSave}><Save className="h-3 w-3 mr-1" />Save</Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-start gap-1">
        <p className={`text-sm flex-1 ${!value ? "text-muted-foreground italic" : ""}`}>
          {value ?? placeholder ?? "—"}
        </p>
        <button
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Add relationship form ─────────────────────────────────────────────────────

interface AddRelFormProps {
  ciId: number;
  onAdded: () => void;
}

function AddRelationshipForm({ ciId, onAdded }: AddRelFormProps) {
  const [open, setOpen] = useState(false);
  const [ciSearch, setCiSearch] = useState("");

  const { data: searchResults } = useQuery({
    queryKey: ["cmdb-search", ciSearch],
    queryFn: async () => {
      const { data } = await axios.get<{ items: Array<{ id: number; ciNumber: string; name: string }> }>(
        "/api/cmdb",
        { params: { search: ciSearch, pageSize: 8, status: "" } }
      );
      return data.items;
    },
    enabled: ciSearch.length >= 1,
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<AddCiRelationshipInput>({
    resolver: zodResolver(addCiRelationshipSchema),
    defaultValues: { type: "depends_on" },
  });

  const mutation = useMutation({
    mutationFn: async (data: AddCiRelationshipInput) => {
      await axios.post(`/api/cmdb/${ciId}/relationships`, data);
    },
    onSuccess: () => { onAdded(); setOpen(false); reset(); setCiSearch(""); },
  });

  if (!open) {
    return (
      <button
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Add relationship
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="rounded-md border p-3 space-y-3">
      {mutation.error && <ErrorAlert error={mutation.error} fallback="Failed to add relationship" />}

      <div className="space-y-1.5">
        <Label className="text-xs">Relationship type</Label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CI_RELATIONSHIP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{CI_RELATIONSHIP_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Target CI <span className="text-destructive">*</span></Label>
        <Input
          placeholder="Search for a CI…"
          value={ciSearch}
          onChange={(e) => setCiSearch(e.target.value)}
          className="h-8 text-sm"
        />
        {ciSearch.length >= 1 && searchResults && (
          <div className="rounded border divide-y max-h-36 overflow-y-auto">
            {searchResults.filter((c) => c.id !== ciId).map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="radio"
                  value={c.id}
                  {...register("toCiId", { valueAsNumber: true })}
                  className="accent-primary"
                />
                <span className="font-medium">{c.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{c.ciNumber}</span>
              </label>
            ))}
            {searchResults.filter((c) => c.id !== ciId).length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No CIs found</p>
            )}
          </div>
        )}
        {errors.toCiId && <ErrorMessage message={errors.toCiId.message} />}
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={mutation.isPending} className="h-7 text-xs">
          {mutation.isPending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpen(false); reset(); setCiSearch(""); }}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CmdbDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: ci, isLoading, error } = useQuery({
    queryKey: ["ci", id],
    queryFn: async () => {
      const { data } = await axios.get<CiDetail>(`/api/cmdb/${id}`);
      return data;
    },
  });

  function refresh() { qc.invalidateQueries({ queryKey: ["ci", id] }); }

  const patchMutation = useMutation({
    mutationFn: async (patch: UpdateCiInput) => {
      await axios.patch(`/api/cmdb/${id}`, patch);
    },
    onSuccess: refresh,
  });

  const deleteRelMutation = useMutation({
    mutationFn: async (relId: number) => {
      await axios.delete(`/api/cmdb/${id}/relationships/${relId}`);
    },
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      <BackLink to="/cmdb">Back to CMDB</BackLink>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <ErrorAlert
          message={
            axios.isAxiosError(error) && error.response?.status === 404
              ? "Configuration item not found"
              : "Failed to load CI"
          }
        />
      )}

      {ci && (
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <p className="font-mono text-[11px] font-semibold text-muted-foreground">{ci.ciNumber}</p>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">{ci.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {CI_TYPE_LABEL[ci.type]} · {CI_ENVIRONMENT_LABEL[ci.environment]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${CI_CRITICALITY_COLOR[ci.criticality]}`}>
                  {CI_CRITICALITY_LABEL[ci.criticality]}
                </span>
                <Badge variant={STATUS_VARIANT[ci.status] ?? "secondary"}>
                  {CI_STATUS_LABEL[ci.status]}
                </Badge>
              </div>
            </div>
          </div>

          {patchMutation.error && (
            <ErrorAlert error={patchMutation.error} fallback="Failed to update CI" />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            {/* Main */}
            <div className="space-y-5">
              {/* Description */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <InlineField
                    label=""
                    value={ci.description}
                    placeholder="Add a description…"
                    multiline
                    onSave={(val) => patchMutation.mutate({ description: val })}
                  />
                </CardContent>
              </Card>

              {/* Relationships */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Relationships</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ci.relationships.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No relationships defined</p>
                  )}
                  {ci.relationships.map((rel) => (
                    <div
                      key={rel.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      {rel.direction === "outbound" ? (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground w-28 shrink-0">
                        {CI_RELATIONSHIP_LABEL[rel.type]}
                        {rel.direction === "inbound" ? " (inbound)" : ""}
                      </span>
                      <Link
                        to={`/cmdb/${rel.ci.id}`}
                        className="flex-1 font-medium hover:underline truncate"
                      >
                        {rel.ci.name}
                      </Link>
                      <span className="text-[10px] font-mono text-muted-foreground">{rel.ci.ciNumber}</span>
                      <Badge variant={STATUS_VARIANT[rel.ci.status] ?? "secondary"} className="text-[10px] shrink-0">
                        {CI_STATUS_LABEL[rel.ci.status]}
                      </Badge>
                      <button
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        onClick={() => deleteRelMutation.mutate(rel.id)}
                        disabled={deleteRelMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <AddRelationshipForm ciId={ci.id} onAdded={refresh} />
                </CardContent>
              </Card>

              {/* Linked Assets */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    Linked Assets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AssetLinksPanel
                    entityType="ci"
                    entityId={ci.id}
                  />
                </CardContent>
              </Card>

              {/* Activity log */}
              {ci.events.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />
                      Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {ci.events.map((ev) => {
                        const labelFn = EVENT_LABELS[ev.action];
                        const label = labelFn
                          ? labelFn(ev.meta as Record<string, unknown>)
                          : ev.action;
                        return (
                          <div key={ev.id} className="flex items-start gap-2 py-1 text-xs">
                            <span className="text-muted-foreground shrink-0 mt-0.5">
                              {formatDate(ev.createdAt)}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span className="font-medium shrink-0">{ev.actor?.name ?? "System"}</span>
                            <span className="text-muted-foreground">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Type + Env */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Classification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Type</p>
                    <Select
                      value={ci.type}
                      onValueChange={(v) => patchMutation.mutate({ type: v as any })}
                    >
                      <SelectTrigger className="h-8 text-sm w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CI_TYPES.map((t) => <SelectItem key={t} value={t}>{CI_TYPE_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Environment</p>
                    <Select
                      value={ci.environment}
                      onValueChange={(v) => patchMutation.mutate({ environment: v as any })}
                    >
                      <SelectTrigger className="h-8 text-sm w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CI_ENVIRONMENTS.map((e) => <SelectItem key={e} value={e}>{CI_ENVIRONMENT_LABEL[e]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Criticality</p>
                    <Select
                      value={ci.criticality}
                      onValueChange={(v) => patchMutation.mutate({ criticality: v as any })}
                    >
                      <SelectTrigger className="h-8 text-sm w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CI_CRITICALITIES.map((c) => <SelectItem key={c} value={c}>{CI_CRITICALITY_LABEL[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                    <Select
                      value={ci.status}
                      onValueChange={(v) => patchMutation.mutate({ status: v as any })}
                    >
                      <SelectTrigger className="h-8 text-sm w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CI_STATUSES.map((s) => <SelectItem key={s} value={s}>{CI_STATUS_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Ownership */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Ownership</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Owner</p>
                    <p>{ci.owner?.name ?? <span className="text-muted-foreground italic">Unassigned</span>}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Support Team</p>
                    <p>{ci.team?.name ?? <span className="text-muted-foreground italic">No team</span>}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Tags */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  {ci.tags.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No tags</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ci.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Metadata */}
              <div className="text-xs text-muted-foreground space-y-1 px-1">
                <p>Created {formatDate(ci.createdAt)}</p>
                <p>Updated {formatDate(ci.updatedAt)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
