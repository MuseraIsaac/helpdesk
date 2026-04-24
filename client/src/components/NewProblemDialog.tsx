import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { createProblemSchema, type CreateProblemInput } from "core/schemas/problems.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface Team {
  id: number;
  name: string;
}

interface NewProblemDialogProps {
  /** Pre-populate with an incident ID for the "promote to problem" workflow */
  initialIncidentId?: number;
  /** Pre-populate title from the incident */
  initialTitle?: string;
  /** Custom trigger element — defaults to a "New Problem" button */
  trigger?: React.ReactNode;
}

export default function NewProblemDialog({
  initialIncidentId,
  initialTitle,
  trigger,
}: NewProblemDialogProps = {}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
    enabled: open,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateProblemInput>({
    resolver: zodResolver(createProblemSchema),
    defaultValues: {
      priority: "medium",
      linkedIncidentIds: initialIncidentId ? [initialIncidentId] : [],
      title: initialTitle ?? "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateProblemInput) => {
      const { data: problem } = await axios.post("/api/problems", data);
      return problem;
    },
    onSuccess: (problem) => {
      setOpen(false);
      reset();
      navigate(`/problems/${problem.id}`);
    },
  });

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            New Problem
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialIncidentId ? "Promote Incident to Problem" : "New Problem"}
          </DialogTitle>
        </DialogHeader>

        <form
          id="new-problem-form"
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="space-y-4 py-2"
        >
          {createMutation.error && (
            <ErrorAlert error={createMutation.error} fallback="Failed to create problem" />
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Brief description of the underlying issue"
              {...register("title")}
            />
            {errors.title && <ErrorMessage message={errors.title.message} />}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What is the recurring issue? What symptoms have been observed?"
              rows={3}
              {...register("description")}
            />
          </div>

          {/* Priority + Affected service */}
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="affectedService">Affected Service / CI</Label>
              <Input
                id="affectedService"
                placeholder="e.g. Payment gateway, Auth service"
                {...register("affectedService")}
              />
            </div>
          </div>

          {/* Owner + Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Problem Manager (Owner)</Label>
              <Controller
                name="ownerId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unowned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unowned</SelectItem>
                      {agentsData?.map((a) => (
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
              <Label>Assigned Analyst</Label>
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
                      {agentsData?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Team */}
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
                    {teamsData?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Initial RCA */}
          <div className="space-y-1.5">
            <Label htmlFor="rootCause">Root Cause (initial hypothesis)</Label>
            <Textarea
              id="rootCause"
              placeholder="Describe the suspected root cause. This can be refined later."
              rows={2}
              {...register("rootCause")}
            />
          </div>

          {/* Workaround */}
          <div className="space-y-1.5">
            <Label htmlFor="workaround">Workaround</Label>
            <Textarea
              id="workaround"
              placeholder="Document any known workaround for affected users."
              rows={2}
              {...register("workaround")}
            />
          </div>

          {/* Linked change ref */}
          <div className="space-y-1.5">
            <Label htmlFor="linkedChangeRef">Linked Change Reference</Label>
            <Input
              id="linkedChangeRef"
              placeholder="e.g. CHG-0042"
              {...register("linkedChangeRef")}
            />
          </div>

          {/* Linked incident IDs — hidden if pre-set via initialIncidentId */}
          {initialIncidentId && (
            <div className="rounded-md border border-amber-200 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              Incident #{initialIncidentId} will be linked to this problem automatically.
            </div>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-problem-form"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating…" : "Create Problem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
