/**
 * NewTicketPage — full-page form for creating a new support ticket.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useForm, FormProvider, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { createTicketSchema, type CreateTicketInput } from "core/schemas/tickets.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityLabel } from "core/constants/ticket-severity.ts";
import { ticketImpacts, impactLabel } from "core/constants/ticket-impact.ts";
import { ticketUrgencies, urgencyLabel } from "core/constants/ticket-urgency.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/SearchableSelect";
import RichTextEditor from "@/components/RichTextEditor";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";
import { useFormConfig } from "@/hooks/useFormConfig";
import { useCustomFields } from "@/hooks/useCustomFields";
import DynamicCustomFields from "@/components/DynamicCustomFields";
import {
  TicketPlus,
  ArrowRight,
  X,
  User,
  AlertTriangle,
  Users,
  FileText,
  Tag,
  AlertCircle,
  Wrench,
  Bug,
  GitBranch,
  Ticket,
  MonitorSmartphone,
} from "lucide-react";

interface Agent { id: string; name: string }
interface Team  { id: number; name: string; color: string }
interface CustomTicketType { id: number; name: string; slug: string; color: string; isActive: boolean }

// ── Sub-components ────────────────────────────────────────────────────────────

function SidebarCard({
  icon: Icon,
  iconColor,
  title,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {title}
        </span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function FieldLabel({ htmlFor, required, children }: {
  htmlFor?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}

function FieldSelect<T extends string>({
  name, control, options, labelMap, placeholder, allowNone = true,
}: {
  name: keyof CreateTicketInput;
  control: ReturnType<typeof useForm<CreateTicketInput>>["control"];
  options: readonly T[];
  labelMap: Record<T, string>;
  placeholder: string;
  allowNone?: boolean;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <SearchableSelect
          value={(field.value as string | null) ?? "none"}
          onChange={(val) => field.onChange(val === "none" ? null : val)}
          options={[
            ...(allowNone ? [{ value: "none", label: "None" }] : []),
            ...options.map((o) => ({ value: o, label: labelMap[o] })),
          ]}
          placeholder={placeholder}
        />
      )}
    />
  );
}

// Ticket type definitions for the chip selector
const BUILTIN_TYPES = [
  { value: "none",           label: "General",         icon: Ticket,          color: "text-muted-foreground", ring: "ring-border", bg: "bg-muted/50",      active: "bg-primary/10 text-primary border-primary/40 ring-primary/20" },
  { value: "incident",       label: "Incident",        icon: AlertCircle,     color: "text-red-500",          ring: "ring-red-200 dark:ring-red-900", bg: "bg-red-500/5 hover:bg-red-500/10",      active: "bg-red-500/15 text-red-600 border-red-400/50 dark:text-red-400" },
  { value: "service_request",label: "Service Request", icon: Wrench,          color: "text-blue-500",         ring: "ring-blue-200 dark:ring-blue-900", bg: "bg-blue-500/5 hover:bg-blue-500/10",    active: "bg-blue-500/15 text-blue-600 border-blue-400/50 dark:text-blue-400" },
  { value: "problem",        label: "Problem",         icon: Bug,             color: "text-orange-500",       ring: "ring-orange-200 dark:ring-orange-900", bg: "bg-orange-500/5 hover:bg-orange-500/10", active: "bg-orange-500/15 text-orange-600 border-orange-400/50 dark:text-orange-400" },
  { value: "change_request", label: "Change Request",  icon: GitBranch,       color: "text-purple-500",       ring: "ring-purple-200 dark:ring-purple-900", bg: "bg-purple-500/5 hover:bg-purple-500/10", active: "bg-purple-500/15 text-purple-600 border-purple-400/50 dark:text-purple-400" },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export default function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cfg = useFormConfig("ticket");
  const { data: customFieldDefs = [] } = useCustomFields("ticket");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");

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

  const { data: customTicketTypesData } = useQuery({
    queryKey: ["ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get<{ ticketTypes: CustomTicketType[] }>("/api/ticket-types");
      return data.ticketTypes;
    },
  });
  const activeCustomTypes = (customTicketTypesData ?? []).filter((t) => t.isActive);

  const methods = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { body: "", customFields: {} },
  });
  const { register, handleSubmit, control, setValue, formState: { errors } } = methods;

  const handleBodyChange = useCallback((html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
    setValue("body", text, { shouldValidate: false });
  }, [setValue]);

  const selectedType = useWatch({ control, name: "ticketType" });
  const selectedCustomTypeId = useWatch({ control, name: "customTicketTypeId" });
  useWatch({ control, name: "customTicketTypeId" });

  const mutation = useMutation({
    mutationFn: async (data: CreateTicketInput) => {
      const { data: ticket } = await axios.post("/api/tickets", { ...data, body: bodyText, bodyHtml });
      return ticket;
    },
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void navigate(`/tickets/${ticket.id}`);
    },
  });

  // Resolve currently active type chip value
  const activeTypeValue = selectedCustomTypeId != null
    ? `custom_${selectedCustomTypeId}`
    : selectedType ?? "none";

  function handleTypeChipClick(v: string) {
    if (v === "none") {
      setValue("ticketType", null as any);
      setValue("customTicketTypeId", null);
    } else if (v.startsWith("custom_")) {
      setValue("ticketType", null as any);
      setValue("customTicketTypeId", parseInt(v.replace("custom_", ""), 10));
    } else {
      setValue("ticketType", v as any);
      setValue("customTicketTypeId", null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* ── Hero Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent px-6 py-4">
          <BackLink to="/tickets">All Tickets</BackLink>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
                <TicketPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">New Ticket</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create a support ticket and route it to your team
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => navigate("/tickets")}
                disabled={mutation.isPending}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                type="submit"
                form="new-ticket-form"
                size="sm"
                className="h-8 text-xs gap-1.5 shadow-sm"
                disabled={mutation.isPending || !bodyText.trim()}
              >
                {mutation.isPending ? "Creating…" : "Create Ticket"}
                {!mutation.isPending && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <FormProvider {...methods}>
        <form
          id="new-ticket-form"
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex-1 px-6 py-6 max-w-6xl mx-auto w-full"
        >
          {mutation.error && (
            <div className="mb-5">
              <ErrorAlert error={mutation.error} fallback="Failed to create ticket" />
            </div>
          )}

          <div className="flex gap-5 items-start">

            {/* ── Left: main content ──────────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Ticket Details card */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
                  <Tag className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Ticket Details
                  </span>
                </div>
                <div className="p-5 space-y-5">

                  {/* Type chip selector */}
                  {cfg.visible("ticketType") && (
                    <div className="space-y-2">
                      <FieldLabel required={cfg.required("ticketType")}>
                        {cfg.label("ticketType")}
                      </FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {BUILTIN_TYPES.map(({ value, label, icon: Icon, color, bg, active }) => {
                          const isActive = activeTypeValue === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => handleTypeChipClick(value)}
                              className={[
                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium",
                                "transition-all duration-150 cursor-pointer",
                                isActive
                                  ? `${active} shadow-sm ring-1`
                                  : `border-border ${bg} text-foreground/80 hover:text-foreground ring-0`,
                              ].join(" ")}
                            >
                              <Icon className={`h-3.5 w-3.5 ${isActive ? "" : color}`} />
                              {label}
                            </button>
                          );
                        })}
                        {/* Custom types as extra chips */}
                        {activeCustomTypes.map((t) => {
                          const v = `custom_${t.id}`;
                          const isActive = activeTypeValue === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => handleTypeChipClick(v)}
                              className={[
                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium",
                                "transition-all duration-150 cursor-pointer",
                                isActive
                                  ? "shadow-sm ring-1"
                                  : "border-border hover:bg-muted/50 text-foreground/80",
                              ].join(" ")}
                              style={isActive ? {
                                backgroundColor: `${t.color}1a`,
                                color: t.color,
                                borderColor: `${t.color}66`,
                              } : undefined}
                            >
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: t.color }}
                              />
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Subject */}
                  {cfg.visible("subject") && (
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="subject" required={cfg.required("subject")}>
                        {cfg.label("subject")}
                      </FieldLabel>
                      <Input
                        id="subject"
                        {...register("subject")}
                        placeholder={cfg.placeholder("subject") || "Brief summary of the issue…"}
                        className="h-10 text-sm font-medium"
                      />
                      {errors.subject && <ErrorMessage message={errors.subject.message} />}
                    </div>
                  )}

                  {/* Affected system (incident only) */}
                  {cfg.visible("affectedSystem") && selectedType === "incident" && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("affectedSystem")}>
                        <span className="flex items-center gap-1.5">
                          <MonitorSmartphone className="h-3 w-3 text-red-500/70" />
                          {cfg.label("affectedSystem")}
                        </span>
                      </FieldLabel>
                      <Input
                        {...register("affectedSystem")}
                        placeholder={cfg.placeholder("affectedSystem")}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Description card */}
              {cfg.visible("body") && (
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary/70" />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Description
                      </span>
                      {cfg.required("body") && (
                        <span className="text-destructive text-[10px]">required</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">
                      Supports rich text formatting
                    </span>
                  </div>
                  <div className="p-1">
                    <RichTextEditor
                      content={bodyHtml}
                      onChange={handleBodyChange}
                      placeholder={cfg.placeholder("body") || "Describe the issue in detail — include steps to reproduce, error messages, or any relevant context…"}
                      minHeight="220px"
                      className="border-0 rounded-none shadow-none focus-within:ring-0"
                    />
                  </div>
                  {mutation.isError && !bodyText.trim() && (
                    <p className="text-xs text-destructive px-5 pb-3">Description is required</p>
                  )}
                </div>
              )}

              {/* Custom fields */}
              <DynamicCustomFields fields={customFieldDefs} />

              {/* Footer actions */}
              <div className="flex items-center justify-end gap-2 py-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => navigate("/tickets")}
                  disabled={mutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-xs gap-1.5 shadow-sm"
                  disabled={mutation.isPending || !bodyText.trim()}
                >
                  {mutation.isPending ? "Creating…" : "Create Ticket"}
                  {!mutation.isPending && <ArrowRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* ── Right sidebar ───────────────────────────────────────────── */}
            <div className="w-72 shrink-0 space-y-4">

              {/* Requester */}
              {(cfg.visible("senderName") || cfg.visible("senderEmail")) && (
                <SidebarCard icon={User} iconColor="text-blue-500/80" title="Requester">
                  {cfg.visible("senderName") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("senderName")}>
                        {cfg.label("senderName")}
                      </FieldLabel>
                      <Input
                        {...register("senderName")}
                        placeholder={cfg.placeholder("senderName") || "Full name"}
                        className="h-8 text-xs"
                      />
                      {errors.senderName && <ErrorMessage message={errors.senderName.message} />}
                    </div>
                  )}
                  {cfg.visible("senderEmail") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("senderEmail")}>
                        {cfg.label("senderEmail")}
                      </FieldLabel>
                      <Input
                        type="email"
                        {...register("senderEmail")}
                        placeholder={cfg.placeholder("senderEmail") || "email@example.com"}
                        className="h-8 text-xs"
                      />
                      {errors.senderEmail && <ErrorMessage message={errors.senderEmail.message} />}
                    </div>
                  )}
                </SidebarCard>
              )}

              {/* Triage */}
              {(cfg.visible("priority") || cfg.visible("severity") || cfg.visible("impact") || cfg.visible("urgency")) && (
                <SidebarCard icon={AlertTriangle} iconColor="text-orange-500/80" title="Triage">
                  {cfg.visible("priority") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("priority")}>{cfg.label("priority")}</FieldLabel>
                      <FieldSelect name="priority" control={control} options={ticketPriorities}
                        labelMap={priorityLabel} placeholder={cfg.placeholder("priority")} />
                    </div>
                  )}
                  {cfg.visible("severity") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("severity")}>{cfg.label("severity")}</FieldLabel>
                      <FieldSelect name="severity" control={control} options={ticketSeverities}
                        labelMap={severityLabel} placeholder={cfg.placeholder("severity")} />
                    </div>
                  )}
                  {cfg.visible("impact") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("impact")}>{cfg.label("impact")}</FieldLabel>
                      <FieldSelect name="impact" control={control} options={ticketImpacts}
                        labelMap={impactLabel} placeholder={cfg.placeholder("impact")} />
                    </div>
                  )}
                  {cfg.visible("urgency") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("urgency")}>{cfg.label("urgency")}</FieldLabel>
                      <FieldSelect name="urgency" control={control} options={ticketUrgencies}
                        labelMap={urgencyLabel} placeholder={cfg.placeholder("urgency")} />
                    </div>
                  )}
                </SidebarCard>
              )}

              {/* Assignment & Category */}
              {(cfg.visible("category") || cfg.visible("assignedToId") || cfg.visible("teamId")) && (
                <SidebarCard icon={Users} iconColor="text-violet-500/80" title="Assignment">
                  {cfg.visible("category") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("category")}>{cfg.label("category")}</FieldLabel>
                      <FieldSelect name="category" control={control} options={ticketCategories}
                        labelMap={categoryLabel} placeholder={cfg.placeholder("category")} />
                    </div>
                  )}
                  {cfg.visible("assignedToId") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("assignedToId")}>{cfg.label("assignedToId")}</FieldLabel>
                      <Controller
                        name="assignedToId"
                        control={control}
                        render={({ field }) => (
                          <SearchableSelect
                            value={field.value ?? "unassigned"}
                            onChange={(v) => field.onChange(v === "unassigned" ? null : v)}
                            placeholder={cfg.placeholder("assignedToId") || "Unassigned"}
                            options={[
                              { value: "unassigned", label: "Unassigned" },
                              ...(agentsData ?? []).map((a) => ({ value: a.id, label: a.name })),
                            ]}
                          />
                        )}
                      />
                    </div>
                  )}
                  {cfg.visible("teamId") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("teamId")}>{cfg.label("teamId")}</FieldLabel>
                      <Controller
                        name="teamId"
                        control={control}
                        render={({ field }) => (
                          <SearchableSelect
                            value={field.value != null ? String(field.value) : "none"}
                            onChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                            placeholder={cfg.placeholder("teamId") || "No team"}
                            options={[
                              { value: "none", label: "No team" },
                              ...(teamsData ?? []).map((t) => ({ value: String(t.id), label: t.name })),
                            ]}
                          />
                        )}
                      />
                    </div>
                  )}
                </SidebarCard>
              )}

            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
