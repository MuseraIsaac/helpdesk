/**
 * NewRequestPage — full-page form for creating a new service request.
 */

import { useNavigate } from "react-router";
import { useForm, FormProvider, Controller, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { createRequestSchema, type CreateRequestInput } from "core/schemas/requests.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Inbox, Save, X, Plus, Trash2 } from "lucide-react";

interface Agent { id: string; name: string }
interface Team  { id: number; name: string }

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

export default function NewRequestPage() {
  const navigate = useNavigate();
  const cfg = useFormConfig("request");
  const { data: customFieldDefs = [] } = useCustomFields("request");

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

  const methods = useForm<CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: { priority: "medium", requiresApproval: false, formData: {}, items: [], customFields: {} },
  });
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = methods;

  const { fields: itemFields, append, remove } = useFieldArray({ control, name: "items" });
  const requiresApproval = useWatch({ control, name: "requiresApproval" });

  const mutation = useMutation({
    mutationFn: async (data: CreateRequestInput) => {
      const { data: request } = await axios.post("/api/requests", data);
      return request;
    },
    onSuccess: (request) => {
      void navigate(`/requests/${request.id}`);
    },
  });

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* Header */}
      <div className="border-b bg-background px-6 py-3 shrink-0 sticky top-0 z-10">
        <BackLink to="/requests">All Requests</BackLink>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold">New Service Request</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => navigate("/requests")} disabled={isSubmitting}>
              <X className="h-3.5 w-3.5" />Cancel
            </Button>
            <Button type="submit" form="new-request-form" size="sm" className="h-8 text-xs gap-1.5"
              disabled={isSubmitting}>
              <Save className="h-3.5 w-3.5" />
              {isSubmitting ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </div>
      </div>

      {/* Form */}
      <FormProvider {...methods}>
      <form
        id="new-request-form"
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full space-y-8"
      >
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback="Failed to create request" />
        )}

        {/* Core */}
        <div>
          <SectionHeader>Request Details</SectionHeader>
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
                <Textarea {...register("description")}
                  placeholder={cfg.placeholder("description")}
                  className="min-h-[100px] resize-y" />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Service & Priority */}
        <div>
          <SectionHeader>Classification</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            {cfg.visible("catalogItemName") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("catalogItemName")}>{cfg.label("catalogItemName")}</FieldLabel>
                <Input {...register("catalogItemName")} placeholder={cfg.placeholder("catalogItemName")} />
              </div>
            )}
            {cfg.visible("priority") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("priority")}>{cfg.label("priority")}</FieldLabel>
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
            )}
          </div>
        </div>

        <Separator />

        {/* Assignment */}
        <div>
          <SectionHeader>Assignment</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            {cfg.visible("assignedToId") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("assignedToId")}>{cfg.label("assignedToId")}</FieldLabel>
                <Controller
                  name="assignedToId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}>
                      <SelectTrigger><SelectValue placeholder={cfg.placeholder("assignedToId")} /></SelectTrigger>
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
            )}
            {cfg.visible("teamId") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("teamId")}>{cfg.label("teamId")}</FieldLabel>
                <Controller
                  name="teamId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value != null ? String(field.value) : "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}>
                      <SelectTrigger><SelectValue placeholder={cfg.placeholder("teamId")} /></SelectTrigger>
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
            )}
            {cfg.visible("dueDate") && (
              <div className="space-y-1.5">
                <FieldLabel required={cfg.required("dueDate")}>{cfg.label("dueDate")}</FieldLabel>
                <Input type="datetime-local" {...register("dueDate")} />
              </div>
            )}
          </div>
        </div>

        {cfg.visible("items") && <Separator />}

        {/* Items */}
        {cfg.visible("items") && <div>
          <SectionHeader>{cfg.label("items")}</SectionHeader>
          <div className="space-y-3">
            {itemFields.length > 0 && (
              <div className="space-y-2 rounded-md border p-4">
                {itemFields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Input
                        placeholder="Item name"
                        {...register(`items.${index}.name`)}
                        className="h-8 text-sm"
                      />
                      {errors.items?.[index]?.name && (
                        <ErrorMessage message={errors.items[index]?.name?.message} />
                      )}
                    </div>
                    <div className="w-20">
                      <Input type="number" min={1} placeholder="Qty"
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        className="h-8 text-sm" />
                    </div>
                    <div className="w-24">
                      <Input placeholder="Unit" {...register(`items.${index}.unit`)} className="h-8 text-sm" />
                    </div>
                    <Button type="button" variant="ghost" size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(index)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => append({ name: "", quantity: 1, formData: {} })}>
              <Plus className="h-3 w-3" />Add item
            </Button>
          </div>
        </div>}

        {cfg.visible("requiresApproval") && <Separator />}

        {/* Approval */}
        {cfg.visible("requiresApproval") && <div>
          <SectionHeader>Approval</SectionHeader>
          <div className="rounded-md border p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Controller
                name="requiresApproval"
                control={control}
                render={({ field }) => (
                  <Switch id="requiresApproval" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <Label htmlFor="requiresApproval" className="cursor-pointer text-sm">
                Requires approval before fulfillment
              </Label>
            </div>

            {requiresApproval && (
              <div className="space-y-2">
                <FieldLabel required>Select Approvers</FieldLabel>
                <p className="text-xs text-muted-foreground">
                  Select one or more agents who must approve this request before fulfillment begins.
                </p>
                <Controller
                  name="approverIds"
                  control={control}
                  render={({ field }) => (
                    <div className="space-y-1">
                      {agentsData?.map((a) => {
                        const selected = field.value?.includes(a.id) ?? false;
                        return (
                          <label
                            key={a.id}
                            className={`flex items-center gap-2 rounded p-1.5 cursor-pointer text-sm transition-colors ${
                              selected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...(field.value ?? []), a.id]
                                  : (field.value ?? []).filter((id) => id !== a.id);
                                field.onChange(next);
                              }}
                              className="accent-primary"
                            />
                            {a.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.approverIds && <ErrorMessage message={errors.approverIds.message} />}
              </div>
            )}
          </div>
        </div>}

        <DynamicCustomFields fields={customFieldDefs} />

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 pb-8">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5"
            onClick={() => navigate("/requests")} disabled={isSubmitting}>
            <X className="h-3.5 w-3.5" />Cancel
          </Button>
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={isSubmitting}>
            <Save className="h-3.5 w-3.5" />
            {isSubmitting ? "Submitting…" : "Submit Request"}
          </Button>
        </div>
      </form>
      </FormProvider>
    </div>
  );
}
