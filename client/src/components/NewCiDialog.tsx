import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { createCiSchema, type CreateCiInput } from "core/schemas/cmdb.ts";
import {
  CI_TYPES, CI_ENVIRONMENTS, CI_CRITICALITIES, CI_STATUSES,
  CI_TYPE_LABEL, CI_ENVIRONMENT_LABEL, CI_CRITICALITY_LABEL, CI_STATUS_LABEL,
} from "core/constants/cmdb.ts";
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
import { Plus, X } from "lucide-react";

interface Agent { id: string; name: string; }
interface Team  { id: number; name: string; }

interface Props {
  /** Called with the new CI id after successful creation. */
  onCreated?: (id: number) => void;
  /** Defaults to a "New CI" button if not provided. */
  trigger?: React.ReactNode;
}

export default function NewCiDialog({ onCreated, trigger }: Props = {}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

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
    setValue,
    formState: { errors },
  } = useForm<CreateCiInput>({
    resolver: zodResolver(createCiSchema),
    defaultValues: {
      type:        "server",
      environment: "production",
      criticality: "medium",
      status:      "active",
      tags:        [],
    },
  });

  const tags = watch("tags");

  const mutation = useMutation({
    mutationFn: async (data: CreateCiInput) => {
      const { data: ci } = await axios.post<{ id: number }>("/api/cmdb", data);
      return ci;
    },
    onSuccess: (ci) => {
      setOpen(false);
      reset();
      setTagInput("");
      if (onCreated) {
        onCreated(ci.id);
      } else {
        navigate(`/cmdb/${ci.id}`);
      }
    },
  });

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) { reset(); setTagInput(""); }
  }

  function addTag(e: React.KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag) && tags.length < 20) {
      setValue("tags", [...tags, tag]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setValue("tags", tags.filter((t) => t !== tag));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            New CI
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Configuration Item</DialogTitle>
        </DialogHeader>

        <form
          id="new-ci-form"
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="space-y-4 py-2"
        >
          {mutation.error && (
            <ErrorAlert error={mutation.error} fallback="Failed to create CI" />
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="ci-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ci-name"
              placeholder="e.g. prod-db-01, Payment API, Core Switch"
              {...register("name")}
            />
            {errors.name && <ErrorMessage message={errors.name.message} />}
          </div>

          {/* Type + Environment */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CI_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{CI_TYPE_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Controller
                name="environment"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CI_ENVIRONMENTS.map((e) => (
                        <SelectItem key={e} value={e}>{CI_ENVIRONMENT_LABEL[e]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Criticality + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Criticality</Label>
              <Controller
                name="criticality"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CI_CRITICALITIES.map((c) => (
                        <SelectItem key={c} value={c}>{CI_CRITICALITY_LABEL[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CI_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{CI_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Owner + Team */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Controller
                name="ownerId"
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
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Support Team</Label>
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
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ci-desc">Description</Label>
            <Textarea
              id="ci-desc"
              placeholder="Purpose, location, dependencies, configuration notes…"
              rows={3}
              {...register("description")}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 min-h-9 rounded-md border px-3 py-2 cursor-text"
              onClick={() => document.getElementById("ci-tag-input")?.focus()}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs rounded px-2 py-0.5"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                id="ci-tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={addTag}
                placeholder={tags.length === 0 ? "Add tags (press Enter or comma)…" : ""}
                className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground">Press Enter or comma to add a tag. Max 20 tags.</p>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="new-ci-form" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create CI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
