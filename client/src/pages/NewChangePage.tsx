/**
 * NewChangePage — full-page form for creating a new change request.
 *
 * Replaces the minimal NewChangeDialog. Captures all planning fields up-front
 * so the change record is ready for CAB review immediately after creation.
 */

import { useNavigate } from "react-router";
import { useForm, FormProvider, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { createChangeSchema, type CreateChangeInput } from "core/schemas/changes.ts";
import {
  changeTypes,
  changeTypeLabel,
  changeModels,
  changeModelLabel,
  changeRisks,
  changeRiskLabel,
  changePurposes,
  changePurposeLabel,
} from "core/constants/change.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketImpacts, impactLabel } from "core/constants/ticket-impact.ts";
import { ticketUrgencies, urgencyLabel } from "core/constants/ticket-urgency.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
import { GitMerge, Save, X } from "lucide-react";
import type { Change } from "core/constants/change.ts";

// ── Shared sub-components ─────────────────────────────────────────────────────

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

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}

interface Agent { id: string; name: string }
interface Team  { id: number; name: string; color: string }
interface CatalogItem { id: number; name: string }
interface ConfigItem  { id: number; name: string; ciNumber: string }
interface Problem     { id: number; problemNumber: string; title: string }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewChangePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Reference data ──────────────────────────────────────────────────────────

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

  const { data: catalogData } = useQuery({
    queryKey: ["catalog-items-light"],
    queryFn: async () => {
      const { data } = await axios.get<{ catalog: { name: string; items: CatalogItem[] }[] }>("/api/catalog");
      return data.catalog.flatMap((g) => g.items);
    },
  });

  const { data: ciData } = useQuery({
    queryKey: ["ci-list-light"],
    queryFn: async () => {
      const { data } = await axios.get<{ items: ConfigItem[] }>("/api/cmdb?pageSize=200");
      return data.items ?? [];
    },
  });

  const { data: problemsData } = useQuery({
    queryKey: ["problems-list-light"],
    queryFn: async () => {
      const { data } = await axios.get<{ problems: Problem[] }>("/api/problems?pageSize=200");
      return data.problems ?? [];
    },
  });

  // ── Form ────────────────────────────────────────────────────────────────────

  const methods = useForm<CreateChangeInput>({
    resolver: zodResolver(createChangeSchema),
    defaultValues: {
      changeType:  "normal",
      changeModel: "normal_change",
      risk:        "medium",
      priority:    "medium",
      impact:      "medium",
      urgency:     "medium",
      customFields: {},
    },
  });
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = methods;

  const notificationRequired = useWatch({ control, name: "notificationRequired" });
  const cfg = useFormConfig("change");
  const { data: customFieldDefs = [] } = useCustomFields("change");

  const mutation = useMutation({
    mutationFn: async (data: CreateChangeInput) => {
      const { data: change } = await axios.post<Change>("/api/changes", data);
      return change;
    },
    onSuccess: (change) => {
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
      void navigate(`/changes/${change.id}`);
    },
  });

  function onCancel() {
    void navigate("/changes");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* ── Header ── */}
      <div className="border-b bg-background px-6 py-3 shrink-0 sticky top-0 z-10">
        <BackLink to="/changes">All Changes</BackLink>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold">New Change Request</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={onCancel} disabled={isSubmitting}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-change-form"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={isSubmitting}
            >
              <Save className="h-3.5 w-3.5" />
              {isSubmitting ? "Creating…" : "Create Change Request"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <FormProvider {...methods}>
      <form
        id="new-change-form"
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="flex-1 px-6 py-6 max-w-4xl mx-auto w-full space-y-8"
      >
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback="Failed to create change request" />
        )}

        {/* ── 1. Basic Information ── */}
        <div>
          <SectionHeader>Basic Information</SectionHeader>
          <div className="space-y-4">

            {/* Title */}
            {cfg.visible("title") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("title")}>{cfg.label("title")}</FieldLabel>
                <Input {...register("title")} placeholder={cfg.placeholder("title")} autoFocus />
                {errors.title && <ErrorMessage message={errors.title.message} />}
              </div>
            )}

            {/* Description */}
            {cfg.visible("description") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("description")}>{cfg.label("description")}</FieldLabel>
                <Textarea {...register("description")} placeholder={cfg.placeholder("description")} className="min-h-[100px] resize-y" />
              </div>
            )}

            {/* Requested by — informational; server sets this to the logged-in user */}
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Requested by</span> will be automatically set to
              the logged-in agent. Use the <span className="font-medium text-foreground">Assigned To</span> field
              below to delegate implementation to another agent.
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 2. Classification ── */}
        <div>
          <SectionHeader>Classification</SectionHeader>
          <div className="grid grid-cols-2 gap-4">

            {/* Change Type */}
            <div className="space-y-1.5">
              <FieldLabel>Change Type</FieldLabel>
              <Controller
                name="changeType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {changeTypes.map((t) => (
                        <SelectItem key={t} value={t}>{changeTypeLabel[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Change Model */}
            <div className="space-y-1.5">
              <FieldLabel>Change Model</FieldLabel>
              <Controller
                name="changeModel"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {changeModels.map((m) => (
                        <SelectItem key={m} value={m}>{changeModelLabel[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Change Purpose */}
            <div className="space-y-1.5">
              <FieldLabel>Change Purpose</FieldLabel>
              <Controller
                name="changePurpose"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select purpose…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {changePurposes.map((p) => (
                        <SelectItem key={p} value={p}>{changePurposeLabel[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Risk */}
            <div className="space-y-1.5">
              <FieldLabel>Risk</FieldLabel>
              <Controller
                name="risk"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {changeRisks.map((r) => (
                        <SelectItem key={r} value={r}>{changeRiskLabel[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 3. Priority, Impact, Urgency ── */}
        <div>
          <SectionHeader>Priority &amp; Impact</SectionHeader>
          <div className="grid grid-cols-3 gap-4">

            <div className="space-y-1.5">
              <FieldLabel>Priority</FieldLabel>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ticketPriorities.map((p) => (
                        <SelectItem key={p} value={p}>{priorityLabel[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Impact</FieldLabel>
              <Controller
                name="impact"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ticketImpacts.map((i) => (
                        <SelectItem key={i} value={i}>{impactLabel[i]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Urgency</FieldLabel>
              <Controller
                name="urgency"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ticketUrgencies.map((u) => (
                        <SelectItem key={u} value={u}>{urgencyLabel[u]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 4. Assignment ── */}
        <div>
          <SectionHeader>Assignment</SectionHeader>
          <div className="grid grid-cols-2 gap-4">

            {/* Coordinator Group */}
            <div className="space-y-1.5">
              <FieldLabel>Coordinator Group</FieldLabel>
              <Controller
                name="coordinatorGroupId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No group</SelectItem>
                      {teamsData?.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Assigned To */}
            <div className="space-y-1.5">
              <FieldLabel>Assigned To</FieldLabel>
              <Controller
                name="assignedToId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
                  >
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

            {/* Linked Problem */}
            <div className="space-y-1.5 col-span-2">
              <FieldLabel>Linked Problem Record</FieldLabel>
              <Controller
                name="linkedProblemId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="None — not linked to a problem" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {(problemsData ?? []).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.problemNumber} — {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Link this change to an existing problem record it resolves or addresses.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 5. Affected Service & CI ── */}
        <div>
          <SectionHeader>Affected Service &amp; Configuration Item</SectionHeader>
          <div className="grid grid-cols-2 gap-4">

            {/* Service */}
            <div className="space-y-1.5">
              <FieldLabel>Service</FieldLabel>
              <Controller
                name="serviceId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select service…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(catalogData ?? []).map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">Or type service name manually:</p>
              <Input
                {...register("serviceName")}
                placeholder="e.g. Payment Gateway, Core Banking"
                className="h-8 text-sm"
              />
            </div>

            {/* Configuration Item */}
            <div className="space-y-1.5">
              <FieldLabel>Configuration Item</FieldLabel>
              <Controller
                name="configurationItemId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select CI…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(ciData ?? []).map((ci) => (
                        <SelectItem key={ci.id} value={String(ci.id)}>
                          {ci.ciNumber} — {ci.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 6. Change Window ── */}
        <div>
          <SectionHeader>Change Window</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Planned Start</FieldLabel>
              <Input
                type="datetime-local"
                {...register("plannedStart", {
                  setValueAs: (v: string) => v ? new Date(v).toISOString() : undefined,
                })}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Planned End</FieldLabel>
              <Input
                type="datetime-local"
                {...register("plannedEnd", {
                  setValueAs: (v: string) => v ? new Date(v).toISOString() : undefined,
                })}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 7. Planning Documents ── */}
        <div>
          <SectionHeader>Planning Documents</SectionHeader>
          <div className="space-y-5">
            {cfg.visible("justification") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("justification")}>{cfg.label("justification")}</FieldLabel>
                <Textarea {...register("justification")} placeholder={cfg.placeholder("justification")} className="min-h-[100px] resize-y" />
              </div>
            )}
            {cfg.visible("workInstructions") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("workInstructions")}>{cfg.label("workInstructions")}</FieldLabel>
                <Textarea {...register("workInstructions")} placeholder={cfg.placeholder("workInstructions")} className="min-h-[120px] resize-y" />
              </div>
            )}
            {cfg.visible("serviceImpactAssessment") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("serviceImpactAssessment")}>{cfg.label("serviceImpactAssessment")}</FieldLabel>
                <Textarea {...register("serviceImpactAssessment")} placeholder={cfg.placeholder("serviceImpactAssessment")} className="min-h-[100px] resize-y" />
              </div>
            )}
            {cfg.visible("rollbackPlan") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("rollbackPlan")}>{cfg.label("rollbackPlan")}</FieldLabel>
                <Textarea {...register("rollbackPlan")} placeholder={cfg.placeholder("rollbackPlan")} className="min-h-[100px] resize-y" />
              </div>
            )}
            {cfg.visible("riskAssessmentAndMitigation") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("riskAssessmentAndMitigation")}>{cfg.label("riskAssessmentAndMitigation")}</FieldLabel>
                <Textarea {...register("riskAssessmentAndMitigation")} placeholder={cfg.placeholder("riskAssessmentAndMitigation")} className="min-h-[100px] resize-y" />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* ── 8. Checks ── */}
        <div>
          <SectionHeader>Pre &amp; Post Checks</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Pre-checks</FieldLabel>
              <Textarea
                {...register("prechecks")}
                placeholder="Validation steps to confirm the environment is ready before starting the change window…"
                className="min-h-[120px] resize-y"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Post-checks</FieldLabel>
              <Textarea
                {...register("postchecks")}
                placeholder="Validation steps to confirm the change was applied successfully and services are operating normally…"
                className="min-h-[120px] resize-y"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 9. Categorization ── */}
        <div>
          <SectionHeader>Categorization</SectionHeader>
          <p className="text-xs text-muted-foreground mb-4">
            Use categorization tiers to classify this change within your service taxonomy.
            Tier 1 is the top-level domain; Tier 2 and 3 are sub-classifications.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Category Tier 1</FieldLabel>
              <Input
                {...register("categorizationTier1")}
                placeholder="e.g. Infrastructure"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Category Tier 2</FieldLabel>
              <Input
                {...register("categorizationTier2")}
                placeholder="e.g. Network"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Category Tier 3</FieldLabel>
              <Input
                {...register("categorizationTier3")}
                placeholder="e.g. Firewall"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── 10. Notification & Communication ── */}
        <div>
          <SectionHeader>Notification &amp; Communication</SectionHeader>
          <div className="space-y-5">
            <div className="rounded-md border p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Controller
                  name="notificationRequired"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="notificationRequired"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="notificationRequired" className="cursor-pointer text-sm">
                  Stakeholder notification required for this change
                </Label>
              </div>

              {notificationRequired && (
                <div className="space-y-1.5">
                  <FieldLabel>Impacted Users / Stakeholders</FieldLabel>
                  <Textarea
                    {...register("impactedUsers")}
                    placeholder="List the teams, users, or customer groups affected by this change and how they will be notified…"
                    className="min-h-[90px] resize-y"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Communication Notes</FieldLabel>
              <Textarea
                {...register("communicationNotes")}
                placeholder="Planned communications, announcement drafts, notification timelines, escalation contacts, and any approval or review communication…"
                className="min-h-[100px] resize-y"
              />
            </div>
          </div>
        </div>

        <DynamicCustomFields fields={customFieldDefs} />

        {/* ── Footer actions (duplicate for convenience) ── */}
        <div className="flex items-center justify-end gap-2 pt-2 pb-8">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
            onClick={onCancel} disabled={isSubmitting}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={isSubmitting}>
            <Save className="h-3.5 w-3.5" />
            {isSubmitting ? "Creating…" : "Create Change Request"}
          </Button>
        </div>
      </form>
      </FormProvider>
    </div>
  );
}
