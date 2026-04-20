/**
 * NewProblemPage — full-page form for creating a new problem record.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, FormProvider, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { createProblemSchema, type CreateProblemInput } from "core/schemas/problems.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";
import { useFormConfig } from "@/hooks/useFormConfig";
import { useCustomFields } from "@/hooks/useCustomFields";
import DynamicCustomFields from "@/components/DynamicCustomFields";
import { AlertCircle, Save, X, LinkIcon, Search, Database } from "lucide-react";

interface Agent    { id: string; name: string }
interface Team     { id: number; name: string }
interface Incident { id: number; incidentNumber: string; title: string; status: string }
interface CiItem   { id: number; ciNumber: string; name: string; type: string }

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {children}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function FieldLabel({ htmlFor, required, children }: {
  htmlFor?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}

export default function NewProblemPage() {
  const navigate = useNavigate();

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
  });

  const { data: incidentsData } = useQuery({
    queryKey: ["incidents-list-light"],
    queryFn: async () => {
      const { data } = await axios.get<{ incidents: Incident[] }>("/api/incidents?pageSize=200");
      return data.incidents ?? [];
    },
  });

  const { data: cisData } = useQuery({
    queryKey: ["cmdb-all-for-link"],
    queryFn: async () => {
      const { data } = await axios.get<{ items: CiItem[] }>("/api/cmdb", {
        params: { pageSize: 100, sortBy: "name", sortOrder: "asc" },
      });
      return data.items;
    },
    staleTime: 60_000,
  });

  const [selectedCiIds, setSelectedCiIds] = useState<number[]>([]);
  const [ciSearch, setCiSearch] = useState("");

  const methods = useForm<CreateProblemInput>({
    resolver: zodResolver(createProblemSchema),
    defaultValues: { priority: "medium", linkedIncidentIds: [], customFields: {} },
  });
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = methods;

  const linkedIncidentIds = useWatch({ control, name: "linkedIncidentIds" }) ?? [];
  const cfg = useFormConfig("problem");
  const { data: customFieldDefs = [] } = useCustomFields("problem");

  const mutation = useMutation({
    mutationFn: async (data: CreateProblemInput) => {
      const { data: problem } = await axios.post("/api/problems", data);
      if (selectedCiIds.length > 0) {
        await Promise.all(
          selectedCiIds.map((ciId) =>
            axios.post(`/api/cmdb/links/problems/${problem.id}`, { ciId })
          )
        );
      }
      return problem;
    },
    onSuccess: (problem) => {
      void navigate(`/problems/${problem.id}`);
    },
  });

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* Header */}
      <div className="border-b bg-background px-6 py-3 shrink-0 sticky top-0 z-10">
        <BackLink to="/problems">All Problems</BackLink>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold">New Problem</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => navigate("/problems")} disabled={isSubmitting}>
              <X className="h-3.5 w-3.5" />Cancel
            </Button>
            <Button type="submit" form="new-problem-form" size="sm" className="h-8 text-xs gap-1.5"
              disabled={isSubmitting}>
              <Save className="h-3.5 w-3.5" />
              {isSubmitting ? "Creating…" : "Create Problem"}
            </Button>
          </div>
        </div>
      </div>

      {/* Form */}
      <FormProvider {...methods}>
      <form
        id="new-problem-form"
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full space-y-8"
      >
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback="Failed to create problem" />
        )}

        {/* Core */}
        <div>
          <SectionHeader>Problem Details</SectionHeader>
          <div className="space-y-4">
            {cfg.visible("title") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("title")}>{cfg.label("title")}</FieldLabel>
                <Input {...register("title")} placeholder={cfg.placeholder("title")} />
                {errors.title && <ErrorMessage message={errors.title.message} />}
              </div>
            )}
            {cfg.visible("description") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("description")}>{cfg.label("description")}</FieldLabel>
                <Textarea {...register("description")} placeholder={cfg.placeholder("description")} className="min-h-[100px] resize-y" />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Classification */}
        <div>
          <SectionHeader>Classification</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Priority</FieldLabel>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["low", "medium", "high", "urgent"].map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Affected Service (free text)</FieldLabel>
              <Input {...register("affectedService")} placeholder="e.g. Payment gateway, Auth service" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Assignment */}
        <div>
          <SectionHeader>Assignment</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Problem Manager (Owner)</FieldLabel>
              <Controller
                name="ownerId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}>
                    <SelectTrigger><SelectValue placeholder="Unowned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unowned</SelectItem>
                      {agentsData?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Assigned Analyst</FieldLabel>
              <Controller
                name="assignedToId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {agentsData?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <FieldLabel>Team</FieldLabel>
              <Controller
                name="teamId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}>
                    <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No team</SelectItem>
                      {teamsData?.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Investigation */}
        <div>
          <SectionHeader>Initial Investigation</SectionHeader>
          <div className="space-y-4">
            {cfg.visible("rootCause") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("rootCause")}>{cfg.label("rootCause")}</FieldLabel>
                <Textarea {...register("rootCause")} placeholder={cfg.placeholder("rootCause")} className="min-h-[90px] resize-y" />
              </div>
            )}
            {cfg.visible("workaround") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("workaround")}>{cfg.label("workaround")}</FieldLabel>
                <Textarea {...register("workaround")} placeholder={cfg.placeholder("workaround")} className="min-h-[90px] resize-y" />
              </div>
            )}
            {cfg.visible("linkedChangeRef") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("linkedChangeRef")}>{cfg.label("linkedChangeRef")}</FieldLabel>
                <Input {...register("linkedChangeRef")} placeholder={cfg.placeholder("linkedChangeRef")} />
              </div>
            )}
          </div>
        </div>

        {cfg.visible("linkedIncidentIds") && <Separator />}

        {/* Linked Incidents */}
        {cfg.visible("linkedIncidentIds") && <div>
          <SectionHeader>{cfg.label("linkedIncidentIds")}</SectionHeader>
          <p className="text-xs text-muted-foreground mb-4">
            Link one or more related incidents to this problem. Supports the workflow of
            promoting recurring incidents into a formal problem investigation.
          </p>
          <Controller
            name="linkedIncidentIds"
            control={control}
            render={({ field }) => {
              const selected = field.value ?? [];
              return (
                <div className="space-y-2">
                  {(incidentsData ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No open incidents available.</p>
                  ) : (
                    <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
                      {(incidentsData ?? []).map((inc) => {
                        const checked = selected.includes(inc.id);
                        return (
                          <label
                            key={inc.id}
                            className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                              checked ? "bg-primary/5" : "hover:bg-muted/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...selected, inc.id]
                                  : selected.filter((id) => id !== inc.id);
                                field.onChange(next);
                              }}
                              className="mt-0.5 accent-primary"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-mono text-muted-foreground">{inc.incidentNumber}</span>
                              <p className="text-sm truncate">{inc.title}</p>
                              <span className="text-[11px] text-muted-foreground capitalize">{inc.status.replace(/_/g, " ")}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selected.length > 0 && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <LinkIcon className="h-3 w-3" />
                      {selected.length} incident{selected.length !== 1 ? "s" : ""} will be linked
                    </p>
                  )}
                </div>
              );
            }}
          />
        </div>}

        <Separator />

        {/* Affected CIs */}
        <div>
          <SectionHeader>
            <Database className="h-3.5 w-3.5 inline mr-1.5" />
            Affected CIs
          </SectionHeader>
          <p className="text-xs text-muted-foreground mb-4">
            Select configuration items from the CMDB that are affected by this problem.
          </p>
          <div className="space-y-2">
            {/* Search */}
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={ciSearch}
                onChange={(e) => setCiSearch(e.target.value)}
                placeholder="Search CIs by name or number…"
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {/* CI list */}
            {(() => {
              const q = ciSearch.trim().toLowerCase();
              const visible = q
                ? (cisData ?? []).filter(
                    (ci) =>
                      ci.name.toLowerCase().includes(q) ||
                      ci.ciNumber.toLowerCase().includes(q)
                  )
                : (cisData ?? []);
              return (
                <>
                  {cisData === undefined ? (
                    <p className="text-sm text-muted-foreground py-2">Loading CIs…</p>
                  ) : visible.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      {q ? "No CIs match your search." : "No CIs available."}
                    </p>
                  ) : (
                    <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
                      {visible.map((ci) => {
                        const checked = selectedCiIds.includes(ci.id);
                        return (
                          <label
                            key={ci.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                              checked ? "bg-primary/5" : "hover:bg-muted/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedCiIds((prev) =>
                                  e.target.checked
                                    ? [...prev, ci.id]
                                    : prev.filter((id) => id !== ci.id)
                                )
                              }
                              className="mt-0.5 accent-primary shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-mono text-muted-foreground">{ci.ciNumber}</span>
                              <p className="text-sm truncate">{ci.name}</p>
                              <span className="text-[11px] text-muted-foreground capitalize">{ci.type.replace(/_/g, " ")}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedCiIds.length > 0 && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <LinkIcon className="h-3 w-3" />
                      {selectedCiIds.length} CI{selectedCiIds.length !== 1 ? "s" : ""} will be linked
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        <DynamicCustomFields fields={customFieldDefs} />

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 pb-8">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
            onClick={() => navigate("/problems")} disabled={isSubmitting}>
            <X className="h-3.5 w-3.5" />Cancel
          </Button>
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={isSubmitting}>
            <Save className="h-3.5 w-3.5" />
            {isSubmitting ? "Creating…" : "Create Problem"}
          </Button>
        </div>
      </form>
      </FormProvider>
    </div>
  );
}
