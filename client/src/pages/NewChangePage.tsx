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
import {
  GitMerge,
  X,
  FileText,
  Layers,
  BarChart2,
  Users,
  Server,
  CalendarClock,
  ClipboardList,
  ShieldCheck,
  FolderTree,
  Bell,
  Info,
} from "lucide-react";
import type { Change } from "core/constants/change.ts";

// ── Section card shell ────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/50 bg-muted/30">
        <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="px-5 py-5">{children}</div>
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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-1">{children}</p>;
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
  const { register, handleSubmit, control, formState: { errors } } = methods;
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

  const isPending = mutation.isPending;

  function onCancel() { void navigate("/changes"); }

  // ── Submit button (shared between header + footer) ────────────────────────

  const SubmitButton = () => (
    <Button
      type="submit"
      form="new-change-form"
      disabled={isPending}
      className="gap-2 px-5 shadow-sm"
    >
      {isPending ? (
        <>
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin shrink-0" />
          Creating Change Request…
        </>
      ) : (
        <>
          <GitMerge className="h-3.5 w-3.5" />
          Create Change Request
        </>
      )}
    </Button>
  );

  return (
    <div className="flex flex-col min-h-full bg-muted/20">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm shadow-sm">
        <div className="px-6 py-3">
          <BackLink to="/changes">All Changes</BackLink>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <GitMerge className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight">New Change Request</h1>
                <p className="text-xs text-muted-foreground">Submit for CAB review and approval</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isPending}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <SubmitButton />
            </div>
          </div>
        </div>
      </div>

      {/* ── Form body ── */}
      <FormProvider {...methods}>
        <form
          id="new-change-form"
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full space-y-5"
        >
          {mutation.error && (
            <ErrorAlert error={mutation.error} fallback="Failed to create change request" />
          )}

          {/* 1 · Basic Information */}
          <Section icon={FileText} title="Basic Information">
            <div className="space-y-4">
              {cfg.visible("title") && (
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="title" required={cfg.required("title")}>
                    {cfg.label("title")}
                  </FieldLabel>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder={cfg.placeholder("title")}
                    autoFocus
                  />
                  {errors.title && <ErrorMessage message={errors.title.message} />}
                </div>
              )}

              {cfg.visible("description") && (
                <div className="space-y-1.5">
                  <FieldLabel required={cfg.required("description")}>
                    {cfg.label("description")}
                  </FieldLabel>
                  <Textarea
                    {...register("description")}
                    placeholder={cfg.placeholder("description")}
                    className="min-h-[100px] resize-y"
                  />
                </div>
              )}

              <div className="flex items-start gap-2.5 rounded-lg border border-blue-200/60 bg-blue-50/50 px-4 py-3 text-sm">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-blue-700/90 text-[13px]">
                  <span className="font-medium">Requested by</span> will be automatically set to you.
                  Use <span className="font-medium">Assigned To</span> below to delegate implementation.
                </p>
              </div>
            </div>
          </Section>

          {/* 2 · Classification */}
          <Section icon={Layers} title="Classification">
            <div className="grid grid-cols-2 gap-4">
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

              <div className="space-y-1.5">
                <FieldLabel>Risk Level</FieldLabel>
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
          </Section>

          {/* 3 · Priority & Impact */}
          <Section icon={BarChart2} title="Priority & Impact">
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
          </Section>

          {/* 4 · Assignment */}
          <Section icon={Users} title="Assignment">
            <div className="grid grid-cols-2 gap-4">
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
                      <SelectTrigger><SelectValue placeholder="Not linked to a problem" /></SelectTrigger>
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
                <Hint>Link this change to an existing problem record it resolves or addresses.</Hint>
              </div>
            </div>
          </Section>

          {/* 5 · Affected Service & CI */}
          <Section icon={Server} title="Affected Service & Configuration Item">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel>Service (from catalog)</FieldLabel>
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
                <Hint>Or enter a service name manually:</Hint>
                <Input
                  {...register("serviceName")}
                  placeholder="e.g. Payment Gateway, Core Banking"
                  className="h-9 text-sm"
                />
              </div>

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
          </Section>

          {/* 6 · Change Window */}
          <Section icon={CalendarClock} title="Change Window">
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
          </Section>

          {/* 7 · Planning Documents */}
          <Section icon={ClipboardList} title="Planning Documents">
            <div className="space-y-5">
              {cfg.visible("justification") && (
                <div className="space-y-1.5">
                  <FieldLabel required={cfg.required("justification")}>
                    {cfg.label("justification")}
                  </FieldLabel>
                  <Textarea
                    {...register("justification")}
                    placeholder={cfg.placeholder("justification")}
                    className="min-h-[100px] resize-y"
                  />
                </div>
              )}
              {cfg.visible("workInstructions") && (
                <div className="space-y-1.5">
                  <FieldLabel required={cfg.required("workInstructions")}>
                    {cfg.label("workInstructions")}
                  </FieldLabel>
                  <Textarea
                    {...register("workInstructions")}
                    placeholder={cfg.placeholder("workInstructions")}
                    className="min-h-[120px] resize-y"
                  />
                </div>
              )}
              {cfg.visible("serviceImpactAssessment") && (
                <div className="space-y-1.5">
                  <FieldLabel required={cfg.required("serviceImpactAssessment")}>
                    {cfg.label("serviceImpactAssessment")}
                  </FieldLabel>
                  <Textarea
                    {...register("serviceImpactAssessment")}
                    placeholder={cfg.placeholder("serviceImpactAssessment")}
                    className="min-h-[100px] resize-y"
                  />
                </div>
              )}
              {cfg.visible("rollbackPlan") && (
                <div className="space-y-1.5">
                  <FieldLabel required={cfg.required("rollbackPlan")}>
                    {cfg.label("rollbackPlan")}
                  </FieldLabel>
                  <Textarea
                    {...register("rollbackPlan")}
                    placeholder={cfg.placeholder("rollbackPlan")}
                    className="min-h-[100px] resize-y"
                  />
                </div>
              )}
              {cfg.visible("riskAssessmentAndMitigation") && (
                <div className="space-y-1.5">
                  <FieldLabel required={cfg.required("riskAssessmentAndMitigation")}>
                    {cfg.label("riskAssessmentAndMitigation")}
                  </FieldLabel>
                  <Textarea
                    {...register("riskAssessmentAndMitigation")}
                    placeholder={cfg.placeholder("riskAssessmentAndMitigation")}
                    className="min-h-[100px] resize-y"
                  />
                </div>
              )}
            </div>
          </Section>

          {/* 8 · Pre & Post Checks */}
          <Section icon={ShieldCheck} title="Pre & Post Checks">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel>Pre-checks</FieldLabel>
                <Textarea
                  {...register("prechecks")}
                  placeholder="Validation steps to confirm the environment is ready before starting…"
                  className="min-h-[120px] resize-y"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Post-checks</FieldLabel>
                <Textarea
                  {...register("postchecks")}
                  placeholder="Validation steps to confirm the change was applied successfully…"
                  className="min-h-[120px] resize-y"
                />
              </div>
            </div>
          </Section>

          {/* 9 · Categorization */}
          <Section icon={FolderTree} title="Categorization">
            <Hint>
              Use tiers to classify this change within your service taxonomy.
              Tier 1 is the top-level domain; Tiers 2 and 3 are sub-classifications.
            </Hint>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="space-y-1.5">
                <FieldLabel>Tier 1</FieldLabel>
                <Input {...register("categorizationTier1")} placeholder="e.g. Infrastructure" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Tier 2</FieldLabel>
                <Input {...register("categorizationTier2")} placeholder="e.g. Network" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Tier 3</FieldLabel>
                <Input {...register("categorizationTier3")} placeholder="e.g. Firewall" />
              </div>
            </div>
          </Section>

          {/* 10 · Notification & Communication */}
          <Section icon={Bell} title="Notification & Communication">
            <div className="space-y-5">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
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
                  <Label htmlFor="notificationRequired" className="cursor-pointer text-sm font-medium">
                    Stakeholder notification required for this change
                  </Label>
                </div>

                {notificationRequired && (
                  <div className="space-y-1.5 pt-1">
                    <FieldLabel>Impacted Users / Stakeholders</FieldLabel>
                    <Textarea
                      {...register("impactedUsers")}
                      placeholder="List the teams, users, or customer groups affected and how they will be notified…"
                      className="min-h-[90px] resize-y"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Communication Notes</FieldLabel>
                <Textarea
                  {...register("communicationNotes")}
                  placeholder="Planned communications, announcement drafts, notification timelines, escalation contacts…"
                  className="min-h-[100px] resize-y"
                />
              </div>
            </div>
          </Section>

          <DynamicCustomFields fields={customFieldDefs} />

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-10">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isPending}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <SubmitButton />
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
