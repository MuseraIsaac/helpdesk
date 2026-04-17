import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { createRequestSchema, type CreateRequestInput } from "core/schemas/requests.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { Plus, Trash2 } from "lucide-react";

interface Agent {
  id: string;
  name: string;
}

interface Team {
  id: number;
  name: string;
}

export default function NewRequestDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data;
    },
    enabled: open,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data;
    },
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: {
      priority: "medium",
      requiresApproval: false,
      formData: {},
      items: [],
    },
  });

  const { fields: itemFields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const requiresApproval = watch("requiresApproval");

  const createMutation = useMutation({
    mutationFn: async (data: CreateRequestInput) => {
      const { data: request } = await axios.post("/api/requests", data);
      return request;
    },
    onSuccess: (request) => {
      setOpen(false);
      reset();
      navigate(`/requests/${request.id}`);
    },
  });

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1.5" />
          New Request
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Service Request</DialogTitle>
        </DialogHeader>

        <form
          id="new-request-form"
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="space-y-4 py-2"
        >
          {createMutation.error && (
            <ErrorAlert error={createMutation.error} fallback="Failed to create request" />
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Brief description of what is needed"
              {...register("title")}
            />
            {errors.title && <ErrorMessage message={errors.title.message} />}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide details about the request, justification, and any relevant context"
              rows={3}
              {...register("description")}
            />
          </div>

          {/* Catalog item name + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="catalogItemName">Service / Catalog Item</Label>
              <Input
                id="catalogItemName"
                placeholder="e.g. Laptop provisioning, VPN access"
                {...register("catalogItemName")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
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
          </div>

          {/* Assignment */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Controller
                name="assignedToId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
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
              />
            </div>
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Controller
                name="teamId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No team</SelectItem>
                      {teamsData?.teams.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input id="dueDate" type="datetime-local" {...register("dueDate")} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Request Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  append({ name: "", quantity: 1, formData: {} })
                }
              >
                <Plus className="h-3 w-3 mr-1" />
                Add item
              </Button>
            </div>
            {itemFields.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
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
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        placeholder="Unit"
                        {...register(`items.${index}.unit`)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Requires Approval */}
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center gap-3">
              <Controller
                name="requiresApproval"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="requiresApproval"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="requiresApproval" className="cursor-pointer">
                Requires approval before fulfillment
              </Label>
            </div>

            {requiresApproval && (
              <div className="space-y-1.5">
                <Label>Select Approvers <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground">
                  Select one or more agents who must approve this request before fulfillment begins.
                </p>
                {/* Approver picker — multi-select checkboxes */}
                <Controller
                  name="approverIds"
                  control={control}
                  render={({ field }) => (
                    <div className="space-y-1">
                      {agentsData?.agents.map((a) => {
                        const selected = field.value?.includes(a.id) ?? false;
                        return (
                          <label
                            key={a.id}
                            className={`flex items-center gap-2 rounded p-1.5 cursor-pointer text-sm transition-colors ${
                              selected
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted"
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
                {errors.approverIds && (
                  <ErrorMessage message={errors.approverIds.message} />
                )}
              </div>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-request-form"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Submitting…" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
