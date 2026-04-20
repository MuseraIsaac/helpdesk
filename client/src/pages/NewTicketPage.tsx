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
import { Separator } from "@/components/ui/separator";
import SearchableSelect from "@/components/SearchableSelect";
import RichTextEditor from "@/components/RichTextEditor";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";
import { useFormConfig } from "@/hooks/useFormConfig";
import { useCustomFields } from "@/hooks/useCustomFields";
import DynamicCustomFields from "@/components/DynamicCustomFields";
import { Ticket, Save, X } from "lucide-react";

interface Agent { id: string; name: string }
interface Team  { id: number; name: string; color: string }
interface CustomTicketType { id: number; name: string; slug: string; color: string; isActive: boolean }

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
  const selectOptions = [
    ...(allowNone ? [{ value: "none", label: "None" }] : []),
    ...options.map((o) => ({ value: o, label: labelMap[o] })),
  ];
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <SearchableSelect
          value={(field.value as string | null) ?? "none"}
          onChange={(val) => field.onChange(val === "none" ? null : val)}
          options={selectOptions}
          placeholder={placeholder}
        />
      )}
    />
  );
}

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
  useWatch({ control, name: "customTicketTypeId" }); // re-render Select when custom type changes

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

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* Header */}
      <div className="border-b bg-background px-6 py-3 shrink-0 sticky top-0 z-10">
        <BackLink to="/tickets">All Tickets</BackLink>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold">New Ticket</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => navigate("/tickets")} disabled={mutation.isPending}>
              <X className="h-3.5 w-3.5" />Cancel
            </Button>
            <Button type="submit" form="new-ticket-form" size="sm" className="h-8 text-xs gap-1.5"
              disabled={mutation.isPending || !bodyText.trim()}>
              <Save className="h-3.5 w-3.5" />
              {mutation.isPending ? "Creating Ticket…" : "Create Ticket"}
            </Button>
          </div>
        </div>
      </div>

      {/* Form */}
      <FormProvider {...methods}>
      <form
        id="new-ticket-form"
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full space-y-8"
      >
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback="Failed to create ticket" />
        )}

        {/* Type + Subject */}
        <div>
          <SectionHeader>Ticket Details</SectionHeader>
          <div className="space-y-4">
            {cfg.visible("ticketType") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("ticketType")}>{cfg.label("ticketType")}</FieldLabel>
                <Controller
                  name="ticketType"
                  control={control}
                  render={({ field }) => (
                    <SearchableSelect
                      value={
                        methods.getValues("customTicketTypeId") != null
                          ? `custom_${methods.getValues("customTicketTypeId")}`
                          : (field.value as string | null) ?? "none"
                      }
                      onChange={(v) => {
                        if (v === "none") {
                          field.onChange(null);
                          setValue("customTicketTypeId", null);
                        } else if (v.startsWith("custom_")) {
                          field.onChange(null);
                          setValue("customTicketTypeId", parseInt(v.replace("custom_", ""), 10));
                        } else {
                          field.onChange(v);
                          setValue("customTicketTypeId", null);
                        }
                      }}
                      placeholder={cfg.placeholder("ticketType") || "Generic (untyped)"}
                      options={[
                        { value: "none", label: "Generic (untyped)" },
                        ...ticketTypes.map((t) => ({ value: t, label: ticketTypeLabel[t] })),
                        ...activeCustomTypes.map((t) => ({ value: `custom_${t.id}`, label: t.name })),
                      ]}
                    />
                  )}
                />
              </div>
            )}

            {cfg.visible("subject") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("subject")}>{cfg.label("subject")}</FieldLabel>
                <Input {...register("subject")} placeholder={cfg.placeholder("subject")} />
                {errors.subject && <ErrorMessage message={errors.subject.message} />}
              </div>
            )}

            {cfg.visible("affectedSystem") && selectedType === "incident" && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("affectedSystem")}>{cfg.label("affectedSystem")}</FieldLabel>
                <Input {...register("affectedSystem")} placeholder={cfg.placeholder("affectedSystem")} />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Sender */}
        <div>
          <SectionHeader>Requester</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            {cfg.visible("senderName") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("senderName")}>{cfg.label("senderName")}</FieldLabel>
                <Input {...register("senderName")} placeholder={cfg.placeholder("senderName")} />
                {errors.senderName && <ErrorMessage message={errors.senderName.message} />}
              </div>
            )}
            {cfg.visible("senderEmail") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("senderEmail")}>{cfg.label("senderEmail")}</FieldLabel>
                <Input type="email" {...register("senderEmail")} placeholder={cfg.placeholder("senderEmail")} />
                {errors.senderEmail && <ErrorMessage message={errors.senderEmail.message} />}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Triage */}
        <div>
          <SectionHeader>Triage</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>

        <Separator />

        {/* Assignment & Category */}
        <div>
          <SectionHeader>Assignment &amp; Category</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-1.5 col-span-2">
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
          </div>
        </div>

        <Separator />

        {/* Description */}
        {cfg.visible("body") && (
          <div>
            <SectionHeader>Description</SectionHeader>
            <div className="space-y-1.5">
              <FieldLabel required={cfg.required("body")}>{cfg.label("body")}</FieldLabel>
              <RichTextEditor
                content={bodyHtml}
                onChange={handleBodyChange}
                placeholder={cfg.placeholder("body")}
                minHeight="180px"
              />
              {mutation.isError && !bodyText.trim() && (
                <p className="text-sm text-destructive">Description is required</p>
              )}
            </div>
          </div>
        )}

        <DynamicCustomFields fields={customFieldDefs} />

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 pb-8">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
            onClick={() => navigate("/tickets")} disabled={mutation.isPending}>
            <X className="h-3.5 w-3.5" />Cancel
          </Button>
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5"
            disabled={mutation.isPending || !bodyText.trim()}>
            <Save className="h-3.5 w-3.5" />
            {mutation.isPending ? "Creating Ticket…" : "Create Ticket"}
          </Button>
        </div>
      </form>
      </FormProvider>
    </div>
  );
}
