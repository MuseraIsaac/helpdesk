import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { createIncidentSchema, type CreateIncidentInput } from "core/schemas/incidents.ts";
import { incidentPriorities, incidentPriorityLabel } from "core/constants/incident-priority.ts";
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
import { Plus } from "lucide-react";

interface Agent {
  id: string;
  name: string;
}

export default function NewIncidentDialog() {
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

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateIncidentInput>({
    resolver: zodResolver(createIncidentSchema),
    defaultValues: { priority: "p3", isMajor: false },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateIncidentInput) => {
      const { data: incident } = await axios.post("/api/incidents", data);
      return incident;
    },
    onSuccess: (incident) => {
      setOpen(false);
      reset();
      navigate(`/incidents/${incident.id}`);
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
          New Incident
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Declare Incident</DialogTitle>
        </DialogHeader>

        <form
          id="new-incident-form"
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="space-y-4 py-2"
        >
          {createMutation.error && (
            <ErrorAlert error={createMutation.error} fallback="Failed to create incident" />
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Brief description of the incident"
              {...register("title")}
            />
            {errors.title && <ErrorMessage message={errors.title.message} />}
          </div>

          {/* Priority + Major */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>
                Priority <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {incidentPriorities.map((p) => (
                        <SelectItem key={p} value={p}>
                          {incidentPriorityLabel[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex items-center gap-2 pb-0.5">
              <Controller
                name="isMajor"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="isMajor"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="isMajor" className="cursor-pointer">
                Major incident
              </Label>
            </div>
          </div>

          {/* Affected system */}
          <div className="space-y-1.5">
            <Label htmlFor="affectedSystem">Affected System</Label>
            <Input
              id="affectedSystem"
              placeholder="e.g. Payment gateway, Auth service"
              {...register("affectedSystem")}
            />
          </div>

          {/* Affected user count */}
          <div className="space-y-1.5">
            <Label htmlFor="affectedUserCount">Affected Users (approx.)</Label>
            <Input
              id="affectedUserCount"
              type="number"
              min={0}
              placeholder="0"
              {...register("affectedUserCount", { valueAsNumber: true })}
            />
          </div>

          {/* Commander */}
          <div className="space-y-1.5">
            <Label>Incident Commander</Label>
            <Controller
              name="commanderId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? "none"}
                  onValueChange={(val) => field.onChange(val === "none" ? undefined : val)}
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

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What is happening? Who is affected? What is the business impact?"
              rows={4}
              {...register("description")}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-incident-form"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Declaring..." : "Declare Incident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
