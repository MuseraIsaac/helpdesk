/**
 * NewChangeDialog — modal form to create a new change request.
 *
 * Minimal required fields: title. Optional: changeType, risk, priority, description.
 * On success navigates to the new change detail page.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createChangeSchema,
  type CreateChangeInput,
} from "core/schemas/changes.ts";
import {
  changeTypes,
  changeTypeLabel,
  changeRisks,
  changeRiskLabel,
} from "core/constants/change.ts";
import { ticketPriorities } from "core/constants/ticket-priority.ts";
import { priorityLabel } from "core/constants/ticket-priority.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { GitMerge, Plus } from "lucide-react";
import type { Change } from "core/constants/change.ts";

export default function NewChangeDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateChangeInput>({
    resolver: zodResolver(createChangeSchema),
    defaultValues: {
      changeType: "normal",
      risk: "medium",
      priority: "medium",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateChangeInput) => {
      const { data: change } = await axios.post<Change>("/api/changes", data);
      return change;
    },
    onSuccess: (change) => {
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
      setOpen(false);
      reset();
      void navigate(`/changes/${change.id}`);
    },
  });

  function onOpen() {
    reset({ changeType: "normal", risk: "medium", priority: "medium" });
    setOpen(true);
  }

  return (
    <>
      <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onOpen}>
        <Plus className="h-3.5 w-3.5" />
        New Change
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <GitMerge className="h-4 w-4" />
              New Change Request
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            {mutation.error && (
              <ErrorAlert error={mutation.error} fallback="Failed to create change request" />
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("title")}
                placeholder="Brief summary of the change…"
                className="text-sm"
                autoFocus
              />
              {errors.title && <ErrorMessage message={errors.title.message} />}
            </div>

            {/* Type / Risk / Priority row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Type</Label>
                <Controller
                  name="changeType"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {changeTypes.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {changeTypeLabel[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Risk</Label>
                <Controller
                  name="risk"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {changeRisks.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">
                            {changeRiskLabel[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Priority</Label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ticketPriorities.map((p) => (
                          <SelectItem key={p} value={p} className="text-xs">
                            {priorityLabel[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                {...register("description")}
                placeholder="High-level description of the change and its intent…"
                className="text-sm min-h-[90px] resize-y"
              />
            </div>

            <DialogFooter className="gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs gap-1.5"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating…" : "Create Change Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
